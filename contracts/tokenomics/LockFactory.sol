// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Lock.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LockFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;

    mapping(address => address[]) public userLocks;

    event LockCreated(
        address indexed owner,
        address indexed lock,
        uint256 amount,
        uint256 matureAt
    );

    constructor(address token_) {
        require(token_ != address(0), "Zero token address");
        token = IERC20(token_);
    }

    function lock(uint256 amount, uint256 matureAt) public nonReentrant {
        require(matureAt > block.timestamp, "Mature at must be in the future");
        require(amount > 0, "Amount must be greater than 0");

        Lock vault = new Lock(address(token), msg.sender, matureAt);
        token.safeTransferFrom(msg.sender, address(vault), amount);

        userLocks[msg.sender].push(address(vault));

        emit LockCreated(msg.sender, address(vault), amount, matureAt);
    }

    function unlock(address lock) public nonReentrant {
        require(address(lock) != address(0), "Zero lock address");
        Lock(lock).withdraw();
    }
}
