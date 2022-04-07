import { BigNumber } from '@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { ethers, upgrades } from 'hardhat';
import { ModaCorePool, ModaPoolFactory, Token } from '../typechain-types';
import {
	add,
	fastForward,
	fromTimestampBN,
	toTimestampBN,
	ROLE_TOKEN_CREATOR,
	addTimestamp,
	fromTimestamp,
	blockNow,
	toTimestamp,
} from './utils';

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

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		await expect(
			corePool.connect(user0).stakeAsPool(user1.address, parseEther('100'))
		).to.be.revertedWith('pool is not registered');
	});

	it('Should revert on invalid lock interval', async () => {
		const lockedUntil = toTimestampBN(add(start, { days: 1, years: 1 }));
		await expect(corePool.connect(user0).stake(parseEther('100'), lockedUntil)).to.be.revertedWith(
			'invalid lock interval'
		);
	});

	it('Should allow a user to unstake a locked deposit after 1 year', async () => {
		// Set up the balance first
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		const amount = parseEther('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(user0.address, corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(amount);
		expect(weight).to.equal(parseEther('207999896'));
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Now attempt to withdraw it.
		await expect(corePool.connect(user0).unstake(parseEther('0'), amount)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait for more than a year though and...
		const futureDate = add(start, { days: 365 });
		await fastForward(futureDate);

		await corePool.connect(user0).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Expects new deposit for the rewards earned
		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);

		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 365 }));
		expect(isYield).to.equal(true);
	});

	it('Should allow a user to stake deposit for 1 month.', async () => {
		// Set up the balance first
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		const lockUntil = toTimestampBN(add(start, { days: 28 }));
		const amount: BigNumber = parseEther('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(user0.address, corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			corePool.connect(user0).unstake(parseEther('0'), parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		await expect(corePool.connect(user0).unstake(0, amount)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		const futureDate = add(start, { days: 29 });
		await fastForward(futureDate);
		await corePool.connect(user0).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);
		// Expects new deposit for the rewards earned
		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);
		// Examining the only deposit.
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(0); // It's all gone.
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 365 }));
		expect(isYield).to.equal(true);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest (use MODA)', async () => {
		// Set up the balance first
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let lockUntil = add(start, { days: 28 });

		const amount = parseEther('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(user0.address, corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, toTimestamp(lockUntil));

		// Is there a new Deposit?
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);
		let lastLocked = 0;
		// DEPOSIT 0
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount.eq(amount));
		expect(weight.eq(BigNumber.from('111977944000000000000000000')));
		expect(lockedUntil).to.equal(toTimestampBN(lockUntil));
		expect(isYield).to.equal(false);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);

		// Now attempt to withdraw part of it.
		// Wait for less than a 28 days and expect failure.
		await expect(corePool.connect(user0).unstake(0, parseEther('100'))).to.be.revertedWith(
			'deposit not yet unlocked'
		);
		await fastForward(add(start, { days: 27, hours: 23, minutes: 59 }));

		// Before unstake executes the user should have the previous balances.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));

		// And a withdrawal should still fail.
		await expect(corePool.connect(user0).unstake(0, amount.div(2))).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		await fastForward(add(start, { days: 28 }));

		// Before unstake executes the user should have the previous balances.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		await corePool.connect(user0).unstake(0, amount.div(2));

		// They should have two deposits in the array still.
		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount.div(2)));

		// Is there a new Deposit?
		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);
		// DEPOSIT 0 (initial)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(amount.div(2));
		expect(weight.eq(parseEther('559890240')));
		expect(lockedUntil).to.equal(toTimestampBN(lockUntil));
		expect(isYield).to.equal(false);

		// If we lock it a bit longer...
		await expect(
			corePool
				.connect(user0)
				.updateStakeLock(0, addTimestamp(fromTimestampBN(lockedUntil), { days: 2 }))
		).to.emit(corePool, 'StakeLockUpdated');

		lastLocked = toTimestamp(add(fromTimestampBN(lockedUntil), { days: 2 }));
		let nextRewardTime = add(fromTimestampBN(lockedUntil), { days: 2, minutes: 2 });

		// Wait a until the first deposit is unlocked to claim it.
		await fastForward(nextRewardTime);
		// Get the second deposit's unlock time.
		nextRewardTime = add(fromTimestampBN(lockedUntil), { minutes: 65 });

		await corePool.connect(user0).processRewards();
		expect(await corePool.getDepositsLength(user0.address)).to.equal(4);
		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(parseEther('52')); // first rewards
		expect(weight).to.equal(parseEther('56273932')); // Weight won't stay the same.
		expect(lockedUntil).to.equal(lastLocked); // Rewards are locked until the same time as Deposit 0.
		expect(isYield).to.be.false;

		// Before unstaking the first deposit executes the user should have the previous balances.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount.div(2)));
		// Unstake whatever remains of that first deposit.
		await corePool.connect(user0).unstake(0, amount.div(2));
		// After unstaking the remainder of the first deposit user should have the previous balances.
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		// Another Deposit is created.
		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 0);
		expect(tokenAmount).to.equal(0); // Done.
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		let lastTimestamp = lastLocked;
		let totalRewards = BigNumber.from(0);
		// Let's go grab all those rewards.
		for (let deposit = 1; deposit < 4; deposit++) {
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(user0.address, deposit);

			if (lockedUntil.toNumber() > lastTimestamp) {
				// Wait a until the first deposit is unlocked to claim it.
				nextRewardTime = fromTimestampBN(lockedUntil.add(1));
				await fastForward(nextRewardTime);
				lastTimestamp = lockedUntil.toNumber() + 1;
			}

			// Unstake whatever remains of this deposit.
			await corePool.connect(user0).unstake(deposit, tokenAmount);
			totalRewards = totalRewards.add(tokenAmount);

			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(user0.address, deposit);
			expect(tokenAmount).to.equal(0); // Done.
			expect(weight).to.equal(0);
			expect(lockedFrom).to.equal(0);
			expect(lockedUntil).to.equal(0);
			expect(isYield).to.be.false;
		}

		expect(await token.balanceOf(user0.address)).to.equal('12480859136723762168372597');
	});
});
