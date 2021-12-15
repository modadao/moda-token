const { parseEther } = require('@ethersproject/units');
const { ethers, upgrades } = require('hardhat');

const toBytes32 = (hexString) => `0x${hexString.padEnd(64, '0')}`;
const ROLE_TOKEN_CREATOR = toBytes32('000b');

const ADDRESS0 = '0x0000000000000000000000000000000000000000';

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

	console.log('Deploying ModaCorePool...');
	const latestBlock = await ethers.provider.getBlock("latest");
	const nextTimestamp = latestBlock.timestamp + 1;
	console.log('nextTimestamp='+ nextTimestamp);
	const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
	const corePool = await corePoolFactory.deploy(
		token.address, // moda MODA ERC20 Token ModaERC20 address
		ADDRESS0, // This is a modaPool, so set to zero.
		token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
		100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
		parseEther('150000'), // modaPerSeconds initial MODA/block value for rewards
		10, // secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
		nextTimestamp, // initTimestamp initial block timestamp used to calculate the rewards
		nextTimestamp + 120 // endTimestamp block timestamp when farming stops and rewards cannot be updated anymore
	);
	await corePool.deployed();
	console.log(`Moda Core Pool deployed to: ${corePool.address}`);

	console.log('Granting moda core pool contract permission on Token');
	const modacoreTransaction = await token.grantRole(ROLE_TOKEN_CREATOR, corePool.address);
	console.log(`Granted in moda core pool transaction: ${modacoreTransaction.hash}`);

	console.log('Deploying vesting contract...');
	const VestingFactory = await ethers.getContractFactory('Vesting');
	const vesting = await VestingFactory.deploy(token.address);
	await vesting.deployed();
	console.log(`Vesting deployed to: ${vesting.address}`);

	console.log('Granting vesting contract permission on Token');
	const vestingTransaction = await token.grantRole(ROLE_TOKEN_CREATOR, vesting.address);
	console.log(`Granted in vesting transaction: ${vestingTransaction.hash}`);

	console.log('Done!');
};

deploy();
