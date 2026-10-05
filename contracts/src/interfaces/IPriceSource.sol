// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Mid price of a pair, expressed as raw quote units per raw base unit, scaled by 1e18.
/// @dev expectedQuoteOut = baseAmount * price / 1e18. Decimals are already folded into the number.
interface IPriceSource {
    function midPrice(address base, address quote) external view returns (uint256 priceX18);
}
