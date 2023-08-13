import hre from 'hardhat';

import { SLP_TOKEN_ADDRESS } from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: SLP_TOKEN_ADDRESS,
		constructorArguments: [],
	});
	console.log('verified test SLP token contract...');
};

deploy();
