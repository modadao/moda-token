import { formatEther, parseEther } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { add, addTimestamp, blockNow, toTimestamp } from '../test/utils';
import { ModaPoolFactory__factory } from '../typechain-types';
import { ONE_DAY } from './constants';

import { SLP_TOKEN_ADDRESS } from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: SLP_TOKEN_ADDRESS,
		constructorArguments: [],
	});
	console.log('verified test SLP token contract...');
};

deploy();
