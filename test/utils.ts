import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';

export const fastForward = async (newDate: Date) => {
	// If debugging is needed.
	// console.log(`Fast forwarding to: ${newDate.toLocaleDateString()}`);

	await network.provider.send('evm_setNextBlockTimestamp', [newDate.getTime() / 1000]);
	await network.provider.send('evm_mine');
};

export const add = (
	date: Date,
	{ years = 0, months = 0, days = 0 }: { years?: number; months?: number; days?: number }
) => new Date(years + date.getFullYear(), months + date.getMonth(), days + date.getDate());

export const toTimestamp = (date: Date) => date.getTime() / 1000;
export const toTimestampBN = (date: Date) => BigNumber.from(toTimestamp(date));
export const fromTimestamp = (timeSeconds: number) => new Date(timeSeconds * 1000);
export const fromTimestampBN = (timeSeconds: BigNumber) => fromTimestamp(timeSeconds.toNumber());

export const addTimestamp = (
	date: Date,
	delta: { years?: number; months?: number; days?: number }
) => toTimestamp(add(date, delta));

export function toEth(amount: string): BigNumber {
	return ethers.utils.parseEther(amount);
}

export const ROLE_TOKEN_CREATOR = [
	0, 0xa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

export const ROLE_POOL_STAKING = [
	0, 0xb, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

export const BIGZERO: BigNumber = BigNumber.from(0);
export const ADDRESS0 = '0x0000000000000000000000000000000000000000';

export const MILLIS: number = 1000;
export const SECOND: number = MILLIS;
export const MINUTE: number = 60 * SECOND;
export const HOUR: number = 60 * MINUTE;
export const DAY: number = 24 * HOUR;
export const YEAR: number = 365 * DAY;

export async function mineBlocks(blocks: number) {
	while (blocks > 0) {
		--blocks;
		await network.provider.request({
			method: 'evm_mine',
			params: [],
		});
	}
}
