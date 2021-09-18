// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// Note: This contract is only used for testing upgrades to the Token.sol contract
//       and will never be deployed to any actual Ethereum network.

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import './IVestingToken.sol';

contract UpgradeTestToken is
	Initializable,
	OwnableUpgradeable,
	ERC20Upgradeable,
	UUPSUpgradeable,
	IVestingToken,
	AccessControlUpgradeable
{
	uint256 public holderCount;
	address public vestingContract;

	/**
	 * @notice Token creator is responsible for creating (minting)
	 *      tokens to an arbitrary address
	 * @dev Role ROLE_TOKEN_CREATOR allows minting tokens
	 *      (calling `mint` function)
	 */
	bytes32 public constant ROLE_TOKEN_CREATOR = '\x00\x01\x00\x00';

	/**
	 * @dev Smart contract unique identifier, a random number
	 * @dev Should be regenerated each time smart contact source code is changed
	 *      and changes smart contract itself is to be redeployed
	 * @dev Generated using https://www.random.org/bytes/
	 */
	uint256 public constant TOKEN_UID =
		0xc8de2a18ae1c61538a5f880f5c8eb7ff85aa3996c4363a27b1c6112a190e65b4;

	address public constant _existing_holders = 0x0364eAA7C884cb5495013804275120ab023619A5;
	address public constant _outlier_ventures = 0x0364eAA7C884cb5495013804275120ab023619A5;
	address public constant _investors = 0x0364eAA7C884cb5495013804275120ab023619A5;
	address public constant _foundation = 0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C;
	address public constant _growth = 0x0364eAA7C884cb5495013804275120ab023619A5;
	address public constant _advisors = 0x0364eAA7C884cb5495013804275120ab023619A5;
	address public constant _curve = 0x0364eAA7C884cb5495013804275120ab023619A5;

	function initialize() public initializer {
		__Ownable_init();
		__ERC20_init('moda', 'MODA');
		__AccessControl_init();
		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
		_setRoleAdmin(ROLE_TOKEN_CREATOR, 0x0);
	}

	function _authorizeUpgrade(address) internal view override onlyOwner {}

	function vestingMint(
		address, /*to*/
		uint256 /*amount*/
	) external override {}

	function newFunction() public pure returns (bool) {
		return true;
	}
}
