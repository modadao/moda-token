import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, fastForward, toTimestampBN } from '../utils';
import { setup } from './setup';
import { Token } from '../../typechain-types';
import { upgrades, ethers } from 'hardhat';
import { BigNumber } from 'ethers';

chai.use(chaiDateTime);

describe('Staking and unstaking', () => {
	it('Should have zero rewards for users without a stake', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = await setup();

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[[firstUser.address, secondUser.address, thirdUser.address], [amount1,amount2,amount3]],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);

		expect (await modaCorePool.pendingYieldRewards(firstUser.address)).to.be.eq(BigNumber.from(0));
		expect (await modaCorePool.pendingYieldRewards(secondUser.address)).to.be.eq(BigNumber.from(0));
		expect (await modaCorePool.pendingYieldRewards(thirdUser.address)).to.be.eq(BigNumber.from(0));

		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		expect (await modaCorePool.pendingYieldRewards(firstUser.address)).to.be.eq(BigNumber.from(0));
		expect (await modaCorePool.pendingYieldRewards(secondUser.address)).to.be.eq(BigNumber.from(0));
		expect (await modaCorePool.pendingYieldRewards(thirdUser.address)).to.be.eq(BigNumber.from(0));
	});


	it('Should have zero rewards at the time of staking', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = await setup();

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[[firstUser.address, secondUser.address, thirdUser.address], [amount1,amount2,amount3]],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);

		const yield1=await modaCorePool.pendingYieldRewards(firstUser.address);
		const yield2=await modaCorePool.pendingYieldRewards(secondUser.address);
		expect(yield1).to.equal(yield2);

		//const actual = BigNumber.from('3209448146078158022');
		expect(yield1).to.equal(0);
		expect(yield2).to.equal(0);
	});

	it('Should prevent users from unstaking without a stake', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = await setup();

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[[firstUser.address, secondUser.address, thirdUser.address], [amount1,amount2,amount3]],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);
		
		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);
		
		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		try{
			await modaCorePool.connect(thirdUser).unstake(1, stakeAmount);
			expect(true).to.be.false;
		} catch {
			expect(true).to.be.true;
		}
	});

	it('Should isolate stakes', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = await setup();

		const amount1 = parseEther('150');
		const amount2 = parseEther('800');
		const amount3 = parseEther('500');
		const stakeAmount = parseEther('100');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[[firstUser.address, secondUser.address, thirdUser.address], [amount1,amount2,amount3]],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();

		await token.connect(firstUser).approve(modaCorePool.address, amount1);
		await token.connect(secondUser).approve(modaCorePool.address, amount2);
		await token.connect(thirdUser).approve(modaCorePool.address, amount3);

		expect(await token.allowance(firstUser.address, modaCorePool.address)).to.equal(amount1);
		expect(await token.allowance(secondUser.address, modaCorePool.address)).to.equal(amount2);
		expect(await token.allowance(thirdUser.address, modaCorePool.address)).to.equal(amount3);

		const lockUntil = toTimestampBN(add(start, { years: 1 }));

		await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil);
		await modaCorePool.connect(secondUser).stake(stakeAmount, lockUntil);
		
		const futureDate: Date = add(start, { years: 1 });
		await fastForward(futureDate);
		
		await modaCorePool.connect(firstUser).processRewards();
		await modaCorePool.connect(secondUser).processRewards();
		await modaCorePool.connect(thirdUser).processRewards();

		try{
			await modaCorePool.connect(thirdUser).unstake(1, stakeAmount);
			expect(true).to.be.false;
		} catch {
			expect(true).to.be.true;
		}
	});
});
