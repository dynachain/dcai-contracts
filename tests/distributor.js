const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther, formatEther } = require("ethers/utils");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("TokenDistributor", function () {

  let token, distributor;
  let admin, manager, user, otherUser;
  const CATEGORY_NAMES = ["Category1", "Category2"];

  beforeEach(async function () {
    [admin, manager, user, otherUser] = await ethers.getSigners();

    token = await ethers.deployContract("DCAIToken", [
      admin.address
    ]);

    Contract = await ethers.getContractFactory("TokenDistributor");
    distributor = await upgrades.deployProxy(Contract, [
      admin.address,
      CATEGORY_NAMES,
      token.target,
    ]);
    distributor.grantRole(
      await distributor.ALLOCATOR_ROLE(),
      admin.address
    );
  });

  it("should initialize with correct categories and token", async function () {
    for (let i = 0; i < CATEGORY_NAMES.length; i++) {
      const category = await distributor.categories(i);
      expect(category.name).to.equal(CATEGORY_NAMES[i]);
    }
    expect(await distributor.token()).to.equal(token.target);
  });

  it("should allow admin to withdraw tokens", async function () {
    // Assign role
    await distributor.grantRole(
      await distributor.ADMIN_ROLE(),
      manager.address
    );
    // Fund the contract
    await token.transfer(distributor.target, parseEther("1000"));

    const withdrawAmount = parseEther("500");
    await distributor.connect(manager).withdraw(withdrawAmount);

    expect(await token.balanceOf(manager.address)).to.equal(withdrawAmount);
    expect(await token.balanceOf(distributor.target)).to.equal(
      withdrawAmount
    );
  });

  it("should not allow user to withdraw tokens", async function () {
    // Assign role
    await distributor.grantRole(
      await distributor.ADMIN_ROLE(),
      manager.address
    );
    // Fund the contract
    await token.transfer(distributor.target, parseEther("1000"));

    const withdrawAmount = parseEther("500");
    await expect(distributor.connect(user).withdraw(withdrawAmount)).to.be
      .reverted;
  });

  it("should allow admin to add allocations", async function () {
    const categoryId = 0;
    const start = Math.floor(Date.now() / 1000);
    const cycles = 10;
    const addresses = [user.address, otherUser.address];
    const amounts = [parseEther("100"), parseEther("200")];

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId, parseEther("300"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );

    const allocation1 = await distributor.allocations(
      user.address,
      categoryId
    );
    const allocation2 = await distributor.allocations(
      otherUser.address,
      categoryId
    );

    expect(allocation1.length).to.equal(1);
    expect(allocation1[0].amount).to.equal(amounts[0]);
    expect(allocation2.length).to.equal(1);
    expect(allocation2[0].amount).to.equal(amounts[1]);

    const totals1 = await distributor.accountTotals(user.address, 0);
    const totals2 = await distributor.accountTotals(otherUser.address, 0);
    expect(totals1.allocated).to.equal(amounts[0]);
    expect(totals2.allocated).to.equal(amounts[1]);

    expect(totals1.claimed).to.equal(0);
    expect(totals2.claimed).to.equal(0);
  });

  it("should not allow users to claim allocation before start", async function () {
    const categoryId = 0;
    const start = 1769875200; // 2026-02-01 
    const cycles = 10;
    const addresses = [user.address, otherUser.address];
    const amounts = [parseEther("100"), parseEther("200")];

    const beforeTs = 1767196800; // 2026-01-01
    await time.increaseTo(beforeTs);

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId, parseEther("300"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );

    // Nothing to be claimed before the start
    for (let i = 0; i < 2; i++) {
      await time.increase(86400);
      await distributor.connect(user).claim(categoryId);
      await distributor.connect(otherUser).claim(categoryId);
      expect(await token.balanceOf(user.address)).to.equal(0);
      expect(await token.balanceOf(otherUser.address)).to.equal(0);
    }
  })

  it("should allow users to claim allocations", async function () {
    const categoryId = 0;
    const start = 1769875200; // 2026-02-01 
    const cycles = 10;
    const addresses = [user.address, otherUser.address];
    const amounts = [parseEther("100"), parseEther("200")];

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId, parseEther("300"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );

    await time.increaseTo(start);
    let userTotals = await distributor.accountTotals(
      user.address,
      categoryId
    );
    expect(userTotals.claimable.toString()).to.equal(
      parseEther("10").toString()
    );
    let otherTotals = await distributor.accountTotals(
      otherUser.address,
      categoryId
    );
    expect(otherTotals.claimable.toString()).to.equal(
      parseEther("20").toString()
    );

    await time.increase(30 * 86400);
    userTotals = await distributor.accountTotals(user.address, categoryId);
    expect(userTotals.claimable.toString()).to.equal(
      parseEther("20").toString()
    );
    otherTotals = await distributor.accountTotals(
      otherUser.address,
      categoryId
    );
    expect(otherTotals.claimable.toString()).to.equal(
      parseEther("40").toString()
    );

    await time.increaseTo(start + 300 * 86400);
    userTotals = await distributor.accountTotals(user.address, categoryId);
    expect(userTotals.claimable.toString()).to.equal(
      parseEther("100").toString()
    );
    otherTotals = await distributor.accountTotals(
      otherUser.address,
      categoryId
    );
    expect(otherTotals.claimable.toString()).to.equal(
      parseEther("200").toString()
    );

    await distributor.connect(user).claim(categoryId);
    await distributor.connect(otherUser).claim(categoryId);
    expect((await token.balanceOf(user.address)).toString()).to.equal(
      parseEther("100").toString()
    );
    expect((await token.balanceOf(otherUser.address)).toString()).to.equal(
      parseEther("200").toString()
    );
  });

  it("should not allow over claims (extra days)", async function () {
    const categoryId = 0;
    const start = 1769875200; // 2026-02-01 
    const cycles = 10;
    const addresses = [user.address];
    const amounts = [parseEther("100")];


    await token.approve(distributor.target, parseEther("100"));
    await distributor.deposit(categoryId, parseEther("100"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );

    await time.increaseTo(start + 20 * 30 * 86400);
    let userTotals = await distributor.accountTotals(
      user.address,
      categoryId
    );
    expect(userTotals.claimable.toString()).to.equal(
      parseEther("100").toString()
    );

    await distributor.connect(user).claim(categoryId);
    expect((await token.balanceOf(user.address)).toString()).to.equal(
      parseEther("100").toString()
    );

  });

  it("should not allow over claims (double claims)", async function () {
    const categoryId = 0;
    const start = 4922870400; // 2126-01-01 
    const cycles = 10;
    const addresses = [user.address];
    const amounts = [parseEther("100")];

    await token.approve(distributor.target, parseEther("100"));
    await distributor.deposit(categoryId, parseEther("100"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );

    await time.increaseTo(start)

    await distributor.connect(user).claim(categoryId);
    expect(
      parseFloat(formatEther(await token.balanceOf(user.address))).toFixed(
        4
      )
    ).to.equal("10.0000");


    // Double claim
    await distributor.connect(user).claim(categoryId);
    expect(
      parseFloat(formatEther(await token.balanceOf(user.address))).toFixed(
        4
      )
    ).to.equal("10.0000");

    await time.increase(30 * 86400);
    await distributor.connect(user).claim(categoryId);
    expect(
      parseFloat(formatEther(await token.balanceOf(user.address))).toFixed(
        4
      )
    ).to.equal("20.0000");
  });

  it("should allow multiple allocations", async function () {
    const categoryId = 0;
    const start = Math.floor(await time.latest() / 1000) + 5 * 86400;
    const cycles = 10;
    const addresses = [user.address, otherUser.address];
    const amounts = [parseEther("100"), parseEther("200")];

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId, parseEther("300"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );
    // Fully claim first pot
    await time.increase(86400 * 16);

    await distributor.connect(user).claim(categoryId);
    await distributor.connect(otherUser).claim(categoryId);

    expect(
      parseFloat(formatEther(await token.balanceOf(user.address))).toFixed(
        4
      )
    ).to.equal("100.0000");
    expect(
      parseFloat(
        formatEther(await token.balanceOf(otherUser.address))
      ).toFixed(4)
    ).to.equal("200.0000");

    // 2nd allocation
    const categoryId2 = 1;
    const start2 = Math.floor(Date.now() / 1000) + 5 * 86400;
    const cycles2 = 2;
    const addresses2 = [user.address, otherUser.address];
    const amounts2 = [parseEther("200"), parseEther("100")];

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId2, parseEther("300"));
    await distributor.addAllocations(
      categoryId2,
      start2,
      cycles2,
      addresses2,
      amounts2
    );
    await time.increase(86400 * 8);

    await distributor.connect(user).claim(categoryId2);
    await distributor.connect(otherUser).claim(categoryId2);

    expect(
      parseFloat(formatEther(await token.balanceOf(user.address))).toFixed(
        4
      )
    ).to.equal("300.0000");
    expect(
      parseFloat(
        formatEther(await token.balanceOf(otherUser.address))
      ).toFixed(4)
    ).to.equal("300.0000");
  });

  it("should allow allocation removal", async function () {
    const categoryId = 0;
    const start = await time.latest() + 5 * 86400;
    const cycles = 10;
    const addresses = [user.address, otherUser.address];
    const amounts = [parseEther("100"), parseEther("200")];

    await token.approve(distributor.target, parseEther("300"));
    await distributor.deposit(categoryId, parseEther("300"));
    await distributor.addAllocations(
      categoryId,
      start,
      cycles,
      addresses,
      amounts
    );
    // Fully claim first pot
    await time.increase(86400 * 30 * 10);

    await distributor.connect(user).claim(categoryId);
    await distributor.connect(otherUser).claim(categoryId);
    expect(
      parseFloat(
        formatEther(await token.balanceOf(user.address))
      ).toFixed(4)
    ).to.equal("100.0000");
    expect(
      parseFloat(
        formatEther(await token.balanceOf(otherUser.address))
      ).toFixed(4)
    ).to.equal("200.0000");

    // 2nd allocation
    const start2 = await time.latest() + 5 * 86400;
    const cycles2 = 3;
    const addresses2 = [user.address, otherUser.address];
    const amounts2 = [parseEther("300"), parseEther("100")];

    await token.approve(distributor.target, parseEther("400"));
    await distributor.deposit(categoryId, parseEther("400"));
    await distributor.addAllocations(
      categoryId,
      start2,
      cycles2,
      addresses2,
      amounts2
    );

    await time.increase(86400 * 5);

    const allocations = await distributor.allocations(user.address, categoryId)
    expect(allocations.length).to.equal(2)
 
    expect(allocations[1].amount.toString()).to.equal(parseEther("300").toString())
    expect(allocations[1][1].toString()).to.equal("0")

    const totals = await distributor.accountTotals(user.address, categoryId);
    expect(totals.allocated.toString()).to.equal(parseEther("400").toString());
    expect(totals.claimed.toString()).to.equal(parseEther("100").toString());
    expect(totals.claimable.toString()).to.equal(parseEther("100").toString());
    await distributor.connect(user).claim(categoryId);

    const totals2 = await distributor.accountTotals(user.address, categoryId);
    expect(totals2.allocated.toString()).to.equal(parseEther("400").toString());
    expect(totals2.claimed.toString()).to.equal(parseEther("200").toString());  //First 100 + Second alloc 1/3 = 100
    expect(totals2.claimable.toString()).to.equal(parseEther("0").toString());
    await distributor.removeAllocation(user.address, categoryId, 1);

    const totals3 = await distributor.accountTotals(user.address, categoryId);
    expect(totals3.allocated.toString()).to.equal(parseEther("200").toString());
    expect(totals3.claimed.toString()).to.equal(parseEther("200").toString());  //First 100 + Second alloc 1/3 = 100
    expect(totals3.claimable.toString()).to.equal(parseEther("0").toString());

    await expect(distributor.removeAllocation(user.address, categoryId, 1)).to.be.reverted;
  });
});
