import chai, { expect } from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers, upgrades } from 'hardhat';
import { Token, UpgradeTestToken } from '../typechain';

chai.use(solidity);

describe('Token', () => {
	let token: Token;

	beforeEach(async () => {
		const TokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(TokenFactory, { kind: 'uups' })) as Token;
		await token.deployed();
	});

	it('Should return total supply once deployed', async () => {
		expect(await token.totalSupply()).to.equal(ethers.utils.parseEther('10000000')); // 10,000,000 tokens total
	});

	it('Should set holders allocations on deploy', async () => {
		expect(await token.balanceOf('0x0364eAA7C884cb5495013804275120ab023619A5')).to.equal(
			ethers.utils.parseEther('6500000') // 6,500,000 balance
		);
		expect(await token.balanceOf('0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C')).to.equal(
			ethers.utils.parseEther('3500000') // '3,500,000 balance
		);
		expect(await token.totalSupply()).to.equal(ethers.utils.parseEther('10000000'));
		expect(await token.holderCount()).to.equal(2);
	});

	it('Should allow a transfer of 100 tokens from owner', async () => {
		const [owner, addr1] = await ethers.getSigners();
		await token.connect(owner).transfer(addr1.address, ethers.utils.parseEther('100'));

		expect(await token.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('100'));
	});

	it('Should have holder count as 2 on initial deployment', async () => {
		expect(await token.holderCount()).to.equal(2);
	});

	it('Should correctly track holder count on multiple transfers', async () => {
		const [owner, addr1] = await ethers.getSigners();

		// We should start with 2 holders.
		expect(await token.holderCount()).to.equal(2);

		// When we transfer 1 wei to another signer, we should have 3 holders
		await token.connect(owner).transfer(addr1.address, 1);
		expect(await token.holderCount()).to.equal(3);

		// And when we transfer it back, we should be back down to 2 holders
		await token.connect(addr1).transfer(owner.address, 1);
		expect(await token.holderCount()).to.equal(2);
	});

	it('Should correctly track holder count on multiple transfers (performed via transferFrom)', async () => {
		const [owner, addr1, addr2] = await ethers.getSigners();

		// We should start with 2 holders.
		expect(await token.holderCount()).to.equal(2);

		// When we transfer 1 wei to another signer, we should have 3 holders
		await token.connect(owner).approve(addr1.address, 1);
		await token.connect(addr1).transferFrom(owner.address, addr2.address, 1);
		expect(await token.holderCount()).to.equal(3);

		// And when we transfer it back, we should be back down to 2 holders
		await token.connect(addr2).approve(addr1.address, 1);
		await token.connect(addr1).transferFrom(addr2.address, owner.address, 1);
		expect(await token.holderCount()).to.equal(2);
	});

	it('Should emit a well formed Transfer event on transfer() and transferFrom()', async () => {
		const [owner, addr1, addr2] = await ethers.getSigners();

		await expect(token.connect(owner).transfer(addr1.address, 1))
			.to.emit(token, 'Transfer')
			.withArgs(owner.address, addr1.address, 1);

		await token.connect(owner).approve(addr1.address, 1);
		await expect(token.connect(addr1).transferFrom(owner.address, addr2.address, 1))
			.to.emit(token, 'Transfer')
			.withArgs(owner.address, addr2.address, 1);
	});

	it('Should not be able to read proxy storage state from calls to implementation contract (and is effectively bricked in that pattern as there are no holders)', async () => {
		const TokenFactory = await ethers.getContractFactory('Token');
		const [firstLog] = await token.queryFilter(token.filters.Upgraded());
		const implementation = TokenFactory.attach(firstLog.args.implementation) as Token;

		expect(await implementation.holderCount()).to.equal(0);
		expect(await implementation.balanceOf(await token._foundation())).to.equal(0);
	});

	it('Should allow a larger approval than current balance', async () => {
		const [owner, addr1] = await ethers.getSigners();
		const balance = await token.balanceOf(owner.address);
		const allowance = balance.add(ethers.utils.parseEther('1'));

		await token.connect(owner).approve(addr1.address, allowance);
		expect(await token.allowance(owner.address, addr1.address)).to.equal(allowance);
	});

	it('Should reject a transferFrom if not approved', async () => {
		const [owner, addr1] = await ethers.getSigners();
		await expect(
			token.connect(addr1).transferFrom(owner.address, addr1.address, 1)
		).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
	});

	it('Should reject a transfer that exceeds balance', async () => {
		const [owner, addr1] = await ethers.getSigners();
		expect(await token.balanceOf(addr1.address)).to.equal(0);
		await expect(token.connect(addr1).transfer(owner.address, 1)).to.be.revertedWith(
			'ERC20: transfer amount exceeds balance'
		);

		await token.connect(owner).transfer(addr1.address, 5);
		expect(await token.balanceOf(addr1.address)).to.equal(5);
		await expect(token.connect(addr1).transfer(owner.address, 6)).to.be.revertedWith(
			'ERC20: transfer amount exceeds balance'
		);
		await token.connect(addr1).transfer(owner.address, 5);
	});

	it('Should allow an upgrade to a new token contract', async () => {
		const UpgradeTestTokenFactory = await ethers.getContractFactory('UpgradeTestToken');
		const tokenV2 = (await upgrades.upgradeProxy(
			token,
			UpgradeTestTokenFactory
		)) as UpgradeTestToken;
		await tokenV2.deployed();

		const logs = await token.queryFilter(token.filters.Upgraded());
		expect(logs.length).to.equal(2);
		const [first, second] = logs.map((log) => log.args.implementation);
		expect(first).not.equal(second);

		expect(await tokenV2.holderCount()).to.equal(2);
	});

	it('Should only accept upgrade requests from the current owner', async () => {
		const [_, addr1] = await ethers.getSigners();

		const UpgradeTestTokenFactory = await ethers.getContractFactory('UpgradeTestToken');
		const tokenV2 = await UpgradeTestTokenFactory.deploy();
		await tokenV2.deployed();

		await expect(token.connect(addr1).upgradeTo(tokenV2.address)).to.be.revertedWith(
			'Ownable: caller is not the owner'
		);
	});

	it('Should allow changing the owner', async () => {
		const [owner, addr1] = await ethers.getSigners();

		expect(await token.owner()).to.equal(owner.address);
		await expect(token.transferOwnership(addr1.address))
			.to.emit(token, 'OwnershipTransferred')
			.withArgs(owner.address, addr1.address);
		expect(await token.owner()).to.equal(addr1.address);
	});

	it('Should reject requests to change ownership from a non-owning address', async () => {
		const [_, addr1] = await ethers.getSigners();
		await expect(token.connect(addr1).transferOwnership(addr1.address)).to.be.revertedWith(
			'Ownable: caller is not the owner'
		);
	});
});
