import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { formatBytes32String, parseBytes32String, parseEther } from 'ethers/lib/utils';
import { ethers, upgrades } from 'hardhat';
import { Vesting, Token } from '../typechain-types';
import { add, addTimestamp, blockNow, fastForward, ROLE_TOKEN_CREATOR, toTimestamp } from './utils';

describe('Vesting', () => {
	let token: Token;
	let vesting: Vesting;
	let start = new Date();

	let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress;

	beforeEach(async () => {
		[owner, addr1, addr2] = await ethers.getSigners();

		// These tests need to wander through time on each one, as HardHat won't let us go backwards.
		// We always construct the vesting schedule based on this 'now' value.
		start = await blockNow();

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
		vesting = (await VestingFactory.deploy(
			token.address,
			formatBytes32String('Investors')
		)) as Vesting;
		await vesting.deployed();

		await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address);

		await vesting.addToSchedule(
			[addr1.address],
			[
				{
					amount: ethers.utils.parseEther('300'),
					startDate: addTimestamp(start, { days: 10 }),
					endDate: addTimestamp(start, { days: 10, years: 3 }),
				},
			]
		);

		await vesting.addToSchedule(
			[addr2.address, addr2.address],
			[
				{
					amount: ethers.utils.parseEther('50'),
					startDate: addTimestamp(start, { days: 10, months: 6 }),
					endDate: addTimestamp(start, { days: 10, months: 6 }),
				},
				{
					amount: ethers.utils.parseEther('50'),
					startDate: addTimestamp(start, { years: 1, months: 6 }),
					endDate: addTimestamp(start, { years: 1, months: 6 }),
				},
			]
		);
	});

	describe('Name', () => {
		it('Should return the correct name', async () => {
			expect(await vesting.name()).to.equal(formatBytes32String('Investors'));

			parseBytes32String(await vesting.name());
		});

		it('Should set the correct name on deploy', async () => {
			const VestingFactory = await ethers.getContractFactory('Vesting');
			const newVesting = (await VestingFactory.deploy(
				token.address,
				formatBytes32String('Stuff')
			)) as Vesting;
			await newVesting.deployed();

			expect(await newVesting.name()).to.equal(formatBytes32String('Stuff'));
		});
	});
	describe('Withdrawals', () => {
		it('Should allow a simple withdrawal', async () => {
			expect(await token.balanceOf(addr1.address)).to.equal(0); // Should start with no tokens.
			expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0); // Not ready yet.

			await fastForward(add(start, { days: 10 }));
			expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0); // Still not ready.

			await fastForward(add(start, { years: 1, days: 10 }));

			// The first third should be ready now. There's a bit of slop because of timestamps and exact
			// mining times on the hardhat chain.
			let amount = await vesting.withdrawalAmount(addr1.address);
			expect(amount.gte(ethers.utils.parseEther('100'))).to.be.true;
			expect(amount.lte(ethers.utils.parseEther('100.000001'))).to.be.true;

			// Withdraw it.
			await expect(vesting.connect(addr1).withdraw()).to.emit(vesting, 'Vested');

			// addr1 should now have the tokens
			expect((await token.balanceOf(addr1.address)).gte(amount)).to.be.true;
			expect((await token.balanceOf(addr1.address)).lte(amount.add(parseEther('0.00001')))).to.be
				.true;

			// Ok, now we've tested the slop, we know what we got for real.
			amount = await token.balanceOf(addr1.address);

			// If we fast forward for the remainder, they should only get a total of 300 as in the schedule.
			await fastForward(add(start, { years: 3, days: 11 }));
			expect(await vesting.withdrawalAmount(addr1.address)).to.equal(parseEther('300').sub(amount));

			// Withdraw it.
			await expect(vesting.connect(addr1).withdraw())
				.to.emit(vesting, 'Vested')
				.withArgs(addr1.address, parseEther('300').sub(amount));

			expect(await token.balanceOf(addr1.address)).to.equal(parseEther('300')); // Should have full amount.
		});

		it('Should allow a combined withdrawal', async () => {
			expect(await token.balanceOf(addr2.address)).to.equal(0); // Should start with no tokens.
			expect(await vesting.withdrawalAmount(addr2.address)).to.equal(0); // Not ready yet.

			await fastForward(add(start, { years: 2 }));

			// Both the first and second amount should be ready now.
			expect(await vesting.withdrawalAmount(addr2.address)).to.equal(
				ethers.utils.parseEther('100')
			);

			// Withdraw it.
			await expect(vesting.connect(addr2).withdraw())
				.to.emit(vesting, 'Vested')
				.withArgs(addr2.address, ethers.utils.parseEther('100'));

			// addr2 should now have 200 tokens
			expect(await token.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('100'));

			// And there should be nothing left for addr2 to withdraw.
			expect(await vesting.withdrawalAmount(addr2.address)).to.equal(0);
		});

		it('Should correctly distinguish withdrawal amounts by address', async () => {
			// Not ready yet.
			expect(await vesting.withdrawalAmount(addr1.address)).to.equal(0);
			expect(await vesting.withdrawalAmount(addr2.address)).to.equal(0);

			await fastForward(add(start, { years: 5 }));

			// Full amount should be ready for both.
			expect(await vesting.withdrawalAmount(addr1.address)).to.equal(
				ethers.utils.parseEther('300')
			);
			expect(await vesting.withdrawalAmount(addr2.address)).to.equal(
				ethers.utils.parseEther('100')
			);

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
});
