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
    base: {
      url: process.env.RPC_URL, // Load from .env
      accounts: [process.env.PRIVATE_KEY],
      verify: {
        etherscan: {
          apiUrl: process.env.RPC_URL,
          apiKey: process.env.ETHERSCAN_API_KEY,
        },
      }, // Load from .env
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL, // Load from .env
      accounts: [process.env.PRIVATE_KEY],
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.basescan.org",
          apiKey: process.env.ETHERSCAN_API_KEY,
        },
      }, // Load from .env
    },
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
