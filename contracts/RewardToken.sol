// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title RewardToken
/// @notice Fixed-supply reward token; all tokens pre-minted to treasury at deploy
/// @dev No MINTER_ROLE is granted → external minting is permanently disabled
contract RewardToken is ERC20, AccessControl {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 premintAmount,
        address treasury,
        address admin
    ) ERC20(name_, symbol_) {
        require(treasury != address(0), "RewardToken: zero treasury");
        require(admin != address(0), "RewardToken: zero admin");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        if (premintAmount > 0) {
            _mint(treasury, premintAmount);
        }
    }
}
