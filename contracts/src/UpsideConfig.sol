// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CallBook} from "./CallBook.sol";
import {IPriceSource} from "./interfaces/IPriceSource.sol";
import {ICallerGate} from "./interfaces/ICallerGate.sol";

/// @title UpsideConfig
/// @notice Shared settings read by every FollowVault.
contract UpsideConfig is Ownable {
    uint16 public constant MAX_PROTOCOL_BPS = 2000; // at most 20% of a caller's fee
    uint16 public constant MAX_SLIPPAGE_BPS = 1000; // at most 10% away from mid

    CallBook public immutable callBook;
    address public immutable settlementToken; // AUSD on Monad

    address public treasury;
    uint16 public protocolFeeBps; // share of each caller fee kept by the protocol
    uint16 public maxSlippageBps; // fills further than this from mid revert
    mapping(address => bool) public isRouter; // e.g. the Kuru Flow router

    event RouterSet(address indexed router, bool allowed);
    event TreasurySet(address treasury);
    event ProtocolFeeSet(uint16 bps);
    event SlippageSet(uint16 bps);

    error TooHigh();

    constructor(
        address initialOwner,
        CallBook callBook_,
        address settlementToken_,
        address treasury_,
        uint16 protocolFeeBps_,
        uint16 maxSlippageBps_
    ) Ownable(initialOwner) {
        if (protocolFeeBps_ > MAX_PROTOCOL_BPS || maxSlippageBps_ > MAX_SLIPPAGE_BPS) revert TooHigh();
        callBook = callBook_;
        settlementToken = settlementToken_;
        treasury = treasury_;
        protocolFeeBps = protocolFeeBps_;
        maxSlippageBps = maxSlippageBps_;
    }

    function setRouter(address router, bool allowed) external onlyOwner {
        isRouter[router] = allowed;
        emit RouterSet(router, allowed);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setProtocolFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_BPS) revert TooHigh();
        protocolFeeBps = bps;
        emit ProtocolFeeSet(bps);
    }

    function setMaxSlippageBps(uint16 bps) external onlyOwner {
        if (bps > MAX_SLIPPAGE_BPS) revert TooHigh();
        maxSlippageBps = bps;
        emit SlippageSet(bps);
    }

    function priceSource() external view returns (IPriceSource) {
        return callBook.priceSource();
    }

    function gate() external view returns (ICallerGate) {
        return callBook.gate();
    }
}
