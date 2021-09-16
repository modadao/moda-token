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
export const fromTimestamp = (timestamp: number) => new Date(timestamp * 1000);

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
export const HOUR: number = 60 * 60 * MILLIS;
export const DAY: number = 24 * HOUR;
export const YEAR: number = 365 * DAY;
