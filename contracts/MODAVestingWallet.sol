// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/finance/VestingWallet.sol';

contract MODAVestingWallet is VestingWallet {
	constructor(
		address beneficiary,
		uint64 startTimestamp,
		uint64 durationSeconds
	) VestingWallet(beneficiary, startTimestamp, durationSeconds) {}
}
