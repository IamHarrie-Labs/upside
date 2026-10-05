// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceSource} from "../../src/interfaces/IPriceSource.sol";

contract MockToken is ERC20 {
    uint8 internal immutable _dec;

    constructor(string memory name, uint8 dec) ERC20(name, name) {
        _dec = dec;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockPrice is IPriceSource {
    mapping(bytes32 => uint256) public p;

    function set(address base, address quote, uint256 priceX18) external {
        p[keccak256(abi.encode(base, quote))] = priceX18;
    }

    function midPrice(address base, address quote) external view returns (uint256) {
        return p[keccak256(abi.encode(base, quote))];
    }
}

/// @notice Fills at the mock mid from its own inventory. `recipient` lets tests simulate output redirection.
contract MockRouter {
    MockPrice public price;

    constructor(MockPrice price_) {
        price = price_;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, bool inIsBase, address recipient) external {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 out;
        if (inIsBase) {
            out = (amountIn * price.midPrice(tokenIn, tokenOut)) / 1e18;
        } else {
            out = (amountIn * 1e18) / price.midPrice(tokenOut, tokenIn);
        }
        IERC20(tokenOut).transfer(recipient, out);
    }
}
