// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import './IMintableToken.sol';

/**
 * @dev This contract is only used on testnets to emulate a liquidity pool token.
 *      It should never be deployed to mainnet, as tokens for pools there will come
 *      from SushiSwap.
 */
contract MintableTestToken is
	ERC20,
	Ownable,
	IMintableToken
{
	constructor()
	 	ERC20("Test Moda/ETH LP Token", "MODAETH")
	{}

	/**
	 * @dev Mints (creates) some tokens to address specified
	 * @dev The value specified is treated as is without taking
	 *      into account what `decimals` value is
	 * @dev Behaves effectively as `mintTo` function, allowing
	 *      to specify an address to mint tokens to
	 * @dev Requires sender to be the owner
	 *
	 * @param _to an address to mint tokens to
	 * @param _value an amount of tokens to mint (create)
	 */
	function mint(address _to, uint256 _value) public override onlyOwner {
		// perform mint with ERC20 transfer event
		_mint(_to, _value);
	}
}
