import hre from 'hardhat';

const GOERLI_MODA_TOKEN = '0x68D449757Daf7652CD6d443bac23fB7a77Ec39FD';
const MODA_TOKEN = GOERLI_MODA_TOKEN;

const verify = async () => {
	console.log('Verifying token...');

	await hre.run('verify:verify', {
		address: MODA_TOKEN,
		constructorArguments: [],
	});
};

verify()
	.then(() => console.log('done'))
	.catch(console.error);
