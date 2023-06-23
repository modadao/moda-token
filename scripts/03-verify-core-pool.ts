import hre, { ethers } from 'hardhat';

import { MODA_TOKEN_ADDRESS, CORE_POOL_ADDRESS, START_TIMESTAMP, CORE_WEIGHT, FACTORY_ADDRESS } from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: CORE_POOL_ADDRESS,
		constructorArguments: [
			MODA_TOKEN_ADDRESS,
			FACTORY_ADDRESS,
			ethers.constants.AddressZero,
			MODA_TOKEN_ADDRESS,
			CORE_WEIGHT,
			START_TIMESTAMP,
		],
	});
	console.log('verified Core Pool contract...');
};

deploy();
