import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import { add, addTimestamp, fastForward, fromTimestamp } from './utils';

function toEth(amount: string): BigNumber {
	return ethers.utils.parseEther(amount);
}

describe('Core Pool', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let start = new Date();
	let owner: SignerWithAddress, addr0: SignerWithAddress, addr1: SignerWithAddress;
	let users: string[];
	let userBalances = [toEth('6500000'), toEth('3500000')];

	function logSetup() {
		console.log('Owner', owner.address);
		console.log('Users', users);
		console.log('Token', token.address);
		console.log('Escrow Token', escrowToken.address);
		console.log('Core Pool', corePool.address);
	}

	beforeEach(async () => {
		[owner, addr0, addr1] = await ethers.getSigners();
		users = [addr0.address, addr1.address];

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(tokenFactory, [users, userBalances], {
			kind: 'uups',
		})) as Token;
		await token.deployed();

		const escrowTokenFactory = await ethers.getContractFactory('EscrowedModaERC20');
		escrowToken = (await escrowTokenFactory.deploy()) as EscrowedModaERC20;
		await escrowToken.deployed();

		const nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		console.log(`Block number: ${nextBlock}`);
		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			150000, // modaPerBlock initial MODA/block value for rewards
			216000, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 3672000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();
	});

	it('Should log the set up', async () => {
		logSetup();
	});
	it('Should allow owner to create a pool stake', async () => {
		logSetup();
		expect(await token.balanceOf(addr0.address)).to.equal(userBalances[0]);
		let contractTx = await corePool.stakeAsPool(users[0], toEth('100'));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(users[0])).to.equal(1);
	});

	it('Should refuse non-owner to create a pool stake', async () => {
		await expect(
			corePool.connect(addr1).stakeAsPool(addr1.address, toEth('100'))
		).to.be.revertedWith('Ownable: caller is not the owner');
	});

	it('Should prevent user from unstaking locked deposits', async () => {
		// Set up the balance first
		expect(await token.balanceOf(addr0.address)).to.equal(userBalances[0]);
		let contractTx = await corePool.stakeAsPool(users[0], toEth('100'));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(users[0])).to.equal(1);
		// Now attempt to withdraw it.
		await expect(
			corePool.connect(addr0).unstake(toEth('0'), toEth('100'), true)
		).to.be.revertedWith('deposit not yet unlocked');
	});

	it('Should allow a user to unstake a locked deposit after 1 year', async () => {
		// Set up the balance first
		expect(await token.balanceOf(addr0.address)).to.equal(userBalances[0]);
		let contractTx = await corePool.stakeAsPool(users[0], toEth('100'));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(users[0])).to.equal(1);
		// Now attempt to withdraw it.
		await expect(
			corePool.connect(addr0).unstake(toEth('0'), toEth('100'), true)
		).to.be.revertedWith('deposit not yet unlocked');
		// Wait for more than a year though and...
		await fastForward(add(start, { years: 3 }));
		await corePool.connect(addr0).unstake(toEth('0'), toEth('100'), true);
	});

	it('Should ', async () => {});
});
