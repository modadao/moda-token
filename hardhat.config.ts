import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'solidity-coverage';
import { config } from 'dotenv';
config();

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
			accounts: {
				mnemonic: 'stadium nest because drastic fatal sibling pretty load jar occur figure vivid',
			},
		},
		kovan: {
			url: `https://kovan.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
			accounts: {
				mnemonic: process.env.MNEMONIC,
			},
		},
		rinkeby: {
			url: `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
			accounts: {
				mnemonic: process.env.MNEMONIC,
			},
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
