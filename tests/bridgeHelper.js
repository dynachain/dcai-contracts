const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther, formatEther } = require("ethers/utils");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("BridgeHelper", function () {

  let token, bridgerHelper;
  let admin;


  beforeEach(async function () {
    [admin, manager, user, otherUser] = await ethers.getSigners();

    token = await ethers.deployContract("DCAIToken", [
      admin.address
    ]);

    await token.setOpenForAll(true);
    
    bridgerHelper = await upgrades.deployProxy(await ethers.getContractFactory("BridgeHelper"), [token.target]);
    await token.grantRole(await token.BRIDGE_ROLE(), bridgerHelper.target);

    await bridgerHelper.grantRole(await bridgerHelper.BRIDGE_ROLE(), admin.address);
    await token.renounceRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)

  });

  it("should allow bridge to mint/burn tokens", async function () {
    await bridgerHelper.crosschainMint(admin.address, parseEther("1000"));
    expect(await token.balanceOf(admin.address)).to.equal(parseEther("100001000"));
    expect(await token.totalSupply()).to.equal(parseEther("100001000"));

    await bridgerHelper.crosschainBurn(admin.address, parseEther("1000"));
    expect(await token.balanceOf(admin.address)).to.equal(parseEther("100000000"));
    expect(await token.totalSupply()).to.equal(parseEther("100000000"));
  });

});
