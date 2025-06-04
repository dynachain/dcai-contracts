// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC7802} from "./IERC7802.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract BridgeHelper is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    IERC7802 token;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address token_) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        require(token_ != address(0), "Zero token address");

        token = IERC7802(token_);
    }

    function crosschainMint(
        address to,
        uint256 amount
    ) public whenNotPaused onlyRole(BRIDGE_ROLE) nonReentrant {
        token.crosschainMint(to, amount);
    }

    function crosschainBurn(
        address from,
        uint256 amount
    ) public whenNotPaused onlyRole(BRIDGE_ROLE) nonReentrant {
        token.crosschainBurn(from, amount);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return interfaceId == type(IERC7802).interfaceId;
    }
}
