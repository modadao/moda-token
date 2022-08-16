import { ethers } from 'hardhat';
import { MODAVestingWallet__factory } from '../typechain-types';
import dotenv from 'dotenv';

dotenv.config();

const BENEFICIARY__MODA_GNOSIS_MULTI_SIG = '0x36C177C5e31855310F41eB917cEAAFC61B4cA18E';
const START_TIMESTAMP__DEC_1_2021 = 1_638_316_800;
const DURATION_SECONDS__SIXTY_MONTHS = 157_680_000;

const deploy = async () => {
	const MODAVstingWalletFactory = (await ethers.getContractFactory(
		'MODAVestingWallet'
	)) as MODAVestingWallet__factory;

	try {
		const wallet = await MODAVstingWalletFactory.deploy(
			BENEFICIARY__MODA_GNOSIS_MULTI_SIG,
			START_TIMESTAMP__DEC_1_2021,
			DURATION_SECONDS__SIXTY_MONTHS
		);

		console.log(`MODAVestingWallet Address: ${wallet.address}`);
	} catch (e) {
		console.error('BOOM!!! ', e);
	}
};

deploy();
