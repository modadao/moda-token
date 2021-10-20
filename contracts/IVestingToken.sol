// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
 * @dev Interface for a token that will allow unlimited mints from a vesting contract
 */
interface IVestingToken {
	function vestingMint(address to, uint256 amount) external;
}