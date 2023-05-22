import { formatEther, parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { add, addTimestamp, blockNow, toTimestamp } from '../test/utils';
import { ModaPoolFactory__factory } from '../typechain-types';
import { ONE_DAY } from './constants';

import {
  MODA_TOKEN_ADDRESS,
  FACTORY_ADDRESS,
  START_TIMESTAMP,
  END_TIMESTAMP,
  WEIGHT,
  ETH_AMOUNT,
} from './config';

const deploy = async () => {
	console.log('Deploying CorePool contract...');

	const FactoryFactory = (await ethers.getContractFactory('ModaPoolFactory')) as ModaPoolFactory__factory;
	const factory = await FactoryFactory.attach(FACTORY_ADDRESS);

	const trx = await factory.createCorePool(START_TIMESTAMP, WEIGHT);
	console.log(`Transaction sent: ${trx.hash}`);
	await trx.wait();

	const registrations = await factory.queryFilter(factory.filters.PoolRegistered());
	if (registrations.length !== 1) {
		throw new Error(`Expected 1 registration, got ${registrations.length}`);
	}

	console.log('Done!', registrations[0].args.poolAddress);
};

deploy().catch(console.error);
