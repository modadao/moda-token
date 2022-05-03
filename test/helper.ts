import { ethers } from 'hardhat';

export const advanceTime = async (time: any) => {
	return await ethers.provider.send('evm_increaseTime', [time]);
};

export const advanceBlock = async () => {
	return await ethers.provider.send('evm_mine', []);
};

export const takeSnapshot = async () => {
	return await ethers.provider.send('evm_snapshot', []);
};

export const revertSnapshot = async (id: number) => {
	return await ethers.provider.send('evm_revert', [id]);
};

export const advanceTimeAndBlock = async (time: any) => {
	await advanceTime(time);
	await advanceBlock();
	return Promise.resolve(ethers.provider.getBlock('latest'));
};
