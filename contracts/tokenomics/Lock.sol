// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Lock {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public owner;
    uint256 public matureAt;

    event Withdraw(address indexed owner, uint256 amount);

    constructor(address token_, address owner_, uint256 matureAt_) {
        require(token_ != address(0), "Zero token address");
        require(owner_ != address(0), "Zero owner address");
        require(matureAt_ > block.timestamp, "Mature at must be in the future");

        token = IERC20(token_);
        owner = owner_;
        matureAt = matureAt_;
    }

    function withdraw() public {
        require(block.timestamp >= matureAt, "Not mature");
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(owner, amount);
        emit Withdraw(owner, amount);
    }

    function isWithdrawable() public view returns (bool) {
        return
            block.timestamp >= matureAt && token.balanceOf(address(this)) > 0;
    }
}
