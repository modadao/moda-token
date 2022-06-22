import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, fastForward, toTimestampBN } from './utils';
import { Setup, setup } from './setup';
import { Token } from '../typechain-types';
import { upgrades, ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { takeSnapshot, revertSnapshot } from './helper';

chai.use(chaiDateTime);

describe('Rewards', () => {
	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should have correct rewards with multiple pools', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = data;
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		const modaPoolRewardsAfter30Days = await modaCorePool.pendingYieldRewards(firstUser.address);
		expect(modaPoolRewardsAfter30Days).to.be.gt(0);

		const lpReward = await lpPool.pendingYieldRewards(firstUser.address);
		expect(lpReward, 'LP pool rewards for first user after 30 days').to.gt(
			modaPoolRewardsAfter30Days.mul(19).div(10)
		);
		expect(lpReward, 'LP pool rewards for first user after 30 days').to.lt(
			modaPoolRewardsAfter30Days.mul(21).div(10)
		);

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.eq(1);
		expect(await lpPool.getDepositsLength(firstUser.address)).to.eq(1);
		await modaCorePool.connect(firstUser).processRewards();
		expect(
			await modaCorePool.getDepositsLength(firstUser.address),
			'Has original deposit and a yield'
		).to.eq(2);
		await lpPool.connect(firstUser).processRewards();
		expect(
			await modaCorePool.getDepositsLength(firstUser.address),
			'LP Pool rewards paid out in MODA Pool yield deposits'
		).to.eq(4);

		const rewardsAfterClaim = await modaCorePool.pendingYieldRewards(firstUser.address);
		expect(rewardsAfterClaim).to.equal(0);

		await modaCorePool.connect(secondUser).stake(userStakeAmount, lockUntil);

		const sixtyDaysAfter = add(start, { days: 60 });
		await fastForward(sixtyDaysAfter);

		const firstUserRewards = await modaCorePool.pendingYieldRewards(firstUser.address);
		const secondUserRewards = await modaCorePool.pendingYieldRewards(secondUser.address);

		// TODO: calculate these values (not hard code) and check
		// expect(firstUserRewards, 'First user').to.equal(BigNumber.from('4165215393737488061985121'));
		// expect(secondUserRewards, 'Second user').to.equal(BigNumber.from('6397136248225413888'));
	});

	it('Resets the pending rewards amount after a user compounds their rewards', async () => {
		const { modaCorePool, lpPool, start, firstUser } = data;
		const firstUserStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(firstUserStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(firstUserStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		expect(
			await modaCorePool.pendingYieldRewards(firstUser.address),
			'MODA Core Pool has pending rewards'
		).to.be.gt(0);

		expect(
			await lpPool.pendingYieldRewards(firstUser.address),
			'LP Pool has pending rewards'
		).to.be.gt(0);

		await modaCorePool.connect(firstUser).processRewards();
		await lpPool.connect(firstUser).processRewards();

		expect(
			await modaCorePool.pendingYieldRewards(firstUser.address),
			'MODA Core Pool has zero pending rewards after compound'
		).to.eq(0);

		expect(
			await lpPool.pendingYieldRewards(firstUser.address),
			'LP Pool has zero pending rewards after compound'
		).to.eq('0');
	});

	it('Should have 1 000 000 MODA total rewards after 18 months', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const eth = parseEther('1');
		const amount1 = parseEther('100');
		const stakeAmount = parseEther('1');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount1, amount1],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);

		const lockUntil1 = toTimestampBN(add(start, { months: 9 }));
		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil1);

		const futureDate1: Date = add(start, { months: 9 });
		await fastForward(futureDate1);

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.eq(
			1,
			'Should have rewards deposited'
		);
		const year1tokens = await token.allowance(firstUser.address, modaCorePool.address);
		expect(year1tokens.div(eth)).to.eq(100, 'Should have token allowance = initial deposit');

		const lockUntil2 = toTimestampBN(add(futureDate1, { months: 9 }));
		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil2);

		const futureDate2: Date = add(futureDate1, { months: 9 });
		await fastForward(futureDate2);

		await modaCorePool.connect(firstUser).processRewards();

		const deposits = await modaCorePool.getDepositsLength(firstUser.address);
		expect(deposits).to.eq(4);

		const deposit1 = await modaCorePool.getDeposit(firstUser.address, 1);
		const deposit2 = await modaCorePool.getDeposit(firstUser.address, 3);
		expect(deposit2.tokenAmount.lt(deposit1.tokenAmount)).to.be.true;

		const totalRewards = deposit2.tokenAmount.add(deposit1.tokenAmount);
		expect(totalRewards.div(eth)).to.eq(1000005);
	});

	it('Should have more rewards in months 1-9 than in months 10-18', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const eth = parseEther('1');
		const amount1 = parseEther('100');
		const stakeAmount = parseEther('1');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount1, amount1],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);

		const lockUntil1 = toTimestampBN(add(start, { months: 9 }));
		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil1);

		const futureDate1: Date = add(start, { months: 9 });
		await fastForward(futureDate1);

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.eq(
			1,
			'Should have rewards deposited'
		);
		const year1tokens = await token.allowance(firstUser.address, modaCorePool.address);
		expect(year1tokens.div(eth)).to.eq(100, 'Should have token allowance = initial deposit');

		const lockUntil2 = toTimestampBN(add(futureDate1, { months: 9 }));
		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil2);

		const futureDate2: Date = add(futureDate1, { months: 9 });
		await fastForward(futureDate2);

		await modaCorePool.connect(firstUser).processRewards();

		const deposits = await modaCorePool.getDepositsLength(firstUser.address);
		expect(deposits).to.eq(4);

		const deposit1 = await modaCorePool.getDeposit(firstUser.address, 1);
		const deposit2 = await modaCorePool.getDeposit(firstUser.address, 3);
		expect(deposit2.tokenAmount.lt(deposit1.tokenAmount)).to.be.true;
	});

	it('Should have modest rewards in a short time with no lock-in', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		const eth = parseEther('1');
		const amount1 = parseEther('1000');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[
				[firstUser.address, secondUser.address, thirdUser.address],
				[amount1, amount1, amount1],
			],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);

		await modaCorePool.connect(firstUser).stake(stakeAmount, 0);

		const futureDate1: Date = add(start, { minutes: 3 });
		await fastForward(futureDate1);

		const reward = await modaCorePool.pendingYieldRewards(firstUser.address);
		const percent = reward.div(stakeAmount).mul(100);
		expect(Number.parseInt(percent.toString())).to.eq(0);
	});
});
