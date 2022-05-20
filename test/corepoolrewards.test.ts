import { BigNumber } from '@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import { expect } from 'chai';
import { revertSnapshot, takeSnapshot } from './helper';
import { setup, Setup } from './setup';
import { add, fastForward, fromTimestampBN, toTimestampBN, mineBlocks } from './utils';

const userBalances = [parseEther('2000'), parseEther('200')];

describe('Core Pool Rewards', () => {
	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should deposit the reward when processing rewards', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		//pre-condition
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		const lockUntil = toTimestampBN(add(start, { days: 30 }));
		const amount = parseEther('100');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, lockUntil);

		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);

		const futureDate: Date = add(start, { days: 31 });
		await fastForward(futureDate);
		await modaCorePool.connect(firstUser).processRewards();

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);
		const [oldTokenAmount] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(oldTokenAmount.eq(amount)).to.be.true;

		let [
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

	it('Should allow a user to unstake a locked yield deposit after 1 year.', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		//pre-condition
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		const lockUntil = toTimestampBN(add(start, { days: 30 }));
		const amount: BigNumber = parseEther('100');
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, lockUntil);

		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0].sub(amount));
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);

		const futureDate: Date = add(start, { days: 30 });
		await fastForward(futureDate);
		await modaCorePool.connect(firstUser).processRewards();

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 150 }));
		expect(isYield).to.equal(true);

		//post-condition
		await fastForward(add(futureDate, { days: 30 }));
		await expect(modaCorePool.connect(firstUser).unstake(1, tokenAmount)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait for more than a year though and...
		await fastForward(add(futureDate, { days: 366 }));
		await modaCorePool.connect(firstUser).unstake(1, tokenAmount);

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(3);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, 1);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to MODA)', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		//logSetup();
		// Set up the balance first
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		const amount = parseEther('104');
		const unlocked = BigNumber.from(0);
		await moda.connect(firstUser).approve(modaCorePool.address, amount);
		expect(await moda.allowance(firstUser.address, modaCorePool.address)).to.equal(amount);
		await modaCorePool.connect(firstUser).stake(amount, unlocked);

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
		expect(weight).to.equal(parseEther('104000000'));
		//expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		interface ROI_Record {
			Deposit: BigNumber;
			Amount: BigNumber;
			Weight: BigNumber;
			MODA: BigNumber;
		}
		let ReturnsOnInvestment = Array<ROI_Record>();

		let RoI_: ROI_Record = {
			Deposit: BigNumber.from(0),
			Amount: BigNumber.from(0),
			Weight: BigNumber.from(0),
			MODA: BigNumber.from(0),
		};
		let RoI: ROI_Record = Object.assign({}, RoI_);

		let nextMonth: Date = add(start, { months: 1 });
		const maxMonths = 17;
		for (let ff = 0; ff < maxMonths; ++ff) {
			// Day after rewards should be available, approximately.
			nextMonth = add(nextMonth, { months: 1 });
			await fastForward(nextMonth);
			await mineBlocks(10);

			// Collect rewards.
			await modaCorePool.connect(firstUser).processRewards();
			let depositIndex = await modaCorePool.getDepositsLength(firstUser.address);
			//console.log('depositIndex', depositIndex);
			RoI.Deposit = depositIndex.sub(1);
			// Examine the tokens this address now owns.
			RoI.MODA = await moda.balanceOf(firstUser.address);
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await modaCorePool.getDeposit(firstUser.address, depositIndex.sub(1));
			expect(isYield).to.equal(true);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await modaCorePool.connect(firstUser).unstake(BigNumber.from(0), amount);

		// Examine the tokens this address now owns.
		RoI.Deposit = BigNumber.from(maxMonths + 1);
		RoI.MODA = await moda.balanceOf(firstUser.address);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await modaCorePool.getDeposit(firstUser.address, BigNumber.from(0));
		RoI.Amount = tokenAmount;
		RoI.Weight = weight;
		ReturnsOnInvestment.push(RoI);
		RoI = Object.assign({}, RoI_);

		//console.log(ReturnsOnInvestment);
		/**
		 * Weight slowly drops with each block count trigger. i.e. every block.
		 * Multiple deposits stored as `processRewards` is called.
		 * MODA is restored to the account.
		 */
	});
});
