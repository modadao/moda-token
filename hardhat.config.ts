import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'solidity-coverage';
import { config } from 'dotenv';
config();

if (!process.env.EVM_DEPLOYMENT_PRIVATE_KEY) {
	throw new Error(
		'EVM_DEPLOYMENT_PRIVATE_KEY env not found'
	);
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
                        accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		kovan: {
			url: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
                        accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		ropsten: {
			url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
                        accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		rinkeby: {
			url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
                        accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		mainnet: {
			url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
                        accounts: [process.env.EVM_DEPLOYMENT_PRIVATE_KEY],
		},
		localhost: {
			chainId: 1337,
			url: 'http://127.0.0.1:8545/',
		},
	},
	etherscan: {
		apiKey: process.env.ETH_SCAN_API_KEY,
	},
};
