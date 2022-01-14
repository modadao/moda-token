import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { ethers, upgrades } from 'hardhat';
import {
	EscrowedModaERC20,
	ModaCorePool,
	ModaPoolBase,
	ModaPoolFactory,
	Token,
} from '../typechain-types';
import {
	add,
	fastForward,
	fromTimestamp,
	ROLE_TOKEN_CREATOR,
	addTimestamp,
	toTimestamp,
} from './utils';

describe('Shadow Pool', () => {
	let token: Token;
	let otherToken: Token;
	let escrowToken: EscrowedModaERC20;
	let factory: ModaPoolFactory;
	let corePool: ModaCorePool;
	let shadowPool: ModaCorePool;

	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	const userBalances = [ethers.utils.parseEther('2000'), ethers.utils.parseEther('100')];

	function logSetup() {
		console.log('Owner', owner.address);
		console.log('Users', { owner: owner.address, user0: user0.address, user1: user1.address });
		console.log('Token', escrowToken.address);
		console.log('Escrow Token', escrowToken.address);
		console.log('Core Pool', corePool.address);
	}

	beforeEach(async () => {
		let currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);

		[owner, user0, user1] = await ethers.getSigners();

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(
			tokenFactory,
			[[user0.address, user1.address], userBalances],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		// We need a second token to test shadow pools with
		otherToken = (await tokenFactory.deploy()) as Token;
		await otherToken.deployed();
		await otherToken.initialize([user0.address, user1.address], userBalances);

		const latestBlock = await ethers.provider.getBlock('latest');
		let nextTimestamp = latestBlock.timestamp + 20;

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

		nextTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
		shadowPool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			factory.address, // This is the moda Core Pool.
			corePool.address,
			otherToken.address,
			900, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			nextTimestamp // initTimestamp initial block timestamp used to calculate the rewards
		)) as ModaCorePool;
		await shadowPool.deployed();
		await factory.registerPool(shadowPool.address);

		// logSetup();
	});

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		await expect(
			corePool.connect(user0).stakeAsPool(user1.address, ethers.utils.parseEther('100'))
		).to.be.revertedWith('pool is not registered');
	});

	it('Should revert on invalid lock interval', async () => {
		const endDate = add(start, { years: 1, days: 1 });
		await expect(
			shadowPool.connect(user0).stake(ethers.utils.parseEther('100'), toTimestamp(endDate))
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year. Using MODA.', async () => {
		// Check up the balances first
		expect(await otherToken.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate = add(start, { days: 364, hours: 23, minutes: 59, seconds: 45 });
		//console.log('lockedUntil', lockUntil);
		const amount = ethers.utils.parseEther('104');
		const newBalance = userBalances[0].sub(amount);

		await otherToken.connect(user0).approve(shadowPool.address, amount);
		expect(await otherToken.allowance(user0.address, shadowPool.address)).to.equal(amount);
		// This is a shadow pool, so it behaves differently when processing rewards.
		await shadowPool.connect(user0).stake(amount, toTimestamp(endDate));

		// And given that we've already staked our amount, we shouldn't be able to stake again.
		await expect(shadowPool.connect(user0).stake(amount, toTimestamp(endDate))).to.be.revertedWith(
			'ERC20: transfer amount exceeds allowance'
		);

		// Staking moves the user's Other Tokens to the shadow pool.
		expect(await otherToken.balanceOf(shadowPool.address)).to.equal(amount);

		// There should now be one deposit in the shadow pool.
		expect(await shadowPool.getDepositsLength(user0.address)).to.equal(1);
		let [
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(amount);
		expect(weight).to.equal(ethers.utils.parseEther('207999896'));
		expect(lockedUntil).to.equal(lockedUntil);
		expect(isYield).to.be.false;

		// An attempt to withdraw it now should revert.
		await expect(
			shadowPool
				.connect(user0)
				.unstake(ethers.utils.parseEther('0'), ethers.utils.parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');

		// Before unstake executes the user should have their new balance of other tokens.
		expect(await otherToken.balanceOf(user0.address)).to.equal(newBalance);

		// Wait for more than a year though and we should be able to unstake.
		await fastForward(add(start, { years: 1, days: 1 }));
		await shadowPool.connect(user0).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(user0.address)).to.equal(ethers.utils.parseEther('2000'));

		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(user0.address)).to.equal(1);

		// This is where the shadow pool differs. Its MODA rewards are sent to the CorePool.
		// The user must collect them from there when the time comes to vest.
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);

		// It may seem that way but let's be sure...
		[
			tokenAmount, // @dev other token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		[
			tokenAmount, // @dev Moda amount received
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount.gte(ethers.utils.parseEther('149099999')));
		expect(weight.gte(ethers.utils.parseEther('298199999999765')));
		expect(isYield).to.equal(true);

		let nextMonth: Date = fromTimestamp(lockedUntil.toNumber() + 3600);
		await fastForward(nextMonth);

		// Before unstake on the core pool executes the user should have their original moda balance.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);
		await corePool.connect(user0).unstake(0, tokenAmount);
		// After unstake the user should have more MODA.
		expect(await token.balanceOf(user0.address)).gte(ethers.utils.parseEther('149101000'));

		// Is there anything remaining? There shouldn't be at this point.
		expect(await shadowPool.getDepositsLength(user0.address)).to.equal(1);

		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.be.false;

		// But there should be a yield in the core pool
		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);

		// Let's look
		({ isYield } = await corePool.getDeposit(user0.address, 1));
		expect(isYield).to.be.true;
	});
});
