import { formatEther, parseEther } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { add, addTimestamp, blockNow, toTimestamp } from '../test/utils';
import { ModaPoolFactory__factory } from '../typechain-types';
import { ONE_DAY } from './constants';

import {
  MODA_TOKEN_ADDRESS,
  CORE_POOL_ADDRESS,
  START_TIMESTAMP,
  END_TIMESTAMP,
  WEIGHT,
  ETH_AMOUNT,
  FACTORY_ADDRESS,
} from './config';

const deploy = async () => {
	await hre.run('verify:verify', {
		address: CORE_POOL_ADDRESS,
		constructorArguments: [
                  MODA_TOKEN_ADDRESS,
                  FACTORY_ADDRESS,
                  ethers.constants.AddressZero,
                  MODA_TOKEN_ADDRESS,
                  WEIGHT,
                  START_TIMESTAMP,
		],
	});
	console.log('verified Core Pool contract...');
};

deploy();
