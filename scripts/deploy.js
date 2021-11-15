const { ethers, upgrades } = require('hardhat');

const deploy = async () => {
	const TokenFactory = await ethers.getContractFactory('Token');
	const token = await upgrades.deployProxy(
		TokenFactory,
		[
			[
				// Recipients
			],
			[
				// Amounts
			],
		],
		{ kind: 'uups' }
	);
	await token.deployed();

	console.log(`Proxy deployed to: ${token.address}`);
};

deploy();
