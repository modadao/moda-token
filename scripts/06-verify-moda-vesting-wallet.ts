import dotenv from 'dotenv';

dotenv.config();

const RINKEBY_VESTING_ADDRESS = '0x68D449757Daf7652CD6d443bac23fB7a77Ec39FD';

const BENEFICIARY__MODA_GNOSIS_MULTI_SIG = '0x25c3Ac024Efa6B1596c3625D2E2b6d530ccb4208';
const START_TIMESTAMP__DEC_1_2021 = 1_638_316_800;
const DURATION_SECONDS__SIXTY_MONTHS = 157_680_000;

import hre from 'hardhat';

const verify = async () => {
	await hre.run('verify:verify', {
		address: RINKEBY_VESTING_ADDRESS,
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
