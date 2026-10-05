// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Answers whether a caller is verified (e.g. holds an active Cleanverse A-Pass).
interface ICallerGate {
    function isVerified(address account) external view returns (bool);
}
