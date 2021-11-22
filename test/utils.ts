import { BigNumber } from '@ethersproject/bignumber';
import { network, ethers } from 'hardhat';

export const fastForward = async (newDate: Date) => {
	await network.provider.send('evm_setNextBlockTimestamp', [Math.floor(newDate.getTime() / 1000)]);
	await network.provider.send('evm_mine');
};

export const blockNow = async () => {
	const { timestamp } = await ethers.provider.getBlock('latest');
	return fromTimestamp(timestamp);
};

export const add = (
	date: Date,
	{
		years = 0,
		months = 0,
		days = 0,
		hours = 0,
		minutes = 0,
		seconds = 0,
	}: {
		years?: number;
		months?: number;
		days?: number;
		hours?: number;
		minutes?: number;
		seconds?: number;
	}
) =>
	new Date(
		years + date.getFullYear(),
		months + date.getMonth(),
		days + date.getDate(),
		hours + date.getHours(),
		minutes + date.getMinutes(),
		seconds + date.getSeconds()
	);

export const toTimestamp = (date: Date) => Math.floor(date.getTime() / 1000);
export const toTimestampBN = (date: Date) => BigNumber.from(toTimestamp(date));
export const fromTimestamp = (timeSeconds: number) => new Date(timeSeconds * 1000);
export const fromTimestampBN = (timeSeconds: BigNumber) => fromTimestamp(timeSeconds.toNumber());

export const addTimestamp = (
	date: Date,
	delta: { years?: number; months?: number; days?: number }
) => toTimestamp(add(date, delta));

export const ADDRESS0 = '0x0000000000000000000000000000000000000000';

export const MILLIS = 1000;
export const SECOND = MILLIS;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const YEAR = 365 * DAY;

export const toBytes32 = (hexString: string) => `0x${hexString.padEnd(64, '0')}`;

export const ROLE_ADMIN = toBytes32('0');
export const ROLE_UPGRADER = toBytes32('000a');
export const ROLE_TOKEN_CREATOR = toBytes32('000b');
export const ROLE_POOL_STAKING = toBytes32('000c');

export const accessControlError = (address: string, role: string) =>
	`AccessControl: account ${address.toLowerCase()} is missing role ${role.toLowerCase()}`;

export async function mineBlocks(blocks: number) {
	while (blocks > 0) {
		--blocks;
		await network.provider.request({
			method: 'evm_mine',
			params: [],
		});
	}
}
