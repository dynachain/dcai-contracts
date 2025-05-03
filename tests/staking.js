const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { parseEther, formatEther } = require("ethers/utils");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DCAI Staking", function () {
  let staking, dcaiToken;
  let ops, user1, user2, user3;

  const DURATION_FLEXI = 0;
  const DURATION_30_DAYS = 1;
  const DURATION_180_DAYS = 2;
  const DURATION_365_DAYS = 3;

  beforeEach(async function () {
    [deployer, ops, user1, user2, user3] = await ethers.getSigners();

    // Deploy the DCAI token
    dcaiToken = await ethers.deployContract("DCAIToken");

    // Transfer some tokens to users
    await dcaiToken.transfer(user1.address, parseEther("3000000"));
    await dcaiToken.transfer(user2.address, parseEther("3000000"));
    await dcaiToken.transfer(user3.address, parseEther("3000000"));


    // Deploy the StakingNFT as upgradeable
    const Staking = await ethers.getContractFactory("Staking");
    staking = await upgrades.deployProxy(Staking, [dcaiToken.target, ops.address]);
    await staking.waitForDeployment();
    await dcaiToken.transfer(staking.target, parseEther("1000")); // interest
  });

  it("should apply minimum staking amount", async function () {
    await dcaiToken.connect(user1).approve(staking.target, parseEther("10000"));
    await expect(staking.connect(user1).stake(parseEther("10"), DURATION_FLEXI)).to.be.revertedWith("Invalid staking tier");
    await expect(staking.connect(user1).stake(parseEther("10"), DURATION_30_DAYS)).to.be.revertedWith("Invalid staking tier");
    await expect(staking.connect(user1).stake(parseEther("10"), DURATION_180_DAYS)).to.be.revertedWith("Invalid staking tier");
    await expect(staking.connect(user1).stake(parseEther("10"), DURATION_365_DAYS)).to.be.revertedWith("Invalid staking tier");

    await expect(staking.connect(user1).stake(parseEther("50"), DURATION_FLEXI)).to.not.be.reverted;
  });

  it("should calculate correct tier based on stake amount", async function () {
    await dcaiToken.connect(user1).approve(staking.target, parseEther("1000000"));
    let tx = await staking.connect(user1).stake(parseEther("50"), DURATION_FLEXI);
    let receipt = await tx.wait();
    let stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    let tokenId = stakedEvent.args.tokenId;
    let position = await staking.stakes(tokenId);
    expect(position.tier).to.equal(1n);
    expect(position.amount).to.equal(parseEther("50"));
    expect(position.duration).to.equal(0);

    tx = await staking.connect(user1).stake(parseEther("100"), DURATION_FLEXI);
    receipt = await tx.wait();
    stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    tokenId = stakedEvent.args.tokenId;
    position = await staking.stakes(tokenId);
    expect(position.tier).to.equal(1n);
    expect(position.amount).to.equal(parseEther("100"));
    expect(position.duration).to.equal(0);

    tx = await staking.connect(user1).stake(parseEther("200"), DURATION_FLEXI);
    receipt = await tx.wait();
    stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    tokenId = stakedEvent.args.tokenId;
    position = await staking.stakes(tokenId);
    expect(position.tier).to.equal(2n);
    expect(position.amount).to.equal(parseEther("200"));
    expect(position.duration).to.equal(0);

    tx = await staking.connect(user1).stake(parseEther("1000"), DURATION_FLEXI);
    receipt = await tx.wait();
    stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    tokenId = stakedEvent.args.tokenId;
    position = await staking.stakes(tokenId);
    expect(position.tier).to.equal(3n);
    expect(position.amount).to.equal(parseEther("1000"));
    expect(position.duration).to.equal(0);

    tx = await staking.connect(user1).stake(parseEther("10000"), DURATION_FLEXI);
    receipt = await tx.wait();
    stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    tokenId = stakedEvent.args.tokenId;
    position = await staking.stakes(tokenId);
    expect(position.tier).to.equal(3n);
    expect(position.amount).to.equal(parseEther("10000"));
    expect(position.duration).to.equal(0);

    expect(await staking.totalSupply()).to.equal(5n);
    expect(await staking.totalStaked()).to.equal(parseEther("11350"));
    expect(await staking.balanceOf(user1.address)).to.equal(5n);
  });

  it("should allow claiming rewards", async function () {
    // Stake 100 tokens with flexi duration
    await dcaiToken.connect(user1).approve(staking.target, parseEther("100"));
    const tx = await staking.connect(user1).stake(parseEther("100"), 0);

    const receipt = await tx.wait();
    const stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    const tokenId = stakedEvent.args.tokenId;

    // Fast forward 30 days
    await time.increase(30 * 24 * 60 * 60);

    // Get balance before claiming
    const balanceBefore = await dcaiToken.balanceOf(user1.address);

    // Create signature for claiming rewards
    const amount = parseEther("5");
    const timestamp = await time.latest();

    await staking.connect(deployer).setRewardsOperator(ops.address);

    const messageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'string', 'uint256', 'string', 'uint256'],
      [amount, '-', timestamp, '-', tokenId]
    )
      ;
    const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
    const signature = await ops.signMessage(ethers.getBytes(ethSignedMessageHash));

    // Claim rewards with signature
    await staking.connect(user1).claimReward(tokenId, amount, timestamp, signature);

    // Get balance after claiming
    const balanceAfter = await dcaiToken.balanceOf(user1.address);

    // Verify the claimed amount
    expect(balanceAfter - balanceBefore).to.equal(amount);
  });

  it("should allow unstaking tokens", async function () {
    // Stake 100 tokens with flexi duration
    await dcaiToken.connect(user1).approve(staking.target, parseEther("100"));
    const tx = await staking.connect(user1).stake(parseEther("100"), 0);

    const receipt = await tx.wait();
    const stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    const tokenId = stakedEvent.args.tokenId;
    expect(await staking.ownerOf(tokenId)).to.equal(user1.address);

    // Get balance before withdrawing
    const balanceBefore = await dcaiToken.balanceOf(user1.address);

    // Withdraw tokens
    await staking.connect(user1).unstake(tokenId);

    // Get balance after withdrawing
    const balanceAfter = await dcaiToken.balanceOf(user1.address);
    expect(balanceAfter - balanceBefore).to.greaterThanOrEqual(parseEther("100"));
  });

  it("should not allow withdrawing before maturity", async function () {
    // Stake 100 tokens with flexi duration
    await dcaiToken.connect(user1).approve(staking.target, parseEther("100"));
    const tx = await staking.connect(user1).stake(parseEther("100"), 1);

    const receipt = await tx.wait();
    const stakedEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "Staked"
    );
    const tokenId = stakedEvent.args.tokenId;
    expect(await staking.ownerOf(tokenId)).to.equal(user1.address);



    // Withdraw tokens
    await expect(staking.connect(user1).unstake(tokenId)).to.be.reverted;

    await time.increase(30 * 24 * 60 * 60);

    // Get balance before withdrawing
    const balanceBefore = await dcaiToken.balanceOf(user1.address);

    await staking.connect(user1).unstake(tokenId);

    // // Get balance after withdrawing
    const balanceAfter = await dcaiToken.balanceOf(user1.address);
    expect(balanceAfter - balanceBefore).to.greaterThanOrEqual(parseEther("100"));
  })


}); 