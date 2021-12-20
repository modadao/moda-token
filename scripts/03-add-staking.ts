import { ethers } from 'hardhat';
import { add, blockNow, toTimestamp } from '../test/utils';
import { Token__factory, ModaCorePool__factory } from '../typechain';

const deploy = async () => {
	console.log('Attaching token...');
	const TokenFactory = (await ethers.getContractFactory('Token')) as Token__factory;
	const token = TokenFactory.attach('0x9D2aa0CFE9489D1fE32a60791ea502A4FfD1E8Fd');
	// const token = TokenFactory.attach('0x1117ac6ad6cdf1a3bc543bad3b133724620522d5');
	console.log(`Token Proxy at: ${token.address}`);

	const start = add(await blockNow(), { hours: 1 });

	/*
	 * @param _moda MODA ERC20 Token ModaERC20 address
	 * @param _modaPool MODA ERC20 Liquidity Pool contract address
	 * @param _poolToken token the pool operates on, for example MODA or MODA/ETH pair
	 * @param _weight number representing a weight of the pool, actual weight fraction
	 *      is calculated as that number divided by the total pools weight and doesn't exceed one
	 * @param _modaPerSecond initial MODA/block value for rewards
	 * @param _secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), seconds
	 * @param _initTimestamp initial block timestamp used to calculate the rewards
	 * @param _endTimestamp block timestamp when farming stops and rewards cannot be updated anymore
	 */
	console.log('Deploying CorePool contract...');
	const ModaCorePoolFactory = (await ethers.getContractFactory(
		'ModaCorePool'
	)) as ModaCorePool__factory;
	// const trx = await ModaCorePoolFactory.getDeployTransaction(
	// 	token.address,
	// 	ethers.constants.AddressZero,
	// 	token.address,
	// 	80,
	// 	100,
	// 	5,
	// 	toTimestamp(now),
	// 	toTimestamp(add(now, { days: 7 }))
	// );

	// console.log(await ModaCorePoolFactory.signer.estimateGas(trx));
	const corePool = await ModaCorePoolFactory.deploy(
		token.address,
		ethers.constants.AddressZero,
		token.address,
		80,
		100,
		5,
		toTimestamp(start),
		toTimestamp(add(start, { days: 7 }))
	);
	console.log(`Transaction sent ${corePool.deployTransaction.hash}. Mining...`);
	await corePool.deployed();
	console.log(`Core Pool deployed to: ${corePool.address}`);

	console.log('Done!');

	console.log(`Verify CorePool with:`);
	console.log(
		`yarn verify ${corePool.address} ${token.address} ${ethers.constants.AddressZero} ${
			token.address
		} 80 100 5 ${toTimestamp(start)} ${toTimestamp(add(start, { days: 7 }))}`
	);
};

deploy();
