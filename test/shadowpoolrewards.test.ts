import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import {
	add,
	fastForward,
	fromTimestamp,
	ADDRESS0,
	ROLE_TOKEN_CREATOR,
	ROLE_POOL_STAKING,
	mineBlocks,
} from './utils';

describe('Shadow Pool Rewards', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let shadowPool: ModaCorePool;
	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	const userBalances = [ethers.utils.parseEther('6500000'), ethers.utils.parseEther('3500000')];
	const userEscrowBalance = [ethers.utils.parseEther('211'), ethers.utils.parseEther('11')];

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

		let nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		//console.log(`Block number: ${nextBlock}`);
		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			ADDRESS0, // This is a modaPool, so set to zero.
			token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			ethers.utils.parseEther('150000'), // modaPerBlock initial MODA/block value for rewards
			100, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
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
			nextBlock + 1700 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await shadowPool.deployed();

		await token.grantRole(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantRole(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantRole(ROLE_TOKEN_CREATOR, shadowPool.address);
		await corePool.grantRole(ROLE_POOL_STAKING, shadowPool.address);
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to SMODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).is.equal(userBalances[0]);

		// Calculate a suitable locking end date
		// let endDate: Date = new Date();
		// endDate.setTime(start.getTime() + 28 * DAY);
		// let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);

		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = ethers.utils.parseEther('104');
		const unlocked: BigNumber = BigNumber.from('0');
		await escrowToken.connect(user0).approve(shadowPool.address, amount);
		expect(await escrowToken.allowance(addr[0], shadowPool.address)).is.equal(amount);
		// Regardless of the useSMODA flag used _this_ shadow pool will always use SMODA.
		await shadowPool.connect(user0).stake(amount, unlocked);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).is.equal(userBalances[0]);
		expect(await escrowToken.balanceOf(addr[0])).is.equal(userEscrowBalance[0].sub(amount));
		//console.log(contractTx);
		expect(await shadowPool.getDepositsLength(addr[0])).is.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		expect(tokenAmount).is.equal(amount);
		expect(weight).is.equal(ethers.utils.parseEther('104000000'));
		//expect(lockedFrom).is.equal(0);
		expect(lockedUntil).is.equal(0);
		expect(isYield).is.equal(false);

		interface ROI_Record {
			Deposit: BigNumber;
			Amount: BigNumber;
			Weight: BigNumber;
			MODA: BigNumber;
			SMODA: BigNumber;
		}
		let ReturnsOnInvestment = Array<ROI_Record>();

		let RoI_: ROI_Record = {
			Deposit: BigNumber.from('0'),
			Amount: BigNumber.from('0'),
			Weight: BigNumber.from('0'),
			MODA: BigNumber.from('0'),
			SMODA: BigNumber.from('0'),
		};
		let RoI: ROI_Record = Object.assign({}, RoI_);

		const maxMonths = 3;
		for (let ff = 0; ff < maxMonths; ++ff) {
			// Day after rewards should be available, approximately.
			//console.log('block', await ethers.provider.getBlockNumber());
			let nextMonth: Date = add(start, { months: ff, days: 1 });
			await fastForward(nextMonth);
			await mineBlocks(100);

			// Collect rewards. This Shadow pool can only use SMODA.
			await shadowPool.connect(user0).processRewards();
			let depositIndex = await shadowPool.getDepositsLength(addr[0]);
			//console.log('depositIndex', depositIndex);
			RoI.Deposit = depositIndex.sub(1);
			// Examine the tokens this address now owns.
			RoI.MODA = await token.balanceOf(addr[0]);
			RoI.SMODA = await escrowToken.balanceOf(addr[0]);
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await shadowPool.getDeposit(addr[0], depositIndex.sub(1));
			expect(isYield).is.equal(false);
			//console.log('weight', weight);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await shadowPool.connect(user0).unstake('0', amount);

		// Examine the tokens this address now owns.
		RoI.Deposit = BigNumber.from(maxMonths + 1);
		RoI.MODA = await token.balanceOf(addr[0]);
		RoI.SMODA = await escrowToken.balanceOf(addr[0]);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await shadowPool.getDeposit(addr[0], '0');
		RoI.Amount = tokenAmount;
		RoI.Weight = weight;
		ReturnsOnInvestment.push(RoI);
		RoI = Object.assign({}, RoI_);

		//console.log(ReturnsOnInvestment);
		/**
		 * Weight slowly drops with each block count trigger. i.e. every block.
		 * Only one deposits stored as `processRewards` is called.
		 * MODA is restored to the account.
		 * SMODA is credited to the account when `unstake` is called.
		 */
	});
});
