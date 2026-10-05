// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceSource} from "./interfaces/IPriceSource.sol";

/// @title KeeperPriceSource
/// @notice Order-book mids pushed by a keeper that reads Kuru's book, with a staleness limit.
/// @dev MVP price source. Swap for an adapter that reads Kuru's orderbook contract directly once its
///      read interface is confirmed; CallBook takes any IPriceSource.
contract KeeperPriceSource is IPriceSource, Ownable {
    struct Quote {
        uint192 priceX18;
        uint64 updatedAt;
    }

    uint64 public maxAge;
    mapping(address => bool) public isKeeper;
    mapping(bytes32 => Quote) internal _quotes;

    event KeeperSet(address indexed keeper, bool allowed);
    event MaxAgeSet(uint64 maxAge);
    event PricePushed(address indexed base, address indexed quote, uint256 priceX18);

    error NotKeeper();
    error Stale();

    constructor(address initialOwner, uint64 maxAge_) Ownable(initialOwner) {
        maxAge = maxAge_;
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setMaxAge(uint64 maxAge_) external onlyOwner {
        maxAge = maxAge_;
        emit MaxAgeSet(maxAge_);
    }

    function push(address base, address quote, uint192 priceX18) external {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _quotes[keccak256(abi.encode(base, quote))] = Quote(priceX18, uint64(block.timestamp));
        emit PricePushed(base, quote, priceX18);
    }

    function midPrice(address base, address quote) external view returns (uint256) {
        Quote memory q = _quotes[keccak256(abi.encode(base, quote))];
        if (q.priceX18 == 0 || block.timestamp - q.updatedAt > maxAge) revert Stale();
        return q.priceX18;
    }
}
