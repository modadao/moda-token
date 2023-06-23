import hre from 'hardhat';
import { ONE_DAY } from './constants';

import { MODA_TOKEN_ADDRESS, FACTORY_ADDRESS, START_TIMESTAMP, END_TIMESTAMP, ETH_AMOUNT } from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: FACTORY_ADDRESS,
		constructorArguments: [MODA_TOKEN_ADDRESS, ETH_AMOUNT, ONE_DAY, START_TIMESTAMP, END_TIMESTAMP],
	});
	console.log('verified MODA pool factory...');
};

deploy();
