const { parseEther } = require('@ethersproject/units');
const { ethers, upgrades } = require('hardhat');

const toBytes32 = (hexString) => `0x${hexString.padEnd(64, '0')}`;
const ROLE_TOKEN_CREATOR = toBytes32('000b');

const deploy = async () => {
	console.log('Deploying token...');
	const TokenFactory = await ethers.getContractFactory('Token');
	const token = await upgrades.deployProxy(
		TokenFactory,
		[
			[
				// Recipients

				// Community Sales
				'0x3cd7a63Bf8c18f3180be616cDF049C0f0975e4c2',

				// Liquidity
				'0x5a6C74F940F826854372a7C309B3f832D2a171F6',

				// Community / KOL
				'0xF7457779633d5F3b78041Acb4da82c2dB4B806eF',
			],
			[
				// Amounts
				// Community Sales
				parseEther('100000'),

				// Liquidity
				parseEther('111111'),

				// Community / KOL
				parseEther('83333'),
			],
		],
		{ kind: 'uups' }
	);
	await token.deployed();

	console.log(`Token Proxy deployed to: ${token.address}`);

	console.log('Deploying vesting contract...');
	const VestingFactory = await ethers.getContractFactory('Vesting');
	const vesting = await VestingFactory.deploy(token.address);
	await vesting.deployed();
	console.log(`Vesting deployed to: ${vesting.address}`);

	console.log('Granting vesting contract permission on Token');
	const transaction = await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address);
	console.log(`Granted in transaction: ${transaction.hash}`);

	console.log('Done!');
};

deploy();
