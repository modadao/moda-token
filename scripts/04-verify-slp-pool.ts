import hre from 'hardhat';

import {
	MODA_TOKEN_ADDRESS,
	CORE_POOL_ADDRESS,
	SLP_POOL_START_TIMESTAMP,
	SLP_WEIGHT,
	FACTORY_ADDRESS,
	SLP_TOKEN_ADDRESS,
	SLP_POOL_ADDRESS,
} from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: SLP_POOL_ADDRESS,
		constructorArguments: [
			MODA_TOKEN_ADDRESS,
			FACTORY_ADDRESS,
			CORE_POOL_ADDRESS,
			SLP_TOKEN_ADDRESS,
			SLP_WEIGHT,
			SLP_POOL_START_TIMESTAMP,
		],
	});
	console.log('verified SLP Pool contract...');
};

deploy();
