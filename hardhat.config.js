/** @type import('hardhat/config').HardhatUserConfig */
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "arb_sepolia",
        chainId: 421614,
        urls: {
          apiURL:
            `https://api-sepolia.arbiscan.io/api`,
          browserURL: "https://sepolia.arbiscan.io/",
        },
      }
    ],
  },
  networks: {
    arb_sepolia: {
      url: process.env.RPC_SEPOLIA_URL,
      chainId: 421614,
      accounts: [process.env.PRIVATE_KEY],
    },
    arb: {
      url: process.env.RPC_URL,
      chainId: 42170,
      accounts: [process.env.PRIVATE_KEY],
    }
  }
};
