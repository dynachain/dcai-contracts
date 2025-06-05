// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TimeLock {
    using SafeERC20 for IERC20;

    struct Lock {
        uint256 amount;
        uint256 matureAt;
        bool withdrawn;
    }

    IERC20 public token;
    
    // Mapping from user address to array of locks
    mapping(address => Lock[]) public userLocks;
    // Mapping to track total locked amount per user
    mapping(address => uint256) public totalLocked;

    event LockCreated(address indexed user, uint256 amount, uint256 matureAt, uint256 lockId);
    event Withdraw(address indexed user, uint256 amount, uint256 lockId);

    constructor(address token_) {
        require(token_ != address(0), "Zero token address");

        token = IERC20(token_);
    }

    function lock(uint256 amount, uint256 matureAt_) external {
        require(matureAt_ > block.timestamp, "Mature at must be in the future");
        require(amount > 0, "Amount must be greater than 0");

        // Create new lock
        Lock memory newLock = Lock({
            amount: amount,
            matureAt: matureAt_,
            withdrawn: false
        });

        // Add lock to user's locks
        userLocks[msg.sender].push(newLock);
        totalLocked[msg.sender] += amount;

        // Transfer tokens
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Emit event with lock ID (array index)
        emit LockCreated(msg.sender, amount, matureAt_, userLocks[msg.sender].length - 1);
    }

    function withdraw(uint256 lockId) public {
        require(lockId < userLocks[msg.sender].length, "Invalid lock ID");
        
        Lock storage lock_ = userLocks[msg.sender][lockId];
        require(!lock_.withdrawn, "Already withdrawn");
        require(block.timestamp >= lock_.matureAt, "Not mature");

        uint256 amount = lock_.amount;
        lock_.withdrawn = true;
        totalLocked[msg.sender] -= amount;

        token.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, lockId);
    }

    function withdrawAll() public {
        uint256 totalWithdrawable = 0;
        Lock[] storage locks = userLocks[msg.sender];
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].withdrawn && block.timestamp >= locks[i].matureAt) {
                totalWithdrawable += locks[i].amount;
                locks[i].withdrawn = true;
            }
        }

        require(totalWithdrawable > 0, "No withdrawable locks");
        totalLocked[msg.sender] -= totalWithdrawable;
        
        token.safeTransfer(msg.sender, totalWithdrawable);
        emit Withdraw(msg.sender, totalWithdrawable, type(uint256).max); // Use max uint as lockId for withdrawAll
    }

    function getLockCount(address user) public view returns (uint256) {
        return userLocks[user].length;
    }

    function getLock(address user, uint256 lockId) public view returns (Lock memory) {
        require(lockId < userLocks[user].length, "Invalid lock ID");
        return userLocks[user][lockId];
    }

    function isWithdrawable(address user, uint256 lockId) public view returns (bool) {
        require(lockId < userLocks[user].length, "Invalid lock ID");
        Lock memory lock_ = userLocks[user][lockId];
        return !lock_.withdrawn && block.timestamp >= lock_.matureAt;
    }

    function getTotalWithdrawable(address user) public view returns (uint256) {
        uint256 total = 0;
        Lock[] storage locks = userLocks[user];
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].withdrawn && block.timestamp >= locks[i].matureAt) {
                total += locks[i].amount;
            }
        }
        
        return total;
    }
}
