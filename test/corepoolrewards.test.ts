import { BigNumber } from '@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ModaCorePool, ModaPoolFactory, Token } from '../typechain-types';
import {
	add,
	fastForward,
	fromTimestampBN,
	toTimestampBN,
	mineBlocks,
	ROLE_TOKEN_CREATOR,
	blockNow,
	addTimestamp,
	fromTimestamp,
} from './utils';

const YEAR_STAKE_WEIGHT_MULTIPLIER = 2 * 1e6;

describe('Core Pool Rewards', () => {
	let token: Token;
	let corePool: ModaCorePool;
	let factory: ModaPoolFactory;
	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	const userBalances = [parseEther('2000'), parseEther('200')];

	beforeEach(async () => {
		[owner, user0, user1] = await ethers.getSigners();
		addr = [user0.address, user1.address];

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(tokenFactory, [addr, userBalances], {
			kind: 'uups',
		})) as Token;
		await token.deployed();

		const latestBlock = await ethers.provider.getBlock('latest');
		const nextTimestamp = latestBlock.timestamp + 20;

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

	it('Should reward with the pending amount when processing rewards', async () => {
		//pre-condition
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		const lockUntil = toTimestampBN(add(start, { days: 30 }));
		const amount = parseEther('100');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(user0.address, corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil);

		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);

		const futureDate: Date = add(start, { days: 31 });
		await fastForward(futureDate);

		const pendingRewards = await corePool.pendingYieldRewards(user0.address);
		await corePool.connect(user0).processRewards();

		//post-condition
		const depositWeight = pendingRewards.mul(YEAR_STAKE_WEIGHT_MULTIPLIER);

		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);
		const [oldTokenAmount] = await corePool.getDeposit(user0.address, 0);
		expect(oldTokenAmount.eq(amount)).to.be.true;

		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 1);

		expect(tokenAmount.eq(pendingRewards)).to.be.true; // TODO this test fails; why should this be true?
		expect(weight).to.equal(depositWeight);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 365 }));
		expect(isYield).to.equal(true);
	});

	it('Should allow a user to unstake a locked yield deposit after 1 year.', async () => {
		//pre-condition
		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0]);

		const lockUntil = toTimestampBN(add(start, { days: 30 }));
		const amount: BigNumber = parseEther('100');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(user0.address, corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil);

		expect(await token.balanceOf(user0.address)).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(user0.address)).to.equal(1);

		const futureDate: Date = add(start, { days: 30 });
		await fastForward(futureDate);
		await corePool.connect(user0).processRewards();

		expect(await corePool.getDepositsLength(user0.address)).to.equal(2);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 1);
		expect(fromTimestampBN(lockedFrom)).to.equalDate(futureDate);
		expect(fromTimestampBN(lockedUntil)).to.equalDate(add(futureDate, { days: 365 }));
		expect(isYield).to.equal(true);

		//post-condition
		await fastForward(add(futureDate, { days: 30 }));
		await expect(corePool.connect(user0).unstake(1, tokenAmount)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait for more than a year though and...
		await fastForward(add(futureDate, { days: 366 }));
		await corePool.connect(user0).unstake(1, tokenAmount);

		expect(await corePool.getDepositsLength(user0.address)).to.equal(3);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(user0.address, 1);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to MODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		const amount = parseEther('104');
		const unlocked = BigNumber.from(0);
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, unlocked);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], 0);
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
			await corePool.connect(user0).processRewards();
			let depositIndex = await corePool.getDepositsLength(addr[0]);
			//console.log('depositIndex', depositIndex);
			RoI.Deposit = depositIndex.sub(1);
			// Examine the tokens this address now owns.
			RoI.MODA = await token.balanceOf(addr[0]);
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(addr[0], depositIndex.sub(1));
			expect(isYield).to.equal(true);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await corePool.connect(user0).unstake(BigNumber.from(0), amount);

		// Examine the tokens this address now owns.
		RoI.Deposit = BigNumber.from(maxMonths + 1);
		RoI.MODA = await token.balanceOf(addr[0]);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BigNumber.from(0));
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
