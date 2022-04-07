import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { add, fastForward, toTimestampBN } from '../utils';
import { setup, Setup } from './setup';

chai.use(chaiDateTime);

describe('claiming rewards', () => {
	let data: Setup;
	beforeEach(async () => (data = await setup()));

	it('resets the pending rewards amount after a user compounds their rewards', async () => {
		const { modaCorePool, lpPool, start, firstUser } = data;
		const firstUserStakeAmount = parseEther('10');
		const lockUntil = toTimestampBN(add(start, { years: 1 }));
		await modaCorePool.connect(firstUser).stake(firstUserStakeAmount, lockUntil);
		await lpPool.connect(firstUser).stake(firstUserStakeAmount, lockUntil);

		const thirtyDaysAfter = add(start, { days: 30 });
		await fastForward(thirtyDaysAfter);

		expect(
			await modaCorePool.pendingYieldRewards(firstUser.address),
			'MODA Core Pool has pending rewards'
		).to.be.gt(0);

		expect(
			await lpPool.pendingYieldRewards(firstUser.address),
			'LP Pool has pending rewards'
		).to.be.gt(0);

		await modaCorePool.connect(firstUser).processRewards();
		await lpPool.connect(firstUser).processRewards();

		expect(
			await modaCorePool.pendingYieldRewards(firstUser.address),
			'MODA Core Pool has zero pending rewards after compound'
		).to.eq(0);

		expect(
			await lpPool.pendingYieldRewards(firstUser.address),
			'LP Pool has zero pending rewards after compound'
		).to.eq('0');
	});
});
