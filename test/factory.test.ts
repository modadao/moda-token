import { parseEther } from '@ethersproject/units';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import { ModaCorePool, ModaPoolFactory } from '../typechain-types';
import { revertSnapshot, takeSnapshot } from './helper';
import { setup, Setup } from './setup';
import { fromTimestampBN } from './utils';

chai.use(chaiDateTime);

const userBalances = [parseEther('2000'), parseEther('200')];

describe('Factory', () => {
	let factory: ModaPoolFactory;
	let corePool: ModaCorePool;
	let data: Setup;
	let snapshotId = 0;
	beforeEach(async () => {
		snapshotId = await takeSnapshot();
		data = await setup();
		return data;
	});
	afterEach(async () => revertSnapshot(snapshotId));

	it('Should correctly compound moda per second', async () => {
		const { factory } = data;
		const start = await factory.modaPerSecondAt(await factory.startTimestamp());
		const secondsPerUpdate = await factory.secondsPerUpdate();

		// If we let 15 periods go by, we should be dishing out
		// =(start*(POW(0.97, 15))) Moda per second
		let result = start.mul(parseEther(Math.pow(0.97, 15).toString())).div(parseEther('1'));

		expect(
			await factory.modaPerSecondAt((await factory.startTimestamp()).add(secondsPerUpdate * 15))
		);

		// And if we let 50 periods go by, we should be dishing out
		// =(start*(POW(0.97, 50))) Moda per second
		result = start.mul(parseEther(Math.pow(0.97, 50).toString())).div(parseEther('1'));

		expect(
			await factory.modaPerSecondAt((await factory.startTimestamp()).add(secondsPerUpdate * 50))
		);
	});

	it('Should reject stakeAsPool calls from arbitrary addresses', async () => {
		const { firstUser, modaCorePool } = data;
		await expect(
			modaCorePool.connect(firstUser).stakeAsPool(firstUser.address, parseEther('100'))
		).to.be.revertedWith('pool is not registered');
	});

	it('Should return zero modaPerSecond if requested before start time of factory', async () => {
		const { factory } = data;
		expect(await factory.modaPerSecondAt((await factory.startTimestamp()).sub(36000000))).to.equal(
			0
		);
		expect(await factory.modaPerSecondAt(await factory.startTimestamp())).to.equal(
			await factory.initialModaPerSecond()
		);
	});

	it('Should return the minimum modaPerSecond if requested after end time of factory', async () => {
		const { factory } = data;
		expect(await factory.modaPerSecondAt(await factory.endTimestamp())).to.equal(
			await factory.modaPerSecondAt((await factory.endTimestamp()).add(36000000))
		);
	});

	it('Should have decreasing moda per second over time', async () => {
		const { factory } = data;
		const epochStart = await factory.startTimestamp();
		const epochFinish = await factory.endTimestamp();
		const startRate = await factory.modaPerSecondAt(epochStart);
		const finishRate = await factory.modaPerSecondAt(epochFinish);
		expect(startRate.gt(finishRate)).to.be.true;
	});

	it('Should have a diminishing rewards epoch of 2 years (730 days)', async () => {
		const { factory } = data;
		const epochStart = await factory.startTimestamp();
		const epochFinish = await factory.endTimestamp();
		const start = fromTimestampBN(epochStart);
		const finish = fromTimestampBN(epochFinish);
		const duration = +finish - +start;
		expect(duration / 86400000).to.eq(730);
	});
});
