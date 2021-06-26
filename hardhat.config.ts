import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import '@openzeppelin/hardhat-upgrades';

const INFURA_PROJECT_ID = '';

export default {
	solidity: '0.8.6',
	networks: {
		hardhat: {
			chainId: 1337,
			accounts: {
				mnemonic: 'stadium nest because drastic fatal sibling pretty load jar occur figure vivid',
			},
		},
		kovan: {
			url: `https://kovan.infura.io/v3/${INFURA_PROJECT_ID}`,
			accounts: {
				mnemonic: 'stadium nest because drastic fatal sibling pretty load jar occur figure vivid',
			},
		},
		localhost: {
			chainId: 1337,
			url: 'http://127.0.0.1:8545/',
		},
	},
};
