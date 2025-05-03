import { ethers } from "hardhat";

(async () => {
  try {
    const args = require("./arguments/token");
    const contract = await ethers.deployContract(
      "DCAIToken",
      args
    );
    await contract.waitForDeployment();

    console.log(`Token deployed to ${contract.target}`);
  } catch (e) {
    console.log(e);
  }
})();
