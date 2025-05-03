// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract TokenDistributor is
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    struct Category {
        string name;
        uint256 totalAllocated;
        uint256 totalClaimed;
        uint256 balance;
    }

    struct Allocation {
        uint256 amount;
        uint256 claimed;
        uint256 start;
        uint16 cycles;
    }

    mapping(uint8 => Category) public categories;
    IERC20 public token;
    mapping(address => mapping(uint8 => Allocation[])) private _allocations;

    uint256 public constant CYCLE_GAP = 30 days;

    event Withdrawn(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint8 categoryId, uint256 amount);
    event NewAllocation(
        address indexed account,
        uint8 categoryId,
        uint256 amount
    );

    uint256 constant _TIME_OFFSET = 8 * 60 * 60;

    event AllocationRemoved(
        address indexed account,
        uint8 categoryId,
        uint256 amount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address defaultAdmin_,
        string[] memory categories_,
        address token_
    ) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
        _grantRole(ADMIN_ROLE, defaultAdmin_);

        for (uint8 i = 0; i < categories_.length; i++) {
            Category storage category = categories[i];
            category.name = categories_[i];
        }

        token = IERC20(token_);
    }

    function deposit(uint8 categoryId, uint256 amount) public {
        token.safeTransferFrom(_msgSender(), address(this), amount);
        categories[categoryId].balance += amount;
    }

    function addAllocations(
        uint8 categoryId,
        uint256 start,
        uint16 cycles,
        address[] memory addresses,
        uint256[] memory amounts
    ) public onlyRole(ALLOCATOR_ROLE) {
        Category storage category = categories[categoryId];
        require(addresses.length == amounts.length, "Invalid input");
        require(cycles > 0, "Cycles must be greater than 0");

        for (uint256 i = 0; i < addresses.length; i++) {
            if (categories[categoryId].balance < amounts[i]) {
                revert("Insufficient balance");
            }
            category.totalAllocated += amounts[i];
            categories[categoryId].balance -= amounts[i];

            Allocation memory allocation = Allocation(
                amounts[i],
                0,
                start,
                cycles
            );
            _allocations[addresses[i]][categoryId].push(allocation);
        }
    }

    function allocations(
        address account,
        uint8 categoryId
    ) public view returns (Allocation[] memory) {
        return _allocations[account][categoryId];
    }

    function _claimableToTime(
        Allocation memory alloc,
        uint256 time
    ) private pure returns (uint256) {
        if (time < alloc.start || alloc.claimed >= alloc.amount) {
            return 0;
        }

        uint256 balance = alloc.amount - alloc.claimed;

        uint256 cycles = (time - alloc.start) / CYCLE_GAP + 1;
        uint256 amount = ((cycles * alloc.amount) / alloc.cycles) -
            alloc.claimed;

        return amount <= balance ? amount : balance;
    }

    function accountTotals(
        address account,
        uint8 categoryId
    )
        public
        view
        returns (uint256 allocated, uint256 claimed, uint256 claimable)
    {
        allocated = 0;
        claimable = 0;
        claimed = 0;
        Allocation[] memory allocs = _allocations[account][categoryId];
        for (uint256 i = 0; i < allocs.length; i++) {
            Allocation memory alloc = allocs[i];
            allocated += alloc.amount;
            claimed += alloc.claimed;
            claimable += _claimableToTime(alloc, block.timestamp);
        }
    }

    function _claim(address account, uint8 categoryId, uint256 amount) private {
        Category storage category = categories[categoryId];
        category.totalClaimed += amount;

        token.safeTransfer(account, amount);
        emit Claimed(account, categoryId, amount);
    }

    function claim(uint8 categoryId) public whenNotPaused nonReentrant {
        address account = _msgSender();
        Allocation[] storage allocs = _allocations[account][categoryId];
        uint256 currentTime = block.timestamp;
        uint256 claimable = 0;
        for (uint256 i = 0; i < allocs.length; i++) {
            Allocation storage alloc = allocs[i];
            uint256 amount = _claimableToTime(alloc, currentTime);
            alloc.claimed += amount;
            claimable += amount;
        }
        if (claimable > 0) {
            _claim(account, categoryId, claimable);
        }
    }

    function setCategoryName(
        uint8 id,
        string memory name
    ) public onlyRole(ADMIN_ROLE) {
        Category storage category = categories[id];
        category.name = name;
    }

    function pause() public onlyRole(ADMIN_ROLE) {
        super._pause();
    }

    function unpause() public onlyRole(ADMIN_ROLE) {
        super._unpause();
    }

    function withdraw(uint256 amount) public onlyRole(ADMIN_ROLE) {
        token.safeTransfer(_msgSender(), amount);
        emit Withdrawn(_msgSender(), amount);
    }

    function removeAllocation(
        address account,
        uint8 categoryId,
        uint256 idx
    ) public onlyRole(ADMIN_ROLE) {
        Allocation storage alloc = _allocations[account][categoryId][idx];

        uint256 amount = alloc.amount - alloc.claimed;
        require(amount > 0, "Nothing to remove");

        Category storage category = categories[categoryId];

        alloc.amount = alloc.amount - amount;
        category.totalAllocated -= amount;
        categories[categoryId].balance += amount;

        emit AllocationRemoved(account, categoryId, amount);
    }
}
