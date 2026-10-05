// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICallerGate} from "./interfaces/ICallerGate.sol";

/// @title AttestedGate
/// @notice Onchain mirror of an offchain identity check. An attester (the Upside server) checks a caller's
///         Cleanverse A-Pass through the Cleanverse API and records it here with an expiry.
///         Revoking or letting the attestation lapse immediately stops the caller from earning fees.
contract AttestedGate is ICallerGate, Ownable {
    mapping(address => bool) public isAttester;
    mapping(address => uint64) public verifiedUntil;

    event AttesterSet(address indexed attester, bool allowed);
    event Attested(address indexed account, uint64 until, bytes32 credentialRef);

    error NotAttester();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAttester(address attester, bool allowed) external onlyOwner {
        isAttester[attester] = allowed;
        emit AttesterSet(attester, allowed);
    }

    /// @param credentialRef hash of the offchain credential reference (never raw personal data).
    function attest(address account, uint64 until, bytes32 credentialRef) external {
        if (!isAttester[msg.sender]) revert NotAttester();
        verifiedUntil[account] = until;
        emit Attested(account, until, credentialRef);
    }

    function isVerified(address account) external view returns (bool) {
        return verifiedUntil[account] > block.timestamp;
    }
}
