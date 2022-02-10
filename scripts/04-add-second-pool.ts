import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { add, blockNow, toTimestamp } from '../test/utils';
import {
	Token__factory,
	ModaCorePool__factory,
	ModaPoolFactory__factory,
	MintableTestToken__factory,
} from '../typechain-types';

const deploy = async () => {
	console.log('Attaching token...');
	const TokenFactory = (await ethers.getContractFactory('Token')) as Token__factory;
	const token = TokenFactory.attach('0x9D2aa0CFE9489D1fE32a60791ea502A4FfD1E8Fd');
	// const token = TokenFactory.attach('0x1117ac6ad6cdf1a3bc543bad3b133724620522d5');
	console.log(`Token Proxy at: ${token.address}`);

	const start = add(await blockNow(), { hours: 1 });

	console.log('Attaching factory...');
	const FactoryFactory = (await ethers.getContractFactory(
		'ModaPoolFactory'
	)) as ModaPoolFactory__factory;
	const factory = FactoryFactory.attach('0xE69Bc3312EF8213d65FE54Fea8F138F99F14aaE1');
	// const factory = FactoryFactory.attach('0x1117ac6ad6cdf1a3bc543bad3b133724620522d5');
	console.log(`Factory at: ${token.address}`);

	const CorePoolFactory = (await ethers.getContractFactory(
		'ModaCorePool'
	)) as ModaCorePool__factory;
	const corePool = CorePoolFactory.attach('0x10CF6c372849870B06411485127Ca552c1fa2897');

	const MintableTestTokenFactory = (await ethers.getContractFactory(
		'MintableTestToken'
	)) as MintableTestToken__factory;
	console.log('Deploying test token');
	const testToken = await MintableTestTokenFactory.deploy();
	await testToken.deployed();
	console.log(`Test token: ${testToken.address}`);

	console.log('Minting 1,000,000 test tokens');
	await testToken.mint(await testToken.signer.getAddress(), parseEther('1000000'));

	console.log('Deploying lpTokenPool...');
	const lpTokenPool = await CorePoolFactory.deploy(
		token.address,
		factory.address,
		corePool.address,
		testToken.address,
		200,
		toTimestamp(start)
	);
	await lpTokenPool.deployed();
	console.log(`Deployed at ${lpTokenPool.address}`);

	const register = await factory.registerPool(lpTokenPool.address);
	console.log(`Registering pool in transaction ${register.hash}`);
	await register.wait();
	console.log(`Registered`);

	console.log(`Verify Mintable Test Token with:`);
	console.log(`yarn verify ${testToken.address}`);

	console.log(`Verify LP Pool with:`);
	console.log(
		`yarn verify ${lpTokenPool.address} ${token.address} ${factory.address} ${corePool.address} ${
			testToken.address
		} 200 ${toTimestamp(start)}`
	);
};

deploy();
