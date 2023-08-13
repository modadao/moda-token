import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-contract-sizer';
import 'solidity-coverage';
import { config } from 'dotenv';

config();

if (!process.env.EVM_DEPLOYMENT_PRIVATE_KEY) {
	throw new Error('EVM_DEPLOYMENT_PRIVATE_KEY env not found');
}

export default {
	solidity: {
		version: '0.8.6',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		hardhat: {
			chainId: 1337,
		},
		goerli: {
			url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
			accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		mainnet: {
			url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
			accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		sepolia: {
			url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
			accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		localhost: {
			chainId: 1337,
			url: 'http://127.0.0.1:8545/',
		},
	},
	etherscan: {
		apiKey: process.env.ETH_SCAN_API_KEY,
		// apiKey: {
		// 	sepolia: process.env.ETH_SCAN_API_KEY || '',
		// },
		customChains: [
			{
				network: 'sepolia',
				chainId: 11155111,
				urls: {
					apiURL: 'https://api-sepolia.etherscan.io/api',
					browserURL: 'https://sepolia.etherscan.io',
				},
			},
		],
	},
	contractSizer: {
		runOnCompile: false,
	},
};
