// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UpsideConfig} from "./UpsideConfig.sol";
import {CallBook} from "./CallBook.sol";

/// @title FollowVault
/// @notice A follower's own vault. It buys on a call, sells on close, and pays the caller a share of the
///         follower's cumulative net gain with that caller above a high-water mark. A follower who is still
///         net down with a caller pays that caller nothing.
/// @dev Deployed as a minimal clone by VaultFactory. Spot only: long calls on pairs quoted in the
///      settlement token (AUSD).
contract FollowVault is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    struct Position {
        uint256 callId;
        address caller;
        address base;
        uint256 baseAmount;
        uint256 cost; // settlement token spent, fees included
        bool open;
    }

    address public owner;
    UpsideConfig public config;

    /// @notice Most settlement token this vault may have at risk across open positions. 0 blocks follows.
    uint256 public maxExposure;
    uint256 public openCost;

    Position[] internal _positions;
    mapping(address => uint256) public lockedBase; // base tokens backing open positions
    mapping(address => int256) public netPnl; // cumulative realized PnL per caller
    mapping(address => int256) public highWater; // fee already charged up to this level

    event ExposureSet(uint256 maxExposure);
    event Followed(
        uint256 indexed positionId, uint256 indexed callId, address indexed caller, uint256 amountIn, uint256 baseOut
    );
    event Closed(
        uint256 indexed positionId,
        uint256 indexed callId,
        address indexed caller,
        uint256 proceeds,
        int256 pnl,
        uint256 callerFee,
        uint256 protocolFee
    );
    event Withdrawn(address indexed token, uint256 amount, address to);

    error NotOwner();
    error CallNotActive();
    error ShortNotSupported();
    error WrongQuote();
    error OverExposure();
    error RouterNotAllowed();
    error SwapFailed(bytes reason);
    error Slippage();
    error Overspent();
    error PositionClosed();
    error Locked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, UpsideConfig config_, uint256 maxExposure_) external initializer {
        owner = owner_;
        config = config_;
        maxExposure = maxExposure_;
        emit ExposureSet(maxExposure_);
    }

    // ----------------------------------------------------------------- owner actions

    function setMaxExposure(uint256 maxExposure_) external onlyOwner {
        maxExposure = maxExposure_;
        emit ExposureSet(maxExposure_);
    }

    /// @notice Buy the call's base token with `amountIn` settlement token through an allowlisted router.
    /// @param data calldata from the router's quote API (e.g. Kuru Flow), built with this vault as the user.
    function follow(uint256 callId, uint256 amountIn, address router, bytes calldata data, uint256 minBaseOut)
        external
        onlyOwner
        nonReentrant
        returns (uint256 positionId)
    {
        CallBook book = config.callBook();
        if (!book.isActive(callId)) revert CallNotActive();
        CallBook.Call memory c = book.getCall(callId);
        if (c.side != CallBook.Side.Long) revert ShortNotSupported();
        address settlement = config.settlementToken();
        if (c.quote != settlement) revert WrongQuote();
        if (openCost + amountIn > maxExposure) revert OverExposure();

        uint256 baseOut = _swap(settlement, c.base, amountIn, router, data);
        if (baseOut < minBaseOut) revert Slippage();

        // Fill must be close to mid: protects the follower and keeps cost honest.
        uint256 mid = config.priceSource().midPrice(c.base, settlement);
        uint256 fairBase = (amountIn * 1e18) / mid;
        if (baseOut < (fairBase * (10_000 - config.maxSlippageBps())) / 10_000) revert Slippage();

        positionId = _positions.length;
        _positions.push(
            Position({
                callId: callId, caller: c.caller, base: c.base, baseAmount: baseOut, cost: amountIn, open: true
            })
        );
        openCost += amountIn;
        lockedBase[c.base] += baseOut;

        emit Followed(positionId, callId, c.caller, amountIn, baseOut);
    }

    /// @notice Sell a position back to the settlement token and settle the caller's fee.
    function close(uint256 positionId, address router, bytes calldata data, uint256 minQuoteOut)
        external
        onlyOwner
        nonReentrant
        returns (int256 pnl, uint256 callerFee)
    {
        Position storage p = _positions[positionId];
        if (!p.open) revert PositionClosed();
        address settlement = config.settlementToken();

        p.open = false;
        openCost -= p.cost;
        lockedBase[p.base] -= p.baseAmount;

        uint256 proceeds = _swap(p.base, settlement, p.baseAmount, router, data);
        if (proceeds < minQuoteOut) revert Slippage();

        // Proceeds must be close to mid. This stops a follower routing the sale output elsewhere to dodge
        // the fee, because the vault would then receive far less than the position is worth.
        uint256 mid = config.priceSource().midPrice(p.base, settlement);
        uint256 fairQuote = (p.baseAmount * mid) / 1e18;
        if (proceeds < (fairQuote * (10_000 - config.maxSlippageBps())) / 10_000) revert Slippage();

        pnl = proceeds.toInt256() - p.cost.toInt256();
        uint256 protocolFee;
        (callerFee, protocolFee) = _settleFee(p.callId, p.caller, pnl);

        emit Closed(positionId, p.callId, p.caller, proceeds, pnl, callerFee, protocolFee);
    }

    /// @notice Withdraw anything not backing an open position.
    function withdraw(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < lockedBase[token] + amount) revert Locked();
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, amount, to);
    }

    // ----------------------------------------------------------------- views

    function positionCount() external view returns (uint256) {
        return _positions.length;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    // ----------------------------------------------------------------- internal

    /// @dev High-water mark per caller: fee is charged only on cumulative net gain above the previous peak.
    function _settleFee(uint256 callId, address caller, int256 pnl)
        internal
        returns (uint256 callerFee, uint256 protocolFee)
    {
        int256 net = netPnl[caller] + pnl;
        netPnl[caller] = net;
        int256 hwm = highWater[caller];
        if (net <= hwm) return (0, 0);

        uint256 gain = uint256(net - hwm);
        highWater[caller] = net; // advances even if unverified, so nothing is charged retroactively

        if (!config.gate().isVerified(caller)) return (0, 0);

        CallBook.Call memory c = config.callBook().getCall(callId);
        uint256 fee = (gain * c.feeBps) / 10_000;
        if (fee == 0) return (0, 0);
        protocolFee = (fee * config.protocolFeeBps()) / 10_000;
        callerFee = fee - protocolFee;

        IERC20 settlement = IERC20(config.settlementToken());
        settlement.safeTransfer(caller, callerFee);
        if (protocolFee > 0) settlement.safeTransfer(config.treasury(), protocolFee);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, address router, bytes calldata data)
        internal
        returns (uint256 received)
    {
        if (!config.isRouter(router)) revert RouterNotAllowed();
        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).forceApprove(router, amountIn);
        (bool ok, bytes memory reason) = router.call(data);
        if (!ok) revert SwapFailed(reason);
        IERC20(tokenIn).forceApprove(router, 0);

        uint256 inAfter = IERC20(tokenIn).balanceOf(address(this));
        if (inBefore - inAfter > amountIn) revert Overspent();
        received = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
    }
}
