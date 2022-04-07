import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, fastForward, toTimestampBN } from '../utils';
import { setup, Setup } from './setup';
import { BigNumber } from 'ethers';

chai.use(chaiDateTime);

describe('Multiple pool rewards', () => {
	let data: Setup;
	beforeEach(async () => (data = await setup()));

	it('Should have correct rewards with multiple pools', async () => {
		const { start, firstUser, secondUser, modaCorePool, lpPool } = data;
		const userStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(userStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(userStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		const modaPoolRewardsAfter30Days = await modaCorePool.pendingYieldRewards(firstUser.address);
		expect(modaPoolRewardsAfter30Days).to.be.gt(0);

		expect(
			await lpPool.pendingYieldRewards(firstUser.address),
			'LP pool rewards for first user after 30 days'
		).to.eq(modaPoolRewardsAfter30Days.mul(2));

		expect(await modaCorePool.getDepositsLength(firstUser.address)).to.eq(1);
		expect(await lpPool.getDepositsLength(firstUser.address)).to.eq(1);
		await modaCorePool.connect(firstUser).processRewards();
		expect(
			await modaCorePool.getDepositsLength(firstUser.address),
			'Has original deposit and a yield'
		).to.eq(2);
		await lpPool.connect(firstUser).processRewards();
		expect(
			await modaCorePool.getDepositsLength(firstUser.address),
			'LP Pool rewards paid out in MODA Pool yield deposits'
		).to.eq(4);

		const rewardsAfterClaim = await modaCorePool.pendingYieldRewards(firstUser.address);
		expect(rewardsAfterClaim).to.equal(0);

		await modaCorePool.connect(secondUser).stake(userStakeAmount, lockUntil);

		const sixtyDaysAfter = add(start, { days: 60 });
		await fastForward(sixtyDaysAfter);

		const firstUserRewards = await modaCorePool.pendingYieldRewards(firstUser.address);
		const secondUserRewards = await modaCorePool.pendingYieldRewards(secondUser.address);

		expect(firstUserRewards, 'First user').to.equal(BigNumber.from('4165215393737488061985121'));
		expect(secondUserRewards, 'Second user').to.equal(BigNumber.from('6397136248225413888'));
	});
});
