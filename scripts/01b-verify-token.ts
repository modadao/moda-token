import hre from 'hardhat';
import { MODA_TOKEN_ADDRESS } from './config';

const verify = async () => {
	console.log('Verifying token...');

	await hre.run('verify:verify', {
		address: MODA_TOKEN_ADDRESS,
		constructorArguments: [],
	});
};

verify()
	.then(() => console.log('done'))
	.catch(console.error);
