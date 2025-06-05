import { ethers, upgrades } from "hardhat";

(async () => {
  try {
    const contract = await ethers.deployContract("TimeLock", [process.env.LP_TOKEN]);

    console.log("Lock deployed to:", contract.target);
  } catch (e) {
    console.log(e);
  }
})();
