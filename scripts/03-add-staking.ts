import { formatEther, parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { add, addTimestamp, blockNow, toTimestamp } from '../test/utils';
import {
	Token__factory,
	ModaCorePool__factory,
	ModaPoolFactory__factory,
} from '../typechain-types';

const deploy = async () => {
	console.log('Attaching token...');
	const TokenFactory = (await ethers.getContractFactory('Token')) as Token__factory;
	const token = TokenFactory.attach('0x9D2aa0CFE9489D1fE32a60791ea502A4FfD1E8Fd');
	// const token = TokenFactory.attach('0x1117ac6ad6cdf1a3bc543bad3b133724620522d5');
	console.log(`Token Proxy at: ${token.address}`);

	const start = add(await blockNow(), { hours: 1 });

	console.log('Deploying factory contract...');
	const FactoryFactory = (await ethers.getContractFactory(
		'ModaPoolFactory'
	)) as ModaPoolFactory__factory;
	const factory = await FactoryFactory.deploy(
		token.address,
		parseEther('1'),
		86400, // One day
		toTimestamp(start),
		addTimestamp(start, { months: 1 })
	);
	console.log('Transaction sent, awaiting deployed...');
	console.log(factory.deployTransaction.hash);
	await factory.deployed();

	console.log('Initial Moda per Second: ', formatEther(await factory.initialModaPerSecond()));

	console.log('Deploying CorePool contract...');
	const trx = await factory.createCorePool(toTimestamp(start), 200);
	console.log(`Transaction sent: ${trx.hash}`);
	console.log('Waiting for confirmation...');
	await trx.wait();

	const registrations = await factory.queryFilter(factory.filters.PoolRegistered());
	if (registrations.length !== 1) {
		throw new Error(`Expected 1 registration, got ${registrations.length}`);
	}

	const CorePoolFactory = (await ethers.getContractFactory(
		'ModaCorePool'
	)) as ModaCorePool__factory;
	const corePool = CorePoolFactory.attach(registrations[0].args.poolAddress);
	console.log('Done!');

	console.log(`Verify Factory with:`);
	console.log(
		`yarn verify ${factory.address} ${token.address} ${parseEther('1')} 86400 ${toTimestamp(
			start
		)} ${toTimestamp(add(start, { months: 1 }))}`
	);

	console.log(`Verify CorePool with:`);
	console.log(
		`yarn verify ${corePool.address} ${token.address} ${factory.address} ${
			ethers.constants.AddressZero
		} ${token.address} 200 ${toTimestamp(start)}`
	);
};

deploy();
