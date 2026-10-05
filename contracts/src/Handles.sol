// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Handles
/// @notice Public display names for callers and followers. One unique handle per address, 3-20 characters of
///         [a-z0-9_]. A handle can be changed; the old one is released.
contract Handles {
    mapping(address => string) public handleOf;
    mapping(bytes32 => address) public ownerOf;

    event HandleSet(address indexed account, string handle);

    error BadHandle();
    error Taken();

    function setHandle(string calldata handle) external {
        bytes memory b = bytes(handle);
        if (b.length < 3 || b.length > 20) revert BadHandle();
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f; // a-z 0-9 _
            if (!ok) revert BadHandle();
        }
        bytes32 key = keccak256(b);
        address current = ownerOf[key];
        if (current != address(0) && current != msg.sender) revert Taken();

        string memory old = handleOf[msg.sender];
        if (bytes(old).length > 0) delete ownerOf[keccak256(bytes(old))];

        ownerOf[key] = msg.sender;
        handleOf[msg.sender] = handle;
        emit HandleSet(msg.sender, handle);
    }
}
