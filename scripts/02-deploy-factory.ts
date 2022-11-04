import { formatEther, parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { add, addTimestamp, toTimestamp } from '../test/utils';
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
	console.log('Deploying factory contract...');

	const FactoryFactory = (await ethers.getContractFactory('ModaPoolFactory')) as ModaPoolFactory__factory;
	const factory = await FactoryFactory.deploy(
		MODA_TOKEN_ADDRESS,
		ETH_AMOUNT,
		ONE_DAY,
		START_TIMESTAMP,
		END_TIMESTAMP,
	);
	await factory.deployed();

	console.log('Deployed to ', factory.address);
	console.log('Initial Moda per Second: ', formatEther(await factory.initialModaPerSecond()));
};

deploy();
