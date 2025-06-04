import { ethers } from "hardhat";

(async () => {
  try {
    const contract = await ethers.deployContract(
      "LockFactory",
      [process.env.TOKEN_ADDRESS]
    );
    await contract.waitForDeployment();

    console.log(`Lock Factory deployed to ${contract.target}`);
  } catch (e) {
    console.log(e);
  }
})();
