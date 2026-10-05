// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPriceSource} from "./interfaces/IPriceSource.sol";
import {ICallerGate} from "./interfaces/ICallerGate.sol";

/// @title CallBook
/// @notice Every trading call is posted here before the move and can never be edited or deleted.
///         A call is scored once, after its horizon, from the market mid at post time to the market mid at
///         scoring time. Follower money plays no part in the score, so fake followers cannot inflate it.
contract CallBook is Ownable {
    using SafeCast for uint256;

    enum Side {
        Long,
        Short
    }

    struct Call {
        address caller;
        address base;
        address quote;
        Side side;
        uint16 feeBps; // share of a follower's net gain paid to the caller
        bool verifiedAtPost;
        bool scored;
        uint40 postedAt;
        uint40 expiry; // also the scoring horizon
        uint256 entryMid;
        uint256 targetMid; // informational, shown to followers
        uint256 stopMid; // informational, shown to followers
        uint256 exitMid;
        int256 returnBps;
    }

    struct Record {
        int256 sumReturnBps;
        uint32 posted;
        uint32 scored;
        uint32 wins;
    }

    uint16 public constant MAX_FEE_BPS = 3000; // 30%
    uint40 public constant MIN_HORIZON = 60; // seconds
    uint40 public constant MAX_HORIZON = 30 days;

    IPriceSource public priceSource;
    ICallerGate public gate;

    /// @notice Only liquid pairs can be called, so a caller cannot pump a thin market they control.
    mapping(bytes32 => bool) public pairAllowed;

    Call[] internal _calls;
    mapping(address => Record) public records;

    event PairSet(address indexed base, address indexed quote, bool allowed);
    event PriceSourceSet(address priceSource);
    event GateSet(address gate);
    event CallPosted(
        uint256 indexed id,
        address indexed caller,
        address base,
        address quote,
        Side side,
        uint256 entryMid,
        uint256 targetMid,
        uint256 stopMid,
        uint16 feeBps,
        uint40 expiry,
        bool verified
    );
    event CallScored(uint256 indexed id, address indexed caller, uint256 exitMid, int256 returnBps);

    error PairNotAllowed();
    error BadFee();
    error BadHorizon();
    error BadLevels();
    error NoPrice();
    error NotExpired();
    error AlreadyScored();

    constructor(address initialOwner, IPriceSource priceSource_, ICallerGate gate_) Ownable(initialOwner) {
        priceSource = priceSource_;
        gate = gate_;
    }

    // ----------------------------------------------------------------- admin

    function setPair(address base, address quote, bool allowed) external onlyOwner {
        pairAllowed[_pairKey(base, quote)] = allowed;
        emit PairSet(base, quote, allowed);
    }

    function setPriceSource(IPriceSource priceSource_) external onlyOwner {
        priceSource = priceSource_;
        emit PriceSourceSet(address(priceSource_));
    }

    function setGate(ICallerGate gate_) external onlyOwner {
        gate = gate_;
        emit GateSet(address(gate_));
    }

    // ----------------------------------------------------------------- calls

    function postCall(
        address base,
        address quote,
        Side side,
        uint256 targetMid,
        uint256 stopMid,
        uint16 feeBps,
        uint40 horizon
    ) external returns (uint256 id) {
        if (!pairAllowed[_pairKey(base, quote)]) revert PairNotAllowed();
        if (feeBps > MAX_FEE_BPS) revert BadFee();
        if (horizon < MIN_HORIZON || horizon > MAX_HORIZON) revert BadHorizon();

        uint256 entry = priceSource.midPrice(base, quote);
        if (entry == 0) revert NoPrice();
        if (side == Side.Long) {
            if (targetMid <= entry || stopMid >= entry) revert BadLevels();
        } else {
            if (targetMid >= entry || stopMid <= entry) revert BadLevels();
        }

        bool verified = gate.isVerified(msg.sender);
        uint40 expiry = uint40(block.timestamp) + horizon;

        id = _calls.length;
        _calls.push(
            Call({
                caller: msg.sender,
                base: base,
                quote: quote,
                side: side,
                feeBps: feeBps,
                verifiedAtPost: verified,
                scored: false,
                postedAt: uint40(block.timestamp),
                expiry: expiry,
                entryMid: entry,
                targetMid: targetMid,
                stopMid: stopMid,
                exitMid: 0,
                returnBps: 0
            })
        );
        records[msg.sender].posted += 1;

        emit CallPosted(id, msg.sender, base, quote, side, entry, targetMid, stopMid, feeBps, expiry, verified);
    }

    /// @notice Anyone (normally the Upside keeper) scores a call once its horizon has passed.
    function scoreCall(uint256 id) external returns (int256 returnBps) {
        Call storage c = _calls[id];
        if (c.scored) revert AlreadyScored();
        if (block.timestamp < c.expiry) revert NotExpired();

        uint256 exit = priceSource.midPrice(c.base, c.quote);
        if (exit == 0) revert NoPrice();

        int256 diff = exit.toInt256() - c.entryMid.toInt256();
        returnBps = (diff * 10_000) / c.entryMid.toInt256();
        if (c.side == Side.Short) returnBps = -returnBps;

        c.scored = true;
        c.exitMid = exit;
        c.returnBps = returnBps;

        Record storage r = records[c.caller];
        r.sumReturnBps += returnBps;
        r.scored += 1;
        if (returnBps > 0) r.wins += 1;

        emit CallScored(id, c.caller, exit, returnBps);
    }

    // ----------------------------------------------------------------- views

    function getCall(uint256 id) external view returns (Call memory) {
        return _calls[id];
    }

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function isActive(uint256 id) public view returns (bool) {
        Call storage c = _calls[id];
        return !c.scored && block.timestamp < c.expiry;
    }

    function _pairKey(address base, address quote) internal pure returns (bytes32) {
        return keccak256(abi.encode(base, quote));
    }
}
