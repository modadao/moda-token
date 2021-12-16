import { parseEther } from '@ethersproject/units';
import { BigNumberish } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ROLE_TOKEN_CREATOR, toTimestamp } from '../test/utils';
import { Token, Token__factory, Vesting__factory } from '../typechain';
import { vestingTablePrivate } from './vesting-table-private';
import { vestingTableTS } from './vesting-table-ts';

const pageSize = 54;
const start = new Date('2021/12/07');
const months = (amount: number) =>
	new Date(start.getFullYear(), start.getMonth() + amount, start.getDate());

const chunk = (array: any[], pageSize: number) => {
	const chunks = [];
	let i = 0;

	while (i < array.length) {
		chunks.push(array.slice(i, (i += pageSize)));
	}

	return chunks;
};

console.log('Start: ', start.toLocaleDateString());
console.log('5 Months: ', months(5).toLocaleDateString());
console.log('9 Months: ', months(9).toLocaleDateString());
console.log('12 Months: ', months(12).toLocaleDateString());

const getEndDate = (period: string) => {
	switch (period) {
		case '5 months':
			return months(5);
		case '9 months':
			return months(9);
		case '12 months':
			return months(12);
		default:
			throw new Error(`Unknown period: '${period}'`);
	}
};

const parseVestingTable = (
	vestingTable: Array<{ address: string; amount: number; period: string }>
) => {
	const addresses: string[] = [];
	const entries: Array<{ amount: BigNumberish; startDate: BigNumberish; endDate: BigNumberish }> =
		[];

	for (const entry of vestingTable) {
		if (!entry.address || !ethers.utils.isAddress(entry.address))
			throw new Error(`Invalid address for entry ${JSON.stringify(entry)}`);
		if (!entry.amount || entry.amount <= 0)
			throw new Error(`Invalid amount for entry ${JSON.stringify(entry)}`);

		const startDate = toTimestamp(start);
		const endDate = toTimestamp(getEndDate(entry.period));

		addresses.push(entry.address);
		entries.push({
			amount: parseEther(entry.amount.toString()),
			startDate,
			endDate,
		});
	}

	return { addresses, entries };
};

const deploy = async () => {
	const { addresses: privateAddresses, entries: privateEntries } =
		parseVestingTable(vestingTablePrivate);
	const { addresses: tsAddresses, entries: tsEntries } = parseVestingTable(vestingTableTS);

	console.log('Attaching token...');
	const TokenFactory = (await ethers.getContractFactory('Token')) as Token__factory;
	// const token = TokenFactory.attach('0x9D2aa0CFE9489D1fE32a60791ea502A4FfD1E8Fd') as Token;
	const token = TokenFactory.attach('0x1117ac6ad6cdf1a3bc543bad3b133724620522d5');
	console.log(`Token Proxy at: ${token.address}`);

	console.log('Deploying vesting contract...');
	const VestingFactory = (await ethers.getContractFactory('Vesting')) as Vesting__factory;
	// const vesting = await VestingFactory.deploy(token.address, formatBytes32String('Investors'));
	// await vesting.deployed();
	const vesting = VestingFactory.attach('0x7A6fD47c52b01245335AA3f4cdd6B5AFC2A1916c');
	console.log(`Vesting deployed to: ${vesting.address}`);

	// let transaction = await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address);
	// let transaction = await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address, { nonce: 100002, gasPrice });
	// console.log(`Granting vesting contract permission on Token in transaction: ${transaction.hash}`);
	// await transaction.wait();
	// console.log('Mined.');

	// let transaction = await vesting.addToSchedule(privateAddresses, privateEntries);
	// console.log(`Adding private vesting entries in transaction: ${transaction.hash}...`);
	// console.log(`Gas limit ${transaction.gasLimit}`);
	// await transaction.wait();
	// console.log('Mined.');

	const addressChunks = chunk(tsAddresses, pageSize);
	const entryChunks = chunk(tsEntries, pageSize);
	console.log('TokenSoft pages: ', addressChunks.length);

	for (let i = 4; i < addressChunks.length; i++) {
		console.log(`Sending TokenSoft page ${i + 1}`);
		const transaction = await vesting.addToSchedule(addressChunks[i], entryChunks[i]);
		console.log(`Adding TokenSoft vesting entries in transaction: ${transaction.hash}...`);
		console.log(`Gas limit ${transaction.gasLimit}`);
		await transaction.wait();
		console.log('Mined.');
	}

	console.log('Done!');
	// console.log(`Verify Vesting with:`);
	// console.log(
	// 	`yarn verify ${vesting.address} ${token.address} ${formatBytes32String('Investors')}`
	// );
};

deploy();
