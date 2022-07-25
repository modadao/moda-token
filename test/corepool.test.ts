import { BigNumber } from '@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { ModaCorePool } from '../typechain-types';
import { revertSnapshot, takeSnapshot } from './helper';
import { setup, Setup } from './setup';
import {
	add,
	fastForward,
	fromTimestampBN,
	toTimestampBN,
	addTimestamp,
	toTimestamp,
	toSeconds,
	blockNow,
} from './utils';

chai.use(chaiDateTime);

const userBalances = [parseEther('2000'), parseEther('200')];

describe('Core Pool', () => {
	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		const { firstUser, secondUser, modaCorePool } = data;

		await expect(
			modaCorePool.connect(firstUser).stakeAsPool(secondUser.address, parseEther('100'))
		).to.be.revertedWith('pool is not registered');
	});

	it('Should revert on invalid lock interval', async () => {
		const { start, firstUser, modaCorePool } = data;

		const lockedUntil = toTimestampBN(add(start, { days: 1, years: 1 }));
		await expect(
			modaCorePool.connect(firstUser).stake(parseEther('100'), lockedUntil)
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year', async () => {
		const { start, firstUser, modaCorePool, moda } = data;

		// Set up the balance first
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		const amount = parseEther('104');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, lockUntil);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(tokenAmount).to.equal(amount);
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Now attempt to withdraw it.
		await expect(
			modaCorePool.connect(firstUser).unstake(parseEther('0'), amount)
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait for more than a year though and...
		const futureDate = add(start, { days: 365 });
		await fastForward(futureDate);

		await modaCorePool.connect(firstUser).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Expects new deposit for the rewards earned
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);

		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
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
		] = await modaCorePool.getDeposit(firstUser.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 150 }));
		expect(isYield).to.equal(true);
	});

	it('Should allow a user to stake deposit for 1 month.', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		// Set up the balance first
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		const lockUntil = toTimestampBN(add(start, { days: 28 }));
		const amount: BigNumber = parseEther('104');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, lockUntil);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			modaCorePool.connect(firstUser).unstake(parseEther('0'), parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		await expect(modaCorePool.connect(firstUser).unstake(0, amount)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		const futureDate = add(start, { days: 29 });
		await fastForward(futureDate);
		await modaCorePool.connect(firstUser).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);
		// Expects new deposit for the rewards earned
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);
		// Examining the only deposit.
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
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
		] = await modaCorePool.getDeposit(firstUser.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 150 }));
		expect(isYield).to.equal(true);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest (use MODA)', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		// Set up the balance first
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let lockUntil = add(start, { days: 28 });

		const amount = parseEther('104');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, toTimestamp(lockUntil));

		// Is there a new Deposit?
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);
		let lastLocked = 0;
		// DEPOSIT 0
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(tokenAmount.eq(amount));
		expect(weight.eq(BigNumber.from('111977944000000000000000000')));
		expect(lockedUntil).to.equal(toTimestampBN(lockUntil));
		expect(isYield).to.equal(false);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);

		// Now attempt to withdraw part of it.
		// Wait for less than a 28 days and expect failure.
		await expect(modaCorePool.connect(firstUser).unstake(0, parseEther('100'))).to.be.revertedWith(
			'deposit not yet unlocked'
		);
		await fastForward(add(start, { days: 27, hours: 23, minutes: 59 }));

		// Before unstake executes the user should have the previous balances.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));

		// And a withdrawal should still fail.
		await expect(modaCorePool.connect(firstUser).unstake(0, amount.div(2))).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		await fastForward(add(start, { days: 28 }));

		// Before unstake executes the user should have the previous balances.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		await modaCorePool.connect(firstUser).unstake(0, amount.div(2));

		// They should have two deposits in the array still.
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);

		// Examine the tokens this address now owns.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount.div(2)));

		// Is there a new Deposit?
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);
		// DEPOSIT 0 (initial)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(tokenAmount).to.equal(amount.div(2));
		expect(weight.eq(parseEther('559890240')));
		expect(lockedUntil).to.equal(toTimestampBN(lockUntil));
		expect(isYield).to.equal(false);

		// If we lock it a bit longer...
		await expect(
			modaCorePool
				.connect(firstUser)
				.updateStakeLock(0, addTimestamp(fromTimestampBN(lockedUntil), { days: 2 }))
		).to.emit(modaCorePool, 'StakeLockUpdated');

		lastLocked = toTimestamp(add(fromTimestampBN(lockedUntil), { days: 2 }));
		let nextRewardTime = add(fromTimestampBN(lockedUntil), { days: 2, minutes: 2 });

		// Wait a until the first deposit is unlocked to claim it.
		await fastForward(nextRewardTime);
		// Get the second deposit's unlock time.
		nextRewardTime = add(fromTimestampBN(lockedUntil), { minutes: 65 });

		await modaCorePool.connect(firstUser).processRewards();
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(4);
		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(tokenAmount).to.equal(parseEther('52')); // first rewards
		expect(weight).to.equal(parseEther('56273932')); // Weight won't stay the same.
		expect(lockedUntil).to.equal(lastLocked); // Rewards are locked until the same time as Deposit 0.
		expect(isYield).to.be.false;

		// Before unstaking the first deposit executes the user should have the previous balances.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount.div(2)));
		// Unstake whatever remains of that first deposit.
		await modaCorePool.connect(firstUser).unstake(0, amount.div(2));
		// After unstaking the remainder of the first deposit user should have the previous balances.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Another Deposit is created.
		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 0);
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
			] = await modaCorePool.getDeposit(firstUser.address, deposit);

			if (lockedUntil.toNumber() > lastTimestamp) {
				// Wait a until the first deposit is unlocked to claim it.
				nextRewardTime = fromTimestampBN(lockedUntil.add(1));
				await fastForward(nextRewardTime);
				lastTimestamp = lockedUntil.toNumber() + 1;
			}

			// Unstake whatever remains of this deposit.
			await modaCorePool.connect(firstUser).unstake(deposit, tokenAmount);
			totalRewards = totalRewards.add(tokenAmount);

			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await modaCorePool.getDeposit(firstUser.address, deposit);
			expect(tokenAmount).to.equal(0); // Done.
			expect(weight).to.equal(0);
			expect(lockedFrom).to.equal(0);
			expect(lockedUntil).to.equal(0);
			expect(isYield).to.be.false;
		}
	});

	it('Should allow an owner to update the reward locking period', async () => {
		const { owner, modaCorePool, lpPool } = data;

		await expect(modaCorePool.connect(owner).setRewardLockingPeriod(toSeconds(300)))
			.to.emit(modaCorePool, 'RewardLockingPeriodUpdated')
			.withArgs(toSeconds(150), toSeconds(300));

		await expect(lpPool.connect(owner).setRewardLockingPeriod(toSeconds(300)))
			.to.emit(lpPool, 'RewardLockingPeriodUpdated')
			.withArgs(toSeconds(150), toSeconds(300));
	});

	it('Should reject non-owner requests to update the reward locking period', async () => {
		const { firstUser, modaCorePool, lpPool } = data;

		await expect(
			modaCorePool.connect(firstUser).setRewardLockingPeriod(toSeconds(300))
		).to.be.revertedWith('Ownable: caller is not the owner');

		await expect(
			lpPool.connect(firstUser).setRewardLockingPeriod(toSeconds(300))
		).to.be.revertedWith('Ownable: caller is not the owner');
	});

	it('Should should use the updated locking period when set', async () => {
		const { start, owner, firstUser, modaCorePool, moda } = data;

		// Set our locking period to 10 days instead of 150.
		await expect(modaCorePool.connect(owner).setRewardLockingPeriod(toSeconds(10)))
			.to.emit(modaCorePool, 'RewardLockingPeriodUpdated')
			.withArgs(toSeconds(150), toSeconds(10));

		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		const amount = parseEther('104');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, lockUntil);

		// Wait for more than a year
		const futureDate = add(start, { days: 365 });
		await fastForward(futureDate);

		// Then we can unstake
		await modaCorePool.connect(firstUser).unstake(0, amount);

		// Did our 10 days get taken into account?
		const [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 10 }));
		expect(isYield).to.equal(true);
	});

	it('Should default the reward locking period to 150 days', async () => {
		const { modaCorePool, lpPool } = data;

		expect(await modaCorePool.rewardLockingPeriod()).to.equal(toSeconds(150));
		expect(await lpPool.rewardLockingPeriod()).to.equal(toSeconds(150));
	});

	it('Should prevent users from staking before the pool starts', async () => {
		const { firstUser, corePoolFactory, moda, factory, modaCorePool, lpToken } = data;
		const amount = parseEther('100');

		const testPool = (await corePoolFactory.deploy(
			moda.address,
			factory.address,
			modaCorePool.address,
			lpToken.address,
			100,
			addTimestamp(await blockNow(), { months: 1 })
		)) as ModaCorePool;

		await moda.connect(firstUser).approve(modaCorePool.address, amount);

		// It should fail before the pool is ready
		await expect(
			testPool.connect(firstUser).stake(amount, addTimestamp(await blockNow(), { months: 6 }))
		).to.be.revertedWith('pool not active');
	});
});
