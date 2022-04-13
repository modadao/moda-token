import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, fastForward, toTimestampBN } from '../utils';
import { Setup, setup } from './setup';
import { Token } from '../../typechain-types';
import { upgrades, ethers } from 'hardhat';
import { BigNumber } from 'ethers';

chai.use(chaiDateTime);

describe('Rewards', () => {
    let data: Setup;
    beforeEach(async () => (data = await setup()));

	it('Should have less than 202428 moda total rewards after 2 years', async () => {
		const { start, firstUser, secondUser, thirdUser, modaCorePool, lpPool, moda } = await setup();

        const eth = parseEther('1');
		const amount1 = parseEther('100');
		const stakeAmount = parseEther('1');

		const tokenFactory = await ethers.getContractFactory('Token');
		const token = (await upgrades.deployProxy(
			tokenFactory,
			[[firstUser.address, secondUser.address, thirdUser.address], [amount1,amount1,amount1]],
			{
				kind: 'uups',
			}
		)) as Token;
		await token.deployed();
        
		await token.connect(firstUser).approve(modaCorePool.address, amount1);

        const lockUntil1 = toTimestampBN(add(start, { years: 1 }));
        await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil1);

		const futureDate1: Date = add(start, { years: 1 });
		await fastForward(futureDate1);

        expect(await modaCorePool.getDepositsLength(firstUser.address)).to.eq(1, 'Should have rewards deposited');
        const year1tokens = await token.allowance(firstUser.address, modaCorePool.address);
        expect(year1tokens.div(eth)).to.eq(100, 'Should have token allowance = initial deposit');

        const lockUntil2 = toTimestampBN(add(futureDate1, { years: 1 }));
        await modaCorePool.connect(firstUser).stake(stakeAmount, lockUntil2);

        const futureDate2: Date = add(futureDate1, { years: 1 });
		await fastForward(futureDate2);

        await modaCorePool.connect(firstUser).processRewards();

        const deposits = await modaCorePool.getDepositsLength(firstUser.address);
        expect(deposits).to.eq(4);

        let totalRewards = BigNumber.from('0');
        for (let i=0; i < deposits.toNumber(); i++){
            const deposit = await modaCorePool.getDeposit(firstUser.address, i);
            const tokens = (deposit.tokenAmount.div(eth));
            totalRewards = totalRewards.add(deposit.tokenAmount);
        }
        expect(totalRewards.div(eth)).of.be.lessThan(202428);
	});
    
});
