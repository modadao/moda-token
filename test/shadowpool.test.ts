import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import {
	add,
	fastForward,
	fromTimestamp,
	mineBlocks,
	YEAR,
	DAY,
	MILLIS,
	ADDRESS0,
	ROLE_TOKEN_CREATOR,
	ROLE_POOL_STAKING,
	accessControlError,
} from './utils';

describe('Shadow Pool', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let shadowPool: ModaCorePool;

	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	const userBalances = [ethers.utils.parseEther('2000'), ethers.utils.parseEther('100')];
	const userEscrowBalance = [ethers.utils.parseEther('211'), ethers.utils.parseEther('11')];

	function logSetup() {
		console.log('Owner', owner.address);
		console.log('Users', addr);
		console.log('Token', escrowToken.address);
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

		let nextBlock = (await ethers.provider.getBlockNumber()) + 1;

		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			ADDRESS0, // This is a modaPool, so set to zero.
			token.address, // poolToken Token that the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			ethers.utils.parseEther('150000'), // modaPerBlock initial MODA/block value for rewards
			10, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 1000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();

		//console.log(`Block number: ${nextBlock}`);
		nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		const shadowPoolFactory = await ethers.getContractFactory('ModaCorePool');
		shadowPool = (await shadowPoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			corePool.address, // This is the moda Core Pool.
			escrowToken.address, // poolToken escrowToken the pool operates on, for example MODA or MODA/ETH pair, or even SMO
			900, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			ethers.utils.parseEther('150000'), // modaPerBlock initial MODA/block value for rewards
			10, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 1000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await shadowPool.deployed();

		await token.grantRole(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantRole(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantRole(ROLE_TOKEN_CREATOR, shadowPool.address);
		await corePool.grantRole(ROLE_POOL_STAKING, shadowPool.address);
	});

	it.skip('Should log the set up', async () => {
		logSetup();
		//console.log(await ethers.provider.listAccounts());
	});

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		//logSetup();
		await expect(
			shadowPool.connect(user0).stakeAsPool(user1.address, ethers.utils.parseEther('100'))
		).to.be.revertedWith(accessControlError(addr[0], ROLE_POOL_STAKING));
	});

	it('Should revert on invalid lock interval', async () => {
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR + DAY);
		let lockedUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		await expect(
			shadowPool.connect(user0).stake(ethers.utils.parseEther('100'), lockedUntil)
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year. Using MODA.', async () => {
		//logSetup();
		// Check up the balances first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR - 10 * MILLIS);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = ethers.utils.parseEther('104');
		const newBalance: BigNumber = userEscrowBalance[0].sub(amount);

		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		// This is a shadow pool it behaves differently when processing rewards.
		await shadowPool.connect(user0).stake(amount, lockUntil);
		await expect(shadowPool.connect(user1).stake(amount, lockUntil)).to.be.revertedWith(
			'transfer amount exceeds balance'
		);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		let [
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(amount);
		expect(weight).to.equal(ethers.utils.parseEther('207999896'));
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Now attempt to withdraw it.
		await expect(
			shadowPool
				.connect(user0)
				.unstake(ethers.utils.parseEther('0'), ethers.utils.parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for more than a year though and...
		await fastForward(add(start, { years: 1, days: 1 }));
		await mineBlocks(1000);
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake('0', amount);

		// Examine the escrowTokens this address now owns.
		// Nothing increased, so this is pointless.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).to.equal(ethers.utils.parseEther('211'));
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// This is where the shadow pool differs. Its MODA rewards are sent to the CorePool.
		// The user must collect them from there when the time comes to vest.
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		[
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		[
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], '0');
		expect(tokenAmount.gte(ethers.utils.parseEther('149099999')));
		expect(weight.gte(ethers.utils.parseEther('298199999999765')));
		//expect(lockedFrom).to.equal(0);
		//expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(true);

		let nextMonth: Date = fromTimestamp(lockedUntil.toNumber() + 3600);
		await fastForward(nextMonth);
		await mineBlocks(100);

		// Before unstake executes the user should have their SMODAy original balance.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		await corePool.connect(user0).unstake('0', tokenAmount);
		// After unstake the user should have more MODA.
		expect(await token.balanceOf(addr[0])).gte(ethers.utils.parseEther('149101000'));

		// Is there anything remaining?
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		// Let's look
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake deposit for 1 month. Claim SMODA', async () => {
		//logSetup();
		// Check up the balances first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = ethers.utils.parseEther('104');
		const newBalance: BigNumber = userEscrowBalance[0].sub(amount);

		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		// The claimSMODARewards flag is ignored here because this is a shadow pool.
		// It cannot hold MODA so it will always use SMODA
		await shadowPool.connect(user0).stake(amount, lockUntil);
		await expect(
			shadowPool.connect(user1).stake(amount, lockUntil)
		).to.be.revertedWith('transfer amount exceeds balance');

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		let [
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(amount);
		expect(weight).to.equal(ethers.utils.parseEther('111977944'));
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Now attempt to withdraw it.
		await expect(
			shadowPool
				.connect(user0)
				.unstake(ethers.utils.parseEther('0'), ethers.utils.parseEther('100'))
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		await mineBlocks(500);

		// Before unstake executes the user should have the reduced amount of sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await expect(
			shadowPool.connect(user0).unstake('0', amount)
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait a little longer though
		await fastForward(add(start, { months: 1, days: 3 }));
		await mineBlocks(500);
		// Before unstake executes the user should have the reduced amount of sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake('0', amount);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).gt(ethers.utils.parseEther('149250'));
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		[
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest, useSMODA', async () => {
		//logSetup();
		// Set up the balance first
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userEscrowBalance[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = ethers.utils.parseEther('104');
		const newBalance: BigNumber = userEscrowBalance[0].sub(amount);
		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		await shadowPool.connect(user0).stake(amount, lockUntil);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			shadowPool
				.connect(user0)
				.unstake(ethers.utils.parseEther('0'), amount.div(2))
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than a 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await expect(
			shadowPool.connect(user0).unstake('0', amount.div(2))
		).to.be.revertedWith('deposit not yet unlocked');

		// Wait a little longer though
		await fastForward(add(start, { days: 29 }));
		await mineBlocks(1000);
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake('0', amount.div(2));

		// Examine the escrowTokens this address now owns.
		expect((await escrowToken.balanceOf(addr[0])).eq(userEscrowBalance[0]));
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		let [
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(amount.div(2));
		expect(weight).to.equal(ethers.utils.parseEther('55988972'));
		//expect(lockedFrom).to.equal(lockUntil);
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Wait another month
		await fastForward(add(start, { months: 2 }));
		await mineBlocks(1000);
		// Before unstake executes the user should have the previous sMODA balance.
		expect(await escrowToken.balanceOf(addr[0])).gt(ethers.utils.parseEther('148950000'));
		expect(await token.balanceOf(addr[0])).equal(userBalances[0]);
		// Unstake whatever remains.
		await shadowPool.connect(user0).unstake('0', tokenAmount);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).gt(ethers.utils.parseEther('600210'));

		[
			tokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});
});
