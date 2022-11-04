import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
	Token__factory,
	ModaCorePool__factory,
	ModaPoolFactory__factory,
	MintableTestToken__factory,
} from '../typechain-types';
import { CORE_POOL_ADDRESS, FACTORY_ADDRESS, MODA_TOKEN_ADDRESS, SLP_TOKEN_ADDRESS, SLP_POOL_START_TIMESTAMP, WEIGHT } from './config';

const deploy = async () => {
	const FactoryFactory = (await ethers.getContractFactory('ModaPoolFactory')) as ModaPoolFactory__factory;
        const factory = FactoryFactory.attach(FACTORY_ADDRESS);

	const CorePoolFactory = (await ethers.getContractFactory('ModaCorePool')) as ModaCorePool__factory;
	const corePool = CorePoolFactory.attach(CORE_POOL_ADDRESS);

	console.log('Deploying lpTokenPool...');
	const lpTokenPool = await CorePoolFactory.deploy(
		MODA_TOKEN_ADDRESS,
		FACTORY_ADDRESS,
		CORE_POOL_ADDRESS,
		SLP_TOKEN_ADDRESS,
		WEIGHT,
		SLP_POOL_START_TIMESTAMP,
	);
	await lpTokenPool.deployed();
	console.log(`Deployed at ${lpTokenPool.address}`);

	const register = await factory.registerPool(lpTokenPool.address);
	await register.wait();
	console.log('Registered!');
};

deploy();
