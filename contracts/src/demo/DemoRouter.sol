// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceSource} from "../interfaces/IPriceSource.sol";

/// @title DemoRouter
/// @notice TESTNET ONLY. Fills at the price source's mid from its own inventory so the full Upside loop can be
///         demonstrated where Kuru markets are unavailable. On mainnet the vault routes through Kuru Flow.
contract DemoRouter {
    using SafeERC20 for IERC20;

    IPriceSource public immutable price;

    constructor(IPriceSource price_) {
        price = price_;
    }

    /// @param baseIn true when selling base for quote
    function swap(address base, address quote, uint256 amountIn, bool baseIn, address recipient) external {
        uint256 mid = price.midPrice(base, quote);
        if (baseIn) {
            IERC20(base).safeTransferFrom(msg.sender, address(this), amountIn);
            IERC20(quote).safeTransfer(recipient, (amountIn * mid) / 1e18);
        } else {
            IERC20(quote).safeTransferFrom(msg.sender, address(this), amountIn);
            IERC20(base).safeTransfer(recipient, (amountIn * 1e18) / mid);
        }
    }
}
