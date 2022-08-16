// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/finance/VestingWallet.sol';

contract MODAVestingWallet is VestingWallet, Ownable {
	constructor(uint64 startTimestamp, uint64 durationSeconds)
		VestingWallet(msg.sender, startTimestamp, durationSeconds)
	{}

	/**
	 * @dev Use ownership so that beneficiary can be transferred
	 */
	function beneficiary() public view override returns (address) {
		return owner();
	}
}
