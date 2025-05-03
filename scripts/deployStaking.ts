import { ethers, upgrades } from "hardhat";

(async () => {
  try {
    const Contract = await ethers.getContractFactory("Staking");

    const contract = await upgrades.deployProxy(
      Contract,
      [process.env.TOKEN_ADDRESS, process.env.REWARDS_OPERATOR]
    );
    await contract.waitForDeployment();

    console.log(`Staking deployed to ${contract.target}`);
  } catch (e) {
    console.log(e);
  }
})();
