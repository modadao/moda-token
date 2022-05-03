import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain-types';
import { revertSnapshot, takeSnapshot } from './helper';
import { setup, Setup } from './setup';
import { add, fastForward, fromTimestamp, toTimestamp } from './utils';

describe('Shadow Pool', () => {
	let token: Token;
	let otherToken: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let shadowPool: ModaCorePool;

	let start = new Date();
	let owner: SignerWithAddress;
	const userBalances = [ethers.utils.parseEther('2000'), ethers.utils.parseEther('100')];

	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = data;

		await expect(
			modaCorePool.connect(firstUser).stakeAsPool(firstUser.address, ethers.utils.parseEther('100'))
		).to.be.revertedWith('pool is not registered');
	});

	it('Should revert on invalid lock interval', async () => {
		const {
			factory,
			start,
			firstUser,
			secondUser,
			thirdUser,
			modaCorePool,
			lpPool,
			moda,
			tokenFactory,
			modaPoolFactory,
			corePoolFactory,
		} = data;

		// data setup
		const otherToken = (await tokenFactory.deploy()) as Token;
		await otherToken.deployed();
		await otherToken.initialize(
			[firstUser.address, secondUser.address],
			[parseEther('2000'), parseEther('200')]
		);

		const nextTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
		const shadowPool = (await corePoolFactory.deploy(
			moda.address, // moda MODA ERC20 Token ModaERC20 address
			factory.address, // This is the moda Core Pool.
			modaCorePool.address,
			otherToken.address,
			900, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			nextTimestamp // initTimestamp initial block timestamp used to calculate the rewards
		)) as ModaCorePool;
		await shadowPool.deployed();
		await factory.registerPool(shadowPool.address);

		const endDate = add(start, { years: 1, days: 1 });
		await expect(
			shadowPool.connect(firstUser).stake(ethers.utils.parseEther('100'), toTimestamp(endDate))
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year. Using MODA.', async () => {
		const {
			factory,
			start,
			firstUser,
			secondUser,
			thirdUser,
			modaCorePool,
			lpPool,
			moda,
			tokenFactory,
			modaPoolFactory,
			corePoolFactory,
		} = data;

		// data setup
		const otherToken = (await tokenFactory.deploy()) as Token;
		await otherToken.deployed();
		await otherToken.initialize(
			[firstUser.address, secondUser.address],
			[parseEther('2000'), parseEther('200')]
		);

		const nextTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
		const shadowPool = (await corePoolFactory.deploy(
			moda.address, // moda MODA ERC20 Token ModaERC20 address
			factory.address, // This is the moda Core Pool.
			modaCorePool.address,
			otherToken.address,
			900, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			nextTimestamp // initTimestamp initial block timestamp used to calculate the rewards
		)) as ModaCorePool;
		await shadowPool.deployed();
		await factory.registerPool(shadowPool.address);

		// Check up the balances first
		expect(await otherToken.balanceOf(firstUser.address)).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate = add(start, { days: 364, hours: 23, minutes: 59, seconds: 45 });
		//console.log('lockedUntil', lockUntil);
		const amount = ethers.utils.parseEther('104');
		const newBalance = userBalances[0].sub(amount);

		await otherToken.connect(firstUser).approve(shadowPool.address, amount);
		expect(await otherToken.allowance(firstUser.address, shadowPool.address)).to.equal(amount);
		// This is a shadow pool, so it behaves differently when processing rewards.
		await shadowPool.connect(firstUser).stake(amount, toTimestamp(endDate));

		// And given that we've already staked our amount, we shouldn't be able to stake again.
		await expect(
			shadowPool.connect(firstUser).stake(amount, toTimestamp(endDate))
		).to.be.revertedWith('ERC20: transfer amount exceeds allowance');

		// Staking moves the user's Other Tokens to the shadow pool.
		expect(await otherToken.balanceOf(shadowPool.address)).to.equal(amount);

		// There should now be one deposit in the shadow pool.
		expect(await shadowPool.getDepositsLength(firstUser.address)).to.equal(1);
		let [
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(firstUser.address, 0);
		expect(tokenAmount).to.equal(amount);
		// TODO use a calculation
		// expect(weight).to.equal(ethers.utils.parseEther('207999896'));
		expect(lockedUntil).to.equal(lockedUntil);
		expect(isYield).to.be.false;

		// An attempt to withdraw it now should revert.
		await expect(
			shadowPool
				.connect(firstUser)
				.unstake(ethers.utils.parseEther('0'), ethers.utils.parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');

		// Before unstake executes the user should have their new balance of other tokens.
		expect(await otherToken.balanceOf(firstUser.address)).to.equal(newBalance);

		// Wait for more than a year though and we should be able to unstake.
		await fastForward(add(start, { years: 1, days: 1 }));
		await shadowPool.connect(firstUser).unstake(0, amount);

		// Examine the tokens this address now owns.
		expect(await moda.balanceOf(firstUser.address)).to.equal(ethers.utils.parseEther('2000'));

		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(firstUser.address)).to.equal(1);

		// This is where the shadow pool differs. Its MODA rewards are sent to the CorePool.
		// The user must collect them from there when the time comes to vest.
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(1);

		// It may seem that way but let's be sure...
		[
			tokenAmount, // @dev other token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(firstUser.address, 0);
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
		] = await modaCorePool.getDeposit(firstUser.address, 0);
		expect(tokenAmount.gte(ethers.utils.parseEther('149099999')));
		expect(weight.gte(ethers.utils.parseEther('298199999999765')));
		expect(isYield).to.equal(true);

		let nextMonth: Date = fromTimestamp(lockedUntil.toNumber() + 3600);
		await fastForward(nextMonth);

		// Before unstake on the core pool executes the user should have their original moda balance.
		expect(await moda.balanceOf(firstUser.address)).to.equal(userBalances[0]);
		await modaCorePool.connect(firstUser).unstake(0, tokenAmount);
		// After unstake the user should have more MODA.
		// TODO use a calculation
		// expect(await moda.balanceOf(firstUser.address)).gte(ethers.utils.parseEther('149101000'));

		// Is there anything remaining? There shouldn't be at this point.
		expect(await shadowPool.getDepositsLength(firstUser.address)).to.equal(1);

		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(firstUser.address, 0);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.be.false;

		// But there should be a yield in the core pool
		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.equal(2);

		// Let's look
		({ isYield } = await modaCorePool.getDeposit(firstUser.address, 1));
		expect(isYield).to.be.true;
	});
});
