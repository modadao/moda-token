import { ethers } from 'hardhat';
import { ModaPoolFactory__factory } from '../typechain-types';

import { FACTORY_ADDRESS, START_TIMESTAMP, CORE_WEIGHT } from './config';

const deploy = async () => {
	console.log('Deploying CorePool contract...');

	const FactoryFactory = (await ethers.getContractFactory('ModaPoolFactory')) as ModaPoolFactory__factory;
	const factory = await FactoryFactory.attach(FACTORY_ADDRESS);

	const trx = await factory.createCorePool(START_TIMESTAMP, CORE_WEIGHT);
	console.log(`Transaction sent: ${trx.hash}`);
	await trx.wait();

	const registrations = await factory.queryFilter(factory.filters.PoolRegistered());
	if (registrations.length !== 1) {
		throw new Error(`Expected 1 registration, got ${registrations.length}`);
	}

	console.log('Done!', registrations[0].args.poolAddress);
};

deploy().catch(console.error);
