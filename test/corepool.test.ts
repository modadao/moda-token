import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import {
	add,
	fastForward,
	fromTimestamp,
	fromTimestampBN,
	toTimestampBN,
	toEth,
	mineBlocks,
	YEAR,
	DAY,
	MILLIS,
	BIGZERO,
	ADDRESS0,
	ROLE_TOKEN_CREATOR,
	MINUTE,
} from './utils';

describe('Core Pool', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	const userBalances = [toEth('2000'), toEth('200')];
	const userEscrowBalance = [toEth('200'), toEth('10')];
	const claimSMODARewards = true;
	const rolloverInvestment = false;

	function logSetup() {
		console.log('Owner', owner.address);
		console.log('Users', addr);
		console.log('Token', token.address);
		console.log('Escrow Token', escrowToken.address);
		console.log('Core Pool', corePool.address);
	}

	beforeEach(async () => {
		let currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);

		[owner, user0, user1] = await ethers.getSigners();
		addr = [user0.address, user1.address];

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(tokenFactory, [addr, userBalances], {
			kind: 'uups',
		})) as Token;
		await token.deployed();

		const escrowTokenFactory = await ethers.getContractFactory('EscrowedModaERC20');
		escrowToken = (await escrowTokenFactory.deploy()) as EscrowedModaERC20;
		await escrowToken.deployed();
		await escrowToken.mint(addr[0], userEscrowBalance[0]);
		await escrowToken.mint(addr[1], userEscrowBalance[1]);

		const nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		//console.log(`Block number: ${nextBlock}`);
		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			ADDRESS0, // This is a modaPool, so set to zero.
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			toEth('150000'), // modaPerBlock initial MODA/block value for rewards
			10, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 1000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();

		await token.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
	});

	it.skip('Should log the set up', async () => {
		logSetup();
		//console.log(await ethers.provider.listAccounts());
	});

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		//logSetup();
		await expect(
			corePool.connect(user0).stakeAsPool(user1.address, toEth('100'))
		).to.be.revertedWith(
			`AccessControl: account ${addr[0].toLowerCase()} is missing role 0x000b000000000000000000000000000000000000000000000000000000000000`
		);
	});

	it('Should revert on invalid lock interval', async () => {
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR + DAY);
		let lockedUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		await expect(
			corePool.connect(user0).stake(toEth('100'), lockedUntil, false)
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year. Claiming MODA', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR - 10 * MINUTE);
		let lockUntil: BigNumber = toTimestampBN(endDate);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = toEth('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil, claimSMODARewards);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount.eq(amount));
		expect(weight.eq(toEth('207997920')));
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Now attempt to withdraw it.
		await expect(
			corePool.connect(user0).unstake(toEth('0'), amount, claimSMODARewards)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for more than a year though and...
		await fastForward(add(start, { years: 1, days: 1 }));
		await mineBlocks(1000);
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await corePool.connect(user0).processRewards(claimSMODARewards);
		await corePool.connect(user0).unstake(BIGZERO, amount, claimSMODARewards);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		await corePool.processRewards(claimSMODARewards);

		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			BigNumber.from('149400199999923851360000000')
		);
		// Is there anything remaining?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake deposit for 1 month. Claim SMODA rewards.', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = add(start, { days: 28 });
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = toEth('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil, claimSMODARewards);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			corePool.connect(user0).unstake(toEth('0'), toEth('100'), claimSMODARewards)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await expect(
			corePool.connect(user0).unstake(BIGZERO, amount, claimSMODARewards)
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait a little longer though
		await fastForward(add(start, { days: 29 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await corePool.connect(user0).unstake(BIGZERO, amount, claimSMODARewards);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect((await escrowToken.balanceOf(addr[0])).gt(toEth('75019')));
		// Is there anything remaining?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// Examining the only deposit.
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(0); // It's all gone.
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest (useSMODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = toEth('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil, claimSMODARewards);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			corePool.connect(user0).unstake(toEth('0'), toEth('104'), claimSMODARewards)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than a 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await expect(
			corePool.connect(user0).unstake(BIGZERO, amount.div(2), claimSMODARewards)
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait a little longer though
		await fastForward(add(start, { days: 29 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await corePool.connect(user0).unstake(BIGZERO, amount.div(2), claimSMODARewards);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount.div(2)));
		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			BigNumber.from('750199999918367744000000')
		);
		// Is there anything remaining?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// Examining the only deposit.
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(amount.div(2));
		expect(weight.eq(toEth('55989024')));
		//expect(lockedFrom).to.equal(lockUntil);
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Wait another month
		await fastForward(add(start, { months: 2 }));
		// Before unstake executes the user should have the previous sMODA balance.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			BigNumber.from('750199999918367744000000')
		);
		// Unstake whatever remains.
		await corePool.connect(user0).unstake(BIGZERO, tokenAmount, claimSMODARewards);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			BigNumber.from('1041199999913121248000000')
		);

		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest (use MODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = add(start, { days: 28 });

		let lockUntil: BigNumber = toTimestampBN(endDate);
		//console.log('lockUntil', lockUntil);

		const amount: BigNumber = toEth('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, lockUntil, rolloverInvestment);

		// Is there a new Deposit?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// DEPOSIT 0
		let lastLocked: BigNumber = BIGZERO;
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount.eq(amount));
		expect(weight.eq(BigNumber.from('111977944000000000000000000')));
		//expect(lockedFrom).to.equal(lockUntil); // timey wimey
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			corePool.connect(user0).unstake(toEth('0'), toEth('100'), rolloverInvestment)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than a 28 days and expect failure.
		await fastForward(fromTimestampBN(lockUntil.sub(MINUTE / MILLIS)));
		// Before unstake executes the user should have the previous balances.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await expect(
			corePool.connect(user0).unstake(BIGZERO, amount.div(2), rolloverInvestment)
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait a little longer though
		await fastForward(fromTimestampBN(lockUntil.add(MINUTE / MILLIS)));
		// Before unstake executes the user should have the previous balances.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		await corePool.connect(user0).unstake(BIGZERO, amount.div(2), rolloverInvestment);

		//
		expect(await corePool.getDepositsLength(addr[0])).to.equal(2);

		// Examine the tokens this address now owns.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount.div(2)));
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);

		// Is there a new Deposit?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(2);
		// DEPOSIT 0 (initial)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(amount.div(2));
		expect(weight.eq(toEth('559890240')));
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		lastLocked = lockedUntil;
		let nextRewardTime: Date = fromTimestampBN(lockedUntil.add((2 * MINUTE) / MILLIS));

		expect(lastLocked).to.equal(lockUntil);

		lastLocked = lockedUntil;
		let reward1Amount = tokenAmount;

		// Wait a until the FIRST deposit is unlocked to claim it.
		await fastForward(nextRewardTime);
		// Get the SECOND deposit's unlock time.
		nextRewardTime = fromTimestampBN(lockedUntil.add((65 * MINUTE) / MILLIS));

		await corePool.connect(user0).processRewards(rolloverInvestment);
		expect(await corePool.getDepositsLength(addr[0])).to.equal(3);
		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount.eq(toEth('52'))); // first rewards
		expect(weight.eq(toEth('55989024'))); // Weight stayed the same.
		expect(lockedUntil == lastLocked); // Rewards are locked until the same time as Deposit 0.
		expect(isYield).to.equal(false); //NB: this flag was set to true.

		// Before unstaking the first deposit executes the user should have the previous balances.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount.div(2)));
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);
		// Unstake whatever remains of that first deposit.
		await corePool.connect(user0).unstake(BIGZERO.add(0), amount.div(2), rolloverInvestment);
		// After unstaking the remainder of the first deposit user should have the previous balances.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);

		// Yet another Deposit is created. A much bigger one.
		const maxDeposits = await corePool.getDepositsLength(addr[0]);

		// DEPOSIT 0 (first)
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BIGZERO);
		expect(tokenAmount).to.equal(0); // Done.
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		let lastTimestamp = lastLocked;
		let totalRewards = BIGZERO;
		// Let's go grab all those rewards.
		for (let deposit = BIGZERO.add(1); deposit.lt(maxDeposits); deposit = deposit.add(1)) {
			//console.log('deposit', deposit.toNumber());
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(addr[0], deposit);
			if (lockedUntil > lastTimestamp) {
				// Wait a until the FIRST deposit is unlocked to claim it.
				nextRewardTime = fromTimestampBN(lockedUntil.add(1));
				await fastForward(nextRewardTime);
				lastTimestamp = lockedUntil.add(1);
			}
			// Unstake whatever remains of this deposit.
			await corePool.connect(user0).unstake(deposit, tokenAmount, claimSMODARewards);
			totalRewards = totalRewards.add(tokenAmount);
			expect(await corePool.getDepositsLength(addr[0])).to.equal(maxDeposits);
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(addr[0], deposit);
			expect(tokenAmount).to.equal(0); // Done.
			expect(weight).to.equal(0);
			expect(lockedFrom).to.equal(0);
			expect(lockedUntil).to.equal(0);
			expect(isYield).to.equal(false);
		}
		// Before unstaking the first deposit executes the user should have the previous balances.
		const finalTokenBalance = await token.balanceOf(addr[0]);
		expect(finalTokenBalance.gt(toEth('1188496')));
		const finalEscrowBalance = await escrowToken.balanceOf(addr[0]);
		expect(finalTokenBalance.gt(toEth('72769')));
	});
});
