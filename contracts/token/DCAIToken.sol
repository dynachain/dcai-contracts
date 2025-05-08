// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Bridgeable} from "./ERC20Bridgeable.sol";
import {ERC165, IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract DCAIToken is ERC20, ERC20Bridgeable, ERC20Permit, AccessControl {
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    error Unauthorized();
    error InvalidInput();

    constructor(
        address defaultAdmin
    ) ERC20("DCAI", "DCAI") ERC20Permit("DCAI") {
        _mint(defaultAdmin, 100_000_000 ether);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function _checkTokenBridge(address caller) internal view override {
        if (!hasRole(BRIDGE_ROLE, caller)) revert Unauthorized();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC20Bridgeable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
