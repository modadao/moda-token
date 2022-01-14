import { parseEther } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { ethers, upgrades } from 'hardhat';
import { ModaCorePool, ModaPoolFactory, Token } from '../typechain-types';
import { ROLE_TOKEN_CREATOR, addTimestamp, fromTimestamp, blockNow, toTimestamp } from './utils';

chai.use(chaiDateTime);

const userBalances = [parseEther('2000'), parseEther('200')];

describe('Core Pool', () => {
	let token: Token;
	let factory: ModaPoolFactory;
	let corePool: ModaCorePool;
	let start = new Date();
	let user0: SignerWithAddress, user1: SignerWithAddress;

	beforeEach(async () => {
		[user0, user1] = await ethers.getSigners();

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(
			tokenFactory,
			[[user0.address, user1.address], userBalances],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		const latestBlock = await ethers.provider.getBlock('latest');
		const nextTimestamp = latestBlock.timestamp + 15;

		const factoryFactory = await ethers.getContractFactory('ModaPoolFactory');
		factory = (await factoryFactory.deploy(
			token.address,
			parseEther('10'),
			30 * 24 * 60 * 60, // 30 days per update
			nextTimestamp,
			addTimestamp(fromTimestamp(nextTimestamp), { years: 2 })
		)) as ModaPoolFactory;
		await factory.deployed();

		const tx = await factory.createCorePool(nextTimestamp, 10);
		await tx.wait();

		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = corePoolFactory.attach(await factory.getPoolAddress(token.address)) as ModaCorePool;

		await token.grantRole(ROLE_TOKEN_CREATOR, factory.address);

		start = await blockNow();
	});

	it('should reject stakeAsPool calls from arbitrary addresses');
	it('should correctly compound moda per second', async () => {
		const start = await factory.modaPerSecondAt(await factory.startTimestamp());
		const secondsPerUpdate = await factory.secondsPerUpdate();

		// If we let 15 periods go by, we should be dishing out
		// =(start*(POW(0.97, 15))) Moda per second
		let result = start.mul(parseEther(Math.pow(0.97, 15).toString())).div(parseEther('1'));

		expect(
			await factory.modaPerSecondAt((await factory.startTimestamp()).add(secondsPerUpdate * 15))
		);

		// And if we let 50 periods go by, we should be dishing out
		// =(start*(POW(0.97, 50))) Moda per second
		result = start.mul(parseEther(Math.pow(0.97, 50).toString())).div(parseEther('1'));

		expect(
			await factory.modaPerSecondAt((await factory.startTimestamp()).add(secondsPerUpdate * 50))
		);
	});
});
