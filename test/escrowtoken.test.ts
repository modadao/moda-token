import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EscrowedModaERC20, Token } from '../typechain-types';

describe('Escrow Token', () => {
	const initialSupply = ethers.utils.parseEther('1000000');
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress;

	beforeEach(async () => {
		[owner, addr1, addr2] = await ethers.getSigners();

		const escrowTokenFactory = await ethers.getContractFactory('EscrowedModaERC20');
		escrowToken = (await escrowTokenFactory.deploy()) as EscrowedModaERC20;
		await escrowToken.deployed();

		escrowToken.mint(owner.address, initialSupply); // Starting owner balance.
	});

	it('Should return total supply of `initialSupply` once deployed', async () => {
		expect(await escrowToken.totalSupply()).to.equal(initialSupply);
	});

	it('Should allow minting by owner', async () => {
		expect(await escrowToken.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('0'));
		expect(await escrowToken.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('0'));
		await escrowToken.mint(addr1.address, ethers.utils.parseEther('508'));
		expect(await escrowToken.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('508'));

		await escrowToken.mint(addr2.address, ethers.utils.parseEther('509'));
		expect(await escrowToken.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('509'));

		expect(await escrowToken.totalSupply()).to.equal(
			initialSupply.add(ethers.utils.parseEther('1017'))
		);
	});

	it('Should allow a transfer of 127 tokens from owner', async () => {
		const [owner, addr1] = await ethers.getSigners();
		await escrowToken.connect(owner).transfer(addr1.address, ethers.utils.parseEther('127'));

		expect(await escrowToken.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('127'));
	});

	it('Should emit a well formed Transfer event on transfer() and transferFrom()', async () => {
		const [owner, addr1, addr2] = await ethers.getSigners();

		await expect(escrowToken.connect(owner).transfer(addr1.address, 1))
			.to.emit(escrowToken, 'Transfer')
			.withArgs(owner.address, addr1.address, 1);

		await escrowToken.connect(owner).approve(addr1.address, 1);
		await expect(escrowToken.connect(addr1).transferFrom(owner.address, addr2.address, 1))
			.to.emit(escrowToken, 'Transfer')
			.withArgs(owner.address, addr2.address, 1);
	});

	it('Should allow a larger approval than current balance', async () => {
		const [owner, addr1] = await ethers.getSigners();
		const balance = await escrowToken.balanceOf(owner.address);
		const allowance = balance.add(ethers.utils.parseEther('1'));

		await escrowToken.connect(owner).approve(addr1.address, allowance);
		expect(await escrowToken.allowance(owner.address, addr1.address)).to.equal(allowance);
	});

	it('Should reject a transferFrom if not approved', async () => {
		const [owner, addr1] = await ethers.getSigners();
		await expect(
			escrowToken.connect(addr1).transferFrom(owner.address, addr1.address, 1)
		).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
	});

	it('Should reject a transfer that exceeds balance', async () => {
		const [owner, addr1] = await ethers.getSigners();
		expect(await escrowToken.balanceOf(addr1.address)).to.equal(0);
		await expect(escrowToken.connect(addr1).transfer(owner.address, 1)).to.be.revertedWith(
			'ERC20: transfer amount exceeds balance'
		);

		await escrowToken.connect(owner).transfer(addr1.address, 5);
		expect(await escrowToken.balanceOf(addr1.address)).to.equal(5);
		await expect(escrowToken.connect(addr1).transfer(owner.address, 6)).to.be.revertedWith(
			'ERC20: transfer amount exceeds balance'
		);
		await escrowToken.connect(addr1).transfer(owner.address, 5);
	});

	it('Should allow changing the owner', async () => {
		const [owner, addr1] = await ethers.getSigners();

		expect(await escrowToken.owner()).to.equal(owner.address);
		await expect(escrowToken.transferOwnership(addr1.address))
			.to.emit(escrowToken, 'OwnershipTransferred')
			.withArgs(owner.address, addr1.address);
		expect(await escrowToken.owner()).to.equal(addr1.address);
	});

	it('Should reject requests to change ownership from a non-owning address', async () => {
		const [_, addr1] = await ethers.getSigners();
		await expect(escrowToken.connect(addr1).transferOwnership(addr1.address)).to.be.revertedWith(
			'Ownable: caller is not the owner'
		);
	});

	it('Should reject burning more than the address owns', async () => {
		const [_, addr1] = await ethers.getSigners();
		await expect(escrowToken.mint(addr1.address, ethers.utils.parseEther('2')));
		await expect(escrowToken.connect(addr1).burn(ethers.utils.parseEther('3'))).to.be.revertedWith(
			'ERC20: burn amount exceeds balance'
		);
	});

	it('Should allow burning it all', async () => {
		const [_, addr1] = await ethers.getSigners();
		const amount = ethers.utils.parseEther('2');
		await expect(escrowToken.mint(addr1.address, amount));
		const balance = await escrowToken.balanceOf(addr1.address);
		expect(balance).is.equal(amount);
		await escrowToken.connect(addr1).burn(amount);
		expect(await escrowToken.balanceOf(addr1.address)).is.equal('0');
	});
});
