import { ethers } from 'hardhat';
import { MODAVestingWallet__factory } from '../typechain-types';
import dotenv from 'dotenv';

dotenv.config();

const BENEFICIARY__MODA_GNOSIS_MULTI_SIG = '0xb4f88f4347eE46B6a52CB63D267391C6422d21Da';
const START_TIMESTAMP__JAN_1_2022 = 1_640_991_600;
const DURATION_SECONDS__FORTY_EIGHT_MONTHS = 126_100_000;

const deploy = async () => {
	const MODAVstingWalletFactory = (await ethers.getContractFactory('MODAVestingWallet')) as MODAVestingWallet__factory;

	try {
		const wallet = await MODAVstingWalletFactory.deploy(
			BENEFICIARY__MODA_GNOSIS_MULTI_SIG,
			START_TIMESTAMP__JAN_1_2022,
			DURATION_SECONDS__FORTY_EIGHT_MONTHS
		);

		console.log(`MODAVestingWallet Address: ${wallet.address}`);
	} catch (e) {
		console.error('BOOM!!! ', e);
	}
};

deploy();
