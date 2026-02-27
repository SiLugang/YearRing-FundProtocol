// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFundShares
/// @notice ERC20 view interface for fund share tokens
interface IFundShares {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
