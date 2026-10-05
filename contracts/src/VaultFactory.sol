// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FollowVault} from "./FollowVault.sol";
import {UpsideConfig} from "./UpsideConfig.sol";

/// @title VaultFactory
/// @notice One FollowVault per follower, at an address known before it is created.
contract VaultFactory {
    address public immutable implementation;
    UpsideConfig public immutable config;
    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed owner, address vault, uint256 maxExposure);

    error AlreadyCreated();

    constructor(UpsideConfig config_) {
        config = config_;
        implementation = address(new FollowVault());
    }

    function createVault(uint256 maxExposure) external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert AlreadyCreated();
        vault = Clones.cloneDeterministic(implementation, bytes32(uint256(uint160(msg.sender))));
        FollowVault(vault).initialize(msg.sender, config, maxExposure);
        vaultOf[msg.sender] = vault;
        emit VaultCreated(msg.sender, vault, maxExposure);
    }

    function predictVault(address owner) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, bytes32(uint256(uint160(owner))));
    }
}
