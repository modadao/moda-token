// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './ILinkedToMODA.sol';
import './Token.sol';

/**
 * @title Moda Aware
 *
 * @notice Helper smart contract to be inherited by other smart contracts requiring to
 *      be linked to verified ModaERC20 instance and performing some basic tasks on it
 *
 * @author Basil Gorin
 */
abstract contract ModaAware is ILinkedToMODA {
	/// @dev Link to MODA ERC20 Token ModaERC20 instance
	address public immutable override moda;

	/**
	 * @dev Creates ModaAware instance, requiring to supply deployed ModaERC20 instance address
	 *
	 * @param _moda deployed ModaERC20 instance address
	 */
	constructor(address _moda) {
		// verify MODA address is set and is correct
		require(_moda != address(0), 'MODA address not set');
		require(
			Token(_moda).TOKEN_UID() ==
				0xc8de2a18ae1c61538a5f880f5c8eb7ff85aa3996c4363a27b1c6112a190e65b4,
			'unexpected TOKEN_UID'
		);

		// write MODA address
		moda = _moda;
	}

	/**
	 * @dev Executes ModaERC20.safeTransferFrom(address(this), _to, _value, "")
	 *      on the bound ModaERC20 instance
	 *
	 * @dev Reentrancy safe due to the ModaERC20 design
	 */
	function transferIlv(address _to, uint256 _value) internal {
		// just delegate call to the target
		transferModaFrom(address(this), _to, _value);
	}

	/**
	 * @dev Executes ModaERC20.transferFrom(_from, _to, _value)
	 *      on the bound ModaERC20 instance
	 *
	 * @dev Reentrancy safe due to the ModaERC20 design
	 */
	function transferModaFrom(
		address _from,
		address _to,
		uint256 _value
	) internal {
		// just delegate call to the target
		Token(moda).transferFrom(_from, _to, _value);
	}

	/**
	 * @dev Executes ModaERC20.mint(_to, _values)
	 *      on the bound ModaERC20 instance
	 *
	 * @dev Reentrancy safe due to the ModaERC20 design
	 */
	function mintModa(address _to, uint256 _value) internal {
		// just delegate call to the target
		Token(moda)._mint(_to, _value);
	}
}
