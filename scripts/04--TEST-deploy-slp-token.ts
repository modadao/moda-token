import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { MintableTestToken__factory } from '../typechain-types';

const deploy = async () => {
        const MintableTestTokenFactory = (await ethers.getContractFactory('MintableTestToken')) as MintableTestToken__factory;

        console.log('Deploying test token');
        const testToken = await MintableTestTokenFactory.deploy();
        await testToken.deployed();
        console.log(`SLP Test token address: ${testToken.address}`);

        console.log('Minting 1,000,000 test tokens');
        await testToken.mint(await testToken.signer.getAddress(), parseEther('1000000'));
        console.log('Minted 1,000,000 test tokens!');
};

deploy();
