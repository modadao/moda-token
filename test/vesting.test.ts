import { expect } from 'chai';
import { ethers, network, upgrades } from 'hardhat';
import { Vesting, Token } from '../typechain';
import { add, addTimestamp, fastForward, fromTimestamp } from './utils';

describe('Vesting', () => {
	let token: Token;
	let vesting: Vesting;
	let start = new Date();

	beforeEach(async () => {
		const [_, addr1, addr2] = await ethers.getSigners();

		// These tests need to wander through time on each one, as HardHat won't let us go backwards.
		// We always construct the vesting schedule based on this 'now' value.
		let currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);

		const TokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(TokenFactory, { kind: 'uups' })) as Token;
		await token.deployed();

		const VestingFactory = await ethers.getContractFactory('Vesting');
		vesting = (await VestingFactory.deploy(token.address, [
			{
				to: addr1.address,
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 1 }),
				released: false,
			},
			{
				to: addr1.address,
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 2 }),
				released: false,
			},
			{
				to: addr1.address,
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 3 }),
				released: false,
			},
			{
				to: addr2.address,
				amount: ethers.utils.parseEther('50'),
				releaseDate: addTimestamp(start, { months: 6 }),
				released: false,
			},
			{
				to: addr2.address,
				amount: ethers.utils.parseEther('50'),
				releaseDate: addTimestamp(start, { years: 1, months: 6 }),
				released: false,
			},
		])) as Vesting;
		await vesting.deployed();

		await token.setVestingContract(vesting.address);

		currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);
	});

	it('Should allow a simple withdrawal', async () => {
		const [_, addr1] = await ethers.getSigners();

		expect(await token.balanceOf(addr1.address)).to.equal(0); // Should start with no tokens.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0); // Not ready yet.

		await fastForward(add(start, { months: 11 }));
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0); // Still not ready yet.

		await fastForward(add(start, { years: 1 }));

		// The first amount should be ready now.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(ethers.utils.parseEther('100'));

		// Withdraw it.
		await expect(vesting.connect(addr1).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr1.address, ethers.utils.parseEther('100'));

		// addr1 should now have the 100 tokens
		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('100'));

		// And there should be nothing left for addr1 to withdraw.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);
	});

	it('Should allow a combined withdrawal', async () => {
		const [_, addr1] = await ethers.getSigners();

		expect(await token.balanceOf(addr1.address)).to.equal(0); // Should start with no tokens.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0); // Not ready yet.

		await fastForward(add(start, { years: 2 }));

		// Both the first and second amount should be ready now.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(ethers.utils.parseEther('200'));

		// Withdraw it.
		await expect(vesting.connect(addr1).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr1.address, ethers.utils.parseEther('200'));

		// addr1 should now have 200 tokens
		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('200'));

		// And there should be nothing left for addr1 to withdraw.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);

		// But if we fast forward another year
		await fastForward(add(start, { years: 3 }));

		// We should be able to access the last 100.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(ethers.utils.parseEther('100'));

		// Withdraw it.
		await expect(vesting.connect(addr1).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr1.address, ethers.utils.parseEther('100'));

		// addr1 should now have 300 tokens
		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('300'));

		// And there should be nothing left for addr1 to withdraw.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);
	});

	it('Should correctly distinguish withdrawal amounts by address', async () => {
		const [_, addr1, addr2] = await ethers.getSigners();

		// Not ready yet.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);
		expect(await vesting.withdrawalAmount(addr2.address)).to.equal(0);

		await fastForward(add(start, { years: 5 }));

		// Full amount should be ready for both.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(ethers.utils.parseEther('300'));
		expect(await vesting.withdrawalAmount(addr2.address)).to.equal(ethers.utils.parseEther('100'));

		// Withdraw for both.
		await expect(vesting.connect(addr1).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr1.address, ethers.utils.parseEther('300'));
		await expect(vesting.connect(addr2).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr2.address, ethers.utils.parseEther('100'));

		// Balances should be received.
		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('300'));
		expect(await token.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('100'));
	});

	it('Should correctly increment holder count on a vesting withdrawal', async () => {
		const [_, addr1] = await ethers.getSigners();

		// Should have 2 holders at the start.
		expect(await token.holderCount()).to.equal(2);

		await fastForward(add(start, { years: 5 }));

		// Withdraw
		await expect(vesting.connect(addr1).withdraw())
			.to.emit(vesting, 'Vested')
			.withArgs(addr1.address, ethers.utils.parseEther('300'));

		// Shold now have 3 holders.
		expect(await token.holderCount()).to.equal(3);
	});
});
