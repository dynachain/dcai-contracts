import { ethers, upgrades } from "hardhat";

(async () => {
  try {
    const Contract = await ethers.getContractFactory("BridgeHelper");
    const contract = await upgrades.deployProxy(Contract, [process.env.TOKEN_ADDRESS]);
    await contract.waitForDeployment();
    console.log("Bridge Helper deployed to:", contract.target);
  } catch (e) {
    console.log(e);
  }
})();
