import dotenv from 'dotenv';

dotenv.config();

// const RINKEBY_VESTING_ADDRESS = '0x68D449757Daf7652CD6d443bac23fB7a77Ec39FD';
const MAINNET_VESTING_ADDRESS = '0x2e303AbD7853c4177E0CA78d6Dfb0eb7E95ce138';

const BENEFICIARY__MODA_GNOSIS_MULTI_SIG = '0x36C177C5e31855310F41eB917cEAAFC61B4cA18E';
const START_TIMESTAMP__DEC_1_2021 = 1_638_316_800;
const DURATION_SECONDS__SIXTY_MONTHS = 157_680_000;

import hre from 'hardhat';

const verify = async () => {
	await hre.run('verify:verify', {
		address: MAINNET_VESTING_ADDRESS,
		contract: 'contracts/MODAVestingWallet.sol:MODAVestingWallet',
		constructorArguments: [
			BENEFICIARY__MODA_GNOSIS_MULTI_SIG,
			START_TIMESTAMP__DEC_1_2021,
			DURATION_SECONDS__SIXTY_MONTHS,
		],
	});
};

verify()
	.then(() => console.log('complete'))
	.catch(console.error);
