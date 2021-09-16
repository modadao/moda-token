import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, use } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import { add, addTimestamp, fastForward, fromTimestamp } from './utils';

function toEth(amount: string): BigNumber {
	return ethers.utils.parseEther(amount);
}
const ROLE_TOKEN_CREATOR = [
	0, 0xa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const ROLE_POOL_STAKING = [
	0, 0xb, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

const address0 = '0x0000000000000000000000000000000000000000';

type Deposit = Array<unknown>;

const MILLIS: number = 1000;
const HOUR: number = 60 * 60 * MILLIS;
const DAY: number = 24 * HOUR;
const YEAR: number = 365 * DAY;
const BNZero: BigNumber = BigNumber.from(0);

describe('Shadow Pool', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let shadowPool: ModaCorePool;

	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	let userBalances = [toEth('1000'), toEth('1000')];

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
		await escrowToken.mint(addr[0], userBalances[0]);
		await escrowToken.mint(addr[1], userBalances[1]);

		let nextBlock = (await ethers.provider.getBlockNumber()) + 1;

		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			address0, // This is a modaPool, so set to zero.
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			token.address, // poolToken Token that the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			150000, // modaPerBlock initial MODA/block value for rewards
			216000, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 3672000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();

		//console.log(`Block number: ${nextBlock}`);
		nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		const shadowPoolFactory = await ethers.getContractFactory('ModaCorePool');
		shadowPool = (await shadowPoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			corePool.address, // This is the moda Core Pool.
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			escrowToken.address, // poolToken escrowToken the pool operates on, for example MODA or MODA/ETH pair, or even SMO
			900, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			150000, // modaPerBlock initial MODA/block value for rewards
			216000, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 3672000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await shadowPool.deployed();

		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
		//await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, shadowPool.address);
		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, shadowPool.address);
	});

	it.skip('Should log the set up', async () => {
		logSetup();
		//console.log(await ethers.provider.listAccounts());
	});

	it('Should refuse any but a CorePool to create a pool stake', async () => {
		//logSetup();
		await expect(
			shadowPool.connect(user0).stakeAsPool(user1.address, toEth('100'))
		).to.be.revertedWith(
			`AccessControl: account ${addr[0].toLowerCase()} is missing role 0x000b000000000000000000000000000000000000000000000000000000000000`
		);
	});

	it('Should revert on invalid lock interval', async () => {
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR + DAY);
		let lockedUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		await expect(
			shadowPool.connect(user0).stake(toEth('100'), lockedUntil, false)
		).to.be.revertedWith('invalid lock interval');
	});

	it('Should allow a user to unstake a locked deposit after 1 year', async () => {
		//logSetup();
		// Set up the balance first
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + YEAR - 10 * MILLIS);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = BigNumber.from(104);
		const newBalance: BigNumber = userBalances[0].sub(amount);

		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		await shadowPool.connect(user0).stake(amount, lockUntil, false);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			shadowPool.connect(user0).unstake(toEth('0'), toEth('100'), true)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for more than a year though and...
		await fastForward(add(start, { years: 1, days: 1 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake(BNZero, amount, true);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0].add(449999));
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		let [
			escrowTokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], BNZero);
		expect(escrowTokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake deposit for 1 month', async () => {
		//logSetup();
		// Set up the balance first
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = BigNumber.from(104);
		const newBalance: BigNumber = userBalances[0].sub(amount);

		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		await shadowPool.connect(user0).stake(amount, lockUntil, true);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			shadowPool.connect(user0).unstake(toEth('0'), toEth('100'), true)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		// Before unstake executes the user should have the reduced amount of sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await expect(shadowPool.connect(user0).unstake(BNZero, amount, true)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		await fastForward(add(start, { months: 1, days: 3 }));
		// Before unstake executes the user should have the reduced amount of sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake(BNZero, amount, true);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0].add(749999));
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		let [
			escrowTokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], BNZero);
		expect(escrowTokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});

	it('Should allow a user to stake 1 month, unstake some, wait and unstake the rest', async () => {
		//logSetup();
		// Set up the balance first
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);
		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = BigNumber.from(104);
		const newBalance: BigNumber = userBalances[0].sub(amount);
		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).to.equal(amount);
		await shadowPool.connect(user0).stake(amount, lockUntil, true);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);

		// Now attempt to withdraw it.
		await expect(
			shadowPool.connect(user0).unstake(toEth('0'), toEth('100'), true)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for less than a 28 days and expect failure.
		await fastForward(add(start, { days: 27 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await expect(shadowPool.connect(user0).unstake(BNZero, amount.div(2), true)).to.be.revertedWith(
			'deposit not yet unlocked'
		);

		// Wait a little longer though
		await fastForward(add(start, { months: 1, days: 3 }));
		// Before unstake executes the user should have zero sMODA.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(newBalance);
		await shadowPool.connect(user0).unstake(BNZero, amount.div(2), true);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			userBalances[0].add(749999).sub(amount.div(2))
		);
		// Is there anything remaining?
		expect(await shadowPool.getDepositsLength(addr[0])).to.equal(1);
		// It may seem that way but...
		let [
			escrowTokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], BNZero);
		expect(escrowTokenAmount).to.equal(amount.div(2));
		expect(weight).to.equal(55988972);
		//expect(lockedFrom).to.equal(lockUntil);
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		// Wait another month
		await fastForward(add(start, { months: 2 }));
		// Before unstake executes the user should have the previous sMODA balance.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(
			userBalances[0].add(749999).sub(amount.div(2))
		);
		// Unstake whatever remains.
		await shadowPool.connect(user0).unstake(BNZero, escrowTokenAmount, true);

		// Examine the escrowTokens this address now owns.
		expect(await escrowToken.balanceOf(addr[0])).to.equal(userBalances[0].add(1049999));

		[
			escrowTokenAmount, // @dev escrowToken amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], BNZero);
		expect(escrowTokenAmount).to.equal(0);
		expect(weight).to.equal(0);
		expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);
	});
});
