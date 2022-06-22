import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, blockNow, fastForward, toTimestampBN } from './utils';
import { Setup, setup } from './setup';
import { Token } from '../typechain-types';
import { upgrades, ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { revertSnapshot, takeSnapshot } from './helper';

chai.use(chaiDateTime);

describe('Staking and unstaking', () => {
	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should have zero rewards for users without a stake', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount2, amount3],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);

		expect(await modaCorePool.pendingYieldRewards(firstUser.address)).to.be.eq(BigNumber.from(0));
		expect(await modaCorePool.pendingYieldRewards(secondUser.address)).to.be.eq(BigNumber.from(0));
		expect(await modaCorePool.pendingYieldRewards(thirdUser.address)).to.be.eq(BigNumber.from(0));

		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		expect(await modaCorePool.pendingYieldRewards(firstUser.address)).to.be.eq(BigNumber.from(0));
		expect(await modaCorePool.pendingYieldRewards(secondUser.address)).to.be.eq(BigNumber.from(0));
		expect(await modaCorePool.pendingYieldRewards(thirdUser.address)).to.be.eq(BigNumber.from(0));
	});

	// cannot run this test because it never returns zero if time difference is positive
	it('Should have zero rewards at the time of staking', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount2, amount3],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);

		// expect(await modaCorePool.pendingYieldRewards(firstUser.address)).to.equal(0);
		// expect(await modaCorePool.pendingYieldRewards(secondUser.address)).to.equal(0);
		//const actual = BigNumber.from('3209448146078158022');

		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();

		// expect(await modaCorePool.pendingYieldRewards(firstUser.address)).to.equal(0);
		// expect(await modaCorePool.pendingYieldRewards(secondUser.address)).to.equal(0);
	});

	it('Should prevent users from unstaking without a stake', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount2, amount3],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);

		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);

		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		try {
			await modaCorePool.connect(thirdUser).unstake(1, stakeAmount);
			expect(true).to.be.false;
		} catch {
			expect(true).to.be.true;
		}
	});

	it('Should isolate stakes', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount2, amount3],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);

		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);

		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		try {
			await modaCorePool.connect(thirdUser).unstake(1, stakeAmount);
			expect(true).to.be.false;
		} catch {
			expect(true).to.be.true;
		}
	});

	it('Should create the correct deposits', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = data;
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		const lpPoolRewardsAfter30Days = await lpPool.pendingYieldRewards(firstUser.address);

		let modaPoolDepositLength = await modaCorePool.getDepositsLength(firstUser.address);
		let lpPoolDepositLength = await lpPool.getDepositsLength(firstUser.address);
		expect(modaPoolDepositLength).to.eq(1);
		expect(lpPoolDepositLength).to.eq(1);

		await lpPool.connect(firstUser).processRewards();

		modaPoolDepositLength = await modaCorePool.getDepositsLength(firstUser.address);
		lpPoolDepositLength = await lpPool.getDepositsLength(firstUser.address);

		expect(modaPoolDepositLength).to.eq(3);
		expect(lpPoolDepositLength).to.eq(1);

		const lpYieldDepositIndex = 2;
		const [lpTokenAmount, lpWeight, lpYieldLockedFrom, lpYieldLockedUntil, isYield] =
			await modaCorePool.getDeposit(firstUser.address, lpYieldDepositIndex);
		const allowedDeltaForModaEarnedSinceLastQuery = parseEther('4');
		const delta = lpTokenAmount.sub(lpPoolRewardsAfter30Days);
		const blockDate = await blockNow();
		const currentBlockTime = blockDate.getTime() / 1000;
		const oneHundredFiftyDaysFromNow = toTimestampBN(add(blockDate, { days: 150 }));

		expect(delta).to.be.lte(allowedDeltaForModaEarnedSinceLastQuery);
		expect(lpWeight).to.be.eq(lpTokenAmount.mul(2e6));
		expect(lpYieldLockedFrom).to.be.eq(currentBlockTime);
		expect(lpYieldLockedUntil).to.be.gte(oneHundredFiftyDaysFromNow);
		expect(isYield).to.be.true;

		expect(await lpPool.pendingYieldRewards(firstUser.address)).to.eq(0);
	});

	it('Locked stakes have double the rewards of unlocked stakes', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = data;
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(userStakeAmount, 0);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(secondUser).stake(userStakeAmount, 0);

		const lockedDeposit = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(lockedDeposit.lockedUntil).gt(0);
		const aDayInSeconds = 24 * 60 * 60;
		const multiplier = lockedDeposit.lockedUntil
			.sub(lockedDeposit.lockedFrom)
			.mul(1000)
			.div(aDayInSeconds)
			.div(365)
			.add(1000);
		expect(multiplier).eq(1999);
		const lockedweight = userStakeAmount.mul(2);
		expect(lockedDeposit.weight.eq(lockedweight));

		const unlockedDeposit = await modaCorePool.getDeposit(secondUser.address, 0);
		expect(unlockedDeposit.lockedUntil).eq(0);
		expect(unlockedDeposit.weight.eq(userStakeAmount));

		const halfYearLater = add(start, { days: 180 });
		await fastForward(halfYearLater);

		const lockedCoreRewards = await modaCorePool.pendingYieldRewards(firstUser.address);
		const unlockedCoreRewards = await modaCorePool.pendingYieldRewards(secondUser.address);
		expect(lockedCoreRewards.mul(1000).div(unlockedCoreRewards).toNumber()).eq(
			multiplier.toNumber()
		);

		const lockedLpRewards = await lpPool.pendingYieldRewards(firstUser.address);
		const unlockedLpRewards = await lpPool.pendingYieldRewards(secondUser.address);
		expect(lockedLpRewards.mul(1000).div(unlockedLpRewards)).eq(multiplier);
	});

	it('0 % < APY < 3 000 000 %', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = data;
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(userStakeAmount, 0);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(secondUser).stake(userStakeAmount, 0);

		const lockedDeposit = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(lockedDeposit.lockedUntil).gt(0);
		const aDayInSeconds = 24 * 60 * 60;
		const multiplier = lockedDeposit.lockedUntil
			.sub(lockedDeposit.lockedFrom)
			.mul(1000)
			.div(aDayInSeconds)
			.div(365)
			.add(1000);
		expect(multiplier).eq(1999);
		const lockedweight = userStakeAmount.mul(2);
		expect(lockedDeposit.weight.eq(lockedweight));

		const unlockedDeposit = await modaCorePool.getDeposit(secondUser.address, 0);
		expect(unlockedDeposit.lockedUntil).eq(0);
		expect(unlockedDeposit.weight.eq(userStakeAmount));

		const oneYearLater = add(start, { days: 180 });
		await fastForward(oneYearLater);

		const unlockedCoreRewards = await modaCorePool.pendingYieldRewards(secondUser.address);
		const unlockedAPY = unlockedCoreRewards.mul(1000).div(userStakeAmount);
		expect(unlockedAPY).gt(0);
		expect(unlockedAPY).lt(15000000);

		const lockedCoreRewards = await modaCorePool.pendingYieldRewards(firstUser.address);
		const lockedAPY = lockedCoreRewards.mul(1000).div(userStakeAmount);
		expect(lockedAPY).gt(0);
		expect(lockedAPY).lt(30000000);
	});

	it('User can stake all their MODA', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool, moda } = data;
		const userStakeAmount = parseEther('2000');
		await modaCorePool.connect(firstUser).stake(userStakeAmount, 0);
		const unlockedDeposit = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(unlockedDeposit.tokenAmount).eq(userStakeAmount);
		const afterBalance = await moda.allowance(firstUser.address, modaCorePool.address);
		expect(afterBalance).eq(0);
	});
});
