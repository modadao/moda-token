import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Vesting, Token } from '../typechain';
import { add, addTimestamp, fastForward, fromTimestamp, ROLE_TOKEN_CREATOR } from './utils';

describe('Vesting', () => {
	let token: Token;
	let vesting: Vesting;
	let start = new Date();

	let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress;

	beforeEach(async () => {
		[owner, addr1, addr2] = await ethers.getSigners();

		// These tests need to wander through time on each one, as HardHat won't let us go backwards.
		// We always construct the vesting schedule based on this 'now' value.
		let currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);

		const TokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(
			TokenFactory,
			[
				[
					'0x0364eAA7C884cb5495013804275120ab023619A5',
					'0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C',
				],
				[ethers.utils.parseEther('6500000'), ethers.utils.parseEther('3500000')],
			],
			{ kind: 'uups' }
		)) as Token;
		await token.deployed();

		const VestingFactory = await ethers.getContractFactory('Vesting');
		vesting = (await VestingFactory.deploy(token.address)) as Vesting;
		await vesting.deployed();

		await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address);

		await vesting.addToSchedule(addr1.address, [
			{
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 1 }),
				released: false,
			},
			{
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 2 }),
				released: false,
			},
			{
				amount: ethers.utils.parseEther('100'),
				releaseDate: addTimestamp(start, { years: 3 }),
				released: false,
			},
		]);

		await vesting.addToSchedule(addr2.address, [
			{
				amount: ethers.utils.parseEther('50'),
				releaseDate: addTimestamp(start, { months: 6 }),
				released: false,
			},
			{
				amount: ethers.utils.parseEther('50'),
				releaseDate: addTimestamp(start, { years: 1, months: 6 }),
				released: false,
			},
		]);

		currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
	});

	it('Should allow a simple withdrawal', async () => {
		await vesting.seal();

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
		await vesting.seal();

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
		await vesting.seal();

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
		await vesting.seal();

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

	it('Should reject a request to seal by a non-owner', async () => {
		await expect(vesting.connect(addr1).seal()).to.be.revertedWith(
			'Ownable: caller is not the owner'
		);
	});

	it('Should reject a withdrawal when not sealed', async () => {
		await fastForward(add(start, { years: 1 }));

		// The first amount should be ready now from a time perspective, except not because we're not sealed yet.
		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);

		// Withdraw it.
		await expect(vesting.connect(addr1).withdraw()).to.be.revertedWith('Vesting: not sealed');

		// And if we seal, are we good to go? We should be.
		await expect(vesting.seal()).to.emit(vesting, 'VestingSealed');

		expect(await vesting.withdrawalAmount(addr1.address)).to.equal(ethers.utils.parseEther('100'));
	});

	it('Should allow changes to the schedule before sealed', async () => {
		await expect(
			vesting.addToSchedule(addr1.address, [
				{
					amount: ethers.utils.parseEther('100'),
					releaseDate: addTimestamp(start, { years: 4 }),
					released: false,
				},
			])
		).to.emit(vesting, 'ScheduleChanged');

		const { amount, releaseDate, released } = await vesting.schedule(addr1.address, 3);

		expect(amount).to.equal(ethers.utils.parseEther('100'));
		expect(releaseDate).to.equal(addTimestamp(start, { years: 4 }));
		expect(released).to.equal(false);
	});

	it('Should reject changes to the schedule once sealed, even from an owner', async () => {
		await vesting.seal();

		await expect(
			vesting.addToSchedule(addr1.address, [
				{
					amount: ethers.utils.parseEther('100'),
					releaseDate: addTimestamp(start, { years: 4 }),
					released: false,
				},
			])
		).to.be.revertedWith('Vesting: sealed');
	});
});
