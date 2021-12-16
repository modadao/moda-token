import { formatBytes32String } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ROLE_TOKEN_CREATOR } from '../test/utils';
import { Token__factory, Vesting__factory } from '../typechain';

const deploy = async () => {
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

	console.log(
		`yarn verify ${vesting.address} ${token.address} ${formatBytes32String('Investors')}`
	);

	console.log(ROLE_TOKEN_CREATOR);
};

deploy();
