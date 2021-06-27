import { network } from 'hardhat';

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
