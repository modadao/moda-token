import { formatEther, parseEther } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { add, addTimestamp, blockNow, toTimestamp } from '../test/utils';
import { ModaPoolFactory__factory } from '../typechain-types';
import { ONE_DAY } from './constants';

import {
  MODA_TOKEN_ADDRESS,
  CORE_POOL_ADDRESS,
  SLP_POOL_START_TIMESTAMP,
  END_TIMESTAMP,
  WEIGHT,
  ETH_AMOUNT,
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
                  WEIGHT,
                  SLP_POOL_START_TIMESTAMP,
		],
	});
	console.log('verified SLP Pool contract...');
};

deploy();
