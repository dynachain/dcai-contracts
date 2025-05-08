import { ethers, upgrades } from "hardhat";

(async () => {
  try {
    const args = require("./arguments/distributor");
    const Contract = await ethers.getContractFactory("TokenDistributor");
    const contract = await upgrades.deployProxy(Contract, args);
    await contract.waitForDeployment();
    console.log("Distributor deployed to:", contract.target);
  } catch (e) {
    console.log(e);
  }
})();
