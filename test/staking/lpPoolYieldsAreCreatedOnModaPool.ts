import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, blockNow, fastForward, toTimestampBN } from '../utils';
import { setup, Setup } from './setup';
import { BigNumber } from 'ethers';
import { formatEther } from 'ethers/lib/utils';

chai.use(chaiDateTime);

describe('LP Pool yields are created on Moda Core Pool', () => {
	it('creates the correct deposits', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = await setup();
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		const timeOfCompounding = (await blockNow()).getTime() / 1000;
		const lpPoolRewardsAfter30Days = await lpPool.pendingYieldRewards(firstUser.address);
		expect(lpPoolRewardsAfter30Days).to.eq('8307287439586513051774470');

		let modaPoolDepositLength = await modaCorePool.getDepositsLength(firstUser.address);
		let lpPoolDepositLength = await lpPool.getDepositsLength(firstUser.address);
		expect(modaPoolDepositLength).to.eq(1);
		expect(lpPoolDepositLength).to.eq(1);

		await lpPool.connect(firstUser).processRewards();

		modaPoolDepositLength = await modaCorePool.getDepositsLength(firstUser.address);
		lpPoolDepositLength = await lpPool.getDepositsLength(firstUser.address);

		expect(modaPoolDepositLength).to.eq(3);
		expect(lpPoolDepositLength).to.eq(1);

		const lpYieldDepositIndex = 2;
		const [lpTokenAmount, lpWeight, lpYieldLockedFrom, lpYieldLockedUntil, isYield] =
			await modaCorePool.getDeposit(firstUser.address, lpYieldDepositIndex);
		const allowedDeltaForModaEarnedSinceLastQuery = parseEther('4');
		const delta = lpTokenAmount.sub(lpPoolRewardsAfter30Days);
		const blockDate = await blockNow();
		const currentBlockTime = blockDate.getTime() / 1000;
		const oneYearFromNow = toTimestampBN(add(blockDate, { years: 1 }));

		expect(delta).to.be.lte(allowedDeltaForModaEarnedSinceLastQuery);
		expect(lpWeight).to.be.eq(lpTokenAmount.mul(2e6));
		expect(lpYieldLockedFrom).to.be.eq(currentBlockTime);
		expect(lpYieldLockedUntil).to.be.eq(oneYearFromNow);
		expect(isYield).to.be.true;

		expect(await lpPool.pendingYieldRewards(firstUser.address)).to.eq(0);
	});
});
