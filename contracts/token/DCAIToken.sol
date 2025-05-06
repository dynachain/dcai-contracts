// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Bridgeable} from "./ERC20Bridgeable.sol";
import {ERC165, IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract DCAIToken is ERC20, ERC20Bridgeable, ERC20Permit, AccessControl {
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    mapping(address => bool) internal _whitelisted;
    bool internal _openForAll;

    error Unauthorized();
    error InvalidInput();

    constructor(
        address defaultAdmin
    ) ERC20("DCAI", "DCAI") ERC20Permit("DCAI") {
        _mint(defaultAdmin, 100_000_000 ether);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _openForAll = false;
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

    function setWhitelist(
        address[] calldata addresses,
        bool[] calldata statuses
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (addresses.length != statuses.length) revert InvalidInput();
        for (uint i = 0; i < addresses.length; i++) {
            _whitelisted[addresses[i]] = statuses[i];
        }
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _openForAll || _whitelisted[account];
    }

    function setOpenForAll(
        bool newStatus
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _openForAll = newStatus;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (!_openForAll && !_whitelisted[from] && !_whitelisted[to]) {
            revert Unauthorized();
        }
        super._update(from, to, value);
    }
}
