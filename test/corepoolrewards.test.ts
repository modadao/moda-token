import { BigNumber } from '@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import { add, fastForward, fromTimestamp, ADDRESS0, ROLE_TOKEN_CREATOR, mineBlocks } from './utils';

describe('Core Pool Rewards', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	const userBalances = [parseEther('2000'), parseEther('200')];
	const userEscrowBalance = [parseEther('211'), parseEther('11')];
	const useSMODA = true;
	const useMODA = false;

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

		const nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		//console.log(`Block number: ${nextBlock}`);
		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			ADDRESS0, // This is a modaPool, so set to zero.
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			parseEther('150000'), // modaPerBlock initial MODA/block value for rewards
			10, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 3672000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();

		await token.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to sMODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		const unlocked = BigNumber.from(0);
		const amount = parseEther('104');
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, unlocked, useSMODA);

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
		expect(lockedUntil).to.equal(0);
		expect(isYield).to.equal(false);

		interface ROI_Record {
			Deposit: BigNumber;
			Amount: BigNumber;
			Weight: BigNumber;
			MODA: BigNumber;
			SMODA: BigNumber;
		}
		let ReturnsOnInvestment = Array<ROI_Record>();

		let RoI_: ROI_Record = {
			Deposit: BigNumber.from(0),
			Amount: BigNumber.from(0),
			Weight: BigNumber.from(0),
			MODA: BigNumber.from(0),
			SMODA: BigNumber.from(0),
		};
		let RoI: ROI_Record = Object.assign({}, RoI_);

		let nextMonth: Date = add(start, { months: 1 });
		const maxMonths = 3;
		for (let ff = 0; ff < maxMonths; ++ff) {
			// Day after rewards should be available, approximately.
			nextMonth = add(nextMonth, { months: 1 });
			await fastForward(nextMonth);
			await mineBlocks(10);
			1;
			// Collect rewards.
			await corePool.connect(user0).processRewards(useSMODA);
			let depositIndex = await corePool.getDepositsLength(addr[0]);
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
			] = await corePool.getDeposit(addr[0], RoI.Deposit);
			expect(isYield).to.equal(false);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await corePool.connect(user0).unstake(0, amount, true);

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
		] = await corePool.getDeposit(addr[0], 0);
		RoI.Amount = tokenAmount;
		RoI.Weight = weight;
		ReturnsOnInvestment.push(RoI);
		RoI = Object.assign({}, RoI_);

		//console.log(ReturnsOnInvestment);
		/**
		 * Weight slowly drops with each block count trigger. i.e. every block.
		 * Multiple deposits stored as `processRewards` is called.
		 * MODA is restored to the account.
		 * SMODA is credited to the account when `unstake` is called.
		 */
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to MODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		const amount = parseEther('104');
		const unlocked = BigNumber.from(0);
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, unlocked, useMODA);

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
			SMODA: BigNumber;
		}
		let ReturnsOnInvestment = Array<ROI_Record>();

		let RoI_: ROI_Record = {
			Deposit: BigNumber.from(0),
			Amount: BigNumber.from(0),
			Weight: BigNumber.from(0),
			MODA: BigNumber.from(0),
			SMODA: BigNumber.from(0),
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
			await corePool.connect(user0).processRewards(useMODA);
			let depositIndex = await corePool.getDepositsLength(addr[0]);
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
			] = await corePool.getDeposit(addr[0], depositIndex.sub(1));
			expect(isYield).to.equal(true);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await corePool.connect(user0).unstake(BigNumber.from(0), amount, true);

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
		 * SMODA is credited to the account when `unstake` is called.
		 */
	});
});

