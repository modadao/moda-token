import { ModaCorePool, ModaPoolFactory, TestERC20, Token } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
	addTimestamp,
	blockNow,
	fromTimestamp,
	ROLE_TOKEN_CREATOR,
	THIRTY_DAYS_IN_SECONDS,
} from './utils';
import { ethers, upgrades } from 'hardhat';
import { parseEther } from '@ethersproject/units';
import { ContractFactory } from 'ethers';

export type Setup = {
	factory: ModaPoolFactory;
	firstUser: SignerWithAddress;
	lpPool: ModaCorePool;
	lpToken: TestERC20;
	moda: Token;
	modaCorePool: ModaCorePool;
	owner: SignerWithAddress;
	secondUser: SignerWithAddress;
	start: Date;
	thirdUser: SignerWithAddress;
	tokenFactory: ContractFactory;
	modaPoolFactory: ContractFactory;
	corePoolFactory: ContractFactory;
};

const MODA_POOL_WEIGHT = 200;
const LP_POOL_WEIGHT = 400;

export const setup = async (): Promise<Setup> => {
	const [owner, firstUser, secondUser, thirdUser] = await ethers.getSigners();
	const start = await blockNow();

	const nextTimestamp = start.getTime() / 1000 + 15;

	const tokenFactory = await ethers.getContractFactory('Token');
	const moda = (await upgrades.deployProxy(
		tokenFactory,
		[
			[firstUser.address, secondUser.address],
			[parseEther('2000'), parseEther('200')],
		],
		{
			kind: 'uups',
		}
	)) as Token;
	await moda.deployed();

	const modaPerSecond = parseEther('94754');

	const modaPoolFactory = await ethers.getContractFactory('ModaPoolFactory');
	const factory = (await modaPoolFactory.deploy(
		moda.address,
		modaPerSecond,
		THIRTY_DAYS_IN_SECONDS,
		nextTimestamp,
		addTimestamp(fromTimestamp(nextTimestamp), { years: 2 })
	)) as ModaPoolFactory;
	await factory.deployed();

	await factory.createCorePool(nextTimestamp, MODA_POOL_WEIGHT);

	const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
	const modaCorePool = corePoolFactory.attach(
		await factory.getPoolAddress(moda.address)
	) as ModaCorePool;

	const lpTokenFactory = await ethers.getContractFactory('TestERC20');
	const lpToken = (await lpTokenFactory.deploy(
		'Sushi LP',
		'SLP',
		parseEther('1000000')
	)) as TestERC20;
	await lpToken.setBalance(firstUser.address, parseEther('2000'));
	await lpToken.setBalance(secondUser.address, parseEther('200'));

	const lpPool = (await corePoolFactory.deploy(
		moda.address,
		factory.address,
		modaCorePool.address,
		lpToken.address,
		LP_POOL_WEIGHT,
		nextTimestamp
	)) as ModaCorePool;

	factory.registerPool(lpPool.address);

	await moda.grantRole(ROLE_TOKEN_CREATOR, factory.address);
	await moda.connect(firstUser).approve(modaCorePool.address, parseEther('2000'));
	await moda.connect(secondUser).approve(modaCorePool.address, parseEther('200'));
	await lpToken.connect(firstUser).approve(lpPool.address, parseEther('2000'));
	await lpToken.connect(secondUser).approve(lpPool.address, parseEther('200'));

	return {
		factory,
		firstUser,
		lpPool,
		lpToken,
		moda,
		modaCorePool,
		owner,
		secondUser,
		start,
		thirdUser,
		tokenFactory,
		modaPoolFactory,
		corePoolFactory,
	};
};
