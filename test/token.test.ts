import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Token } from '../typechain';
const { BigNumber } = ethers;

describe('Token', () => {
	let token: Token;

	beforeEach(async () => {
		const TokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(TokenFactory, { kind: 'uups' })) as Token;
		await token.deployed();
	});

	it('Should return total supply once deployed', async () => {
		const expected = ethers.utils.parseEther('10000000'); // 10,000,000 tokens total
		expect(await token.totalSupply()).to.equal(expected);
	});

	it('Should set holders allocations on deploy', async () => {
		expect(await token.balanceOf('0x0364eAA7C884cb5495013804275120ab023619A5')).to.equal(
			ethers.utils.parseEther('6500000') // 6,500,000 balance
		);
		expect(await token.balanceOf('0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C')).to.equal(
			ethers.utils.parseEther('3500000') // '3,500,000 balance
		);
		expect(await token.totalSupply()).to.equal(ethers.utils.parseEther('10000000'));
		expect(await token.holderCount()).to.equal(BigNumber.from('2'));
	});

	it('Should allow a transfer of 100 tokens from owner', async () => {
		const [owner, addr1] = await ethers.getSigners();
		await token.connect(owner).transfer(addr1.address, ethers.utils.parseEther('100'));

		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('100'));
	});

	it('Should have holder count as 2 on initial deployment', async () => {
		expect(await token.holderCount()).to.equal(BigNumber.from('2'));
	});

	it('Should correctly track holder count on multiple transfers', async () => {
		const [owner, addr1] = await ethers.getSigners();

		// We should start with 2 holders.
		expect(await token.holderCount()).to.equal(BigNumber.from('2'));

		// When we transfer 1 to another signer, we should have 3 holders
		await token.connect(owner).transfer(addr1.address, ethers.utils.parseEther('1'));
		expect(await token.holderCount()).to.equal(BigNumber.from('3'));

		// And when we transfer it back, we should be back down to 2 holders
		await token.connect(addr1).transfer(owner.address, ethers.utils.parseEther('1'));
		expect(await token.holderCount()).to.equal(BigNumber.from('2'));
	});

	it('Should not be able to read proxy storage state from underlying calls (and is effectively bricked in that pattern as there are no holders)', async () => {
		const TokenFactory = await ethers.getContractFactory('Token');
		const [firstLog] = await token.queryFilter(token.filters.Upgraded());
		const implementation = TokenFactory.attach(firstLog.args.implementation) as Token;

		expect(await implementation.holderCount()).to.equal(BigNumber.from('0'));
	});

	it('Should allow a large approval');
	it('Should reject a transferFrom if not approved');

	it('Should allow an upgrade to a new token contract');
});
