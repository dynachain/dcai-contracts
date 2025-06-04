const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther, formatEther } = require("ethers/utils");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("Lock", function () {

  let token, lockFactory;
  let admin;
  let matureAt;
  let lockAddress;

  beforeEach(async function () {
    [admin, manager, user, otherUser] = await ethers.getSigners();

    token = await ethers.deployContract("DCAIToken", [
      admin.address
    ]);

    await token.setOpenForAll(true);

    Contract = await ethers.getContractFactory("LockFactory");
    lockFactory = await Contract.deploy(token.target);

  });

  it("should allow locking tokens", async function () {
    const prevBalance = await token.balanceOf(admin.address);
    await token.approve(lockFactory.target, parseEther("1000"));
    matureAt = await time.latest() + 300;
    let tx = await lockFactory.lock(parseEther("1000"), matureAt);
    let receipt = await tx.wait();
    let lockCreatedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "LockCreated"
    );
    lockAddress = lockCreatedEvent.args.lock;

    let lock = await ethers.getContractAt("Lock", lockAddress);
    expect(await lock.owner()).to.equal(admin.address);
    expect(await lock.matureAt()).to.equal(matureAt);

    expect(await token.balanceOf(lockFactory.target)).to.equal("0");
    expect(await token.balanceOf(lockAddress)).to.equal(parseEther("1000"));
  });

  it("should not allow unlocking tokens before maturity", async function () {
    await expect(lockFactory.unlock(lockAddress)).to.be.revertedWith("Not mature");
    const lock = await ethers.getContractAt("Lock", lockAddress);
    await expect(lock.withdraw()).to.be.revertedWith("Not mature");
    expect(await lock.isWithdrawable()).to.equal(false);
  });

  it("should allow unlocking tokens after maturity", async function () {
    await time.increaseTo(matureAt);
    await lockFactory.unlock(lockAddress);

    expect(await token.balanceOf(lockAddress)).to.equal("0");
    expect(await token.balanceOf(admin.address)).to.equal(parseEther("100000000"));
  });

});
