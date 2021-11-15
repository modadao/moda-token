// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import './IMintableToken.sol';
import './ModaConstants.sol';

contract UpgradeTestToken is
	Initializable,
	ERC20Upgradeable,
	UUPSUpgradeable,
	AccessControlUpgradeable,
	IMintableToken
{
	uint256 public holderCount;
	address public vestingContract;

	function TOKEN_UID() public pure returns (uint256) {
		return ModaConstants.TOKEN_UID;
	}

	/**
	 * @dev Our constructor (with UUPS upgrades we need to use initialize(), but this is only
	 *      able to be called once because of the initializer modifier.
	 */
	function initialize(address[] memory recipients, uint256[] memory amounts) public initializer {
		require(recipients.length == amounts.length, 'Token: recipients and amounts must match');

		__ERC20_init('moda', 'MODA');

		__AccessControl_init();
		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
		_setupRole(ModaConstants.ROLE_UPGRADER, _msgSender());
		_setupRole(ModaConstants.ROLE_TOKEN_CREATOR, _msgSender());
	}

	/**
	 * @dev This function is required by Open Zeppelin's UUPS proxy implementation
	 *      and indicates whether a contract upgrade should go ahead or not.
	 *
	 *      This implementation only allows the contract owner to perform upgrades.
	 */
	function _authorizeUpgrade(address) internal view override onlyRole(ModaConstants.ROLE_UPGRADER) {}

	/**
	 * @dev Nonfunctional Mint
	 */
	function mint(address _to, uint256 _value) public override {}
	
	/**
	 * @dev This function is a test function to ensure upgrades work.
	 */
	function newFunction() public pure returns (bool) {
		return true;
	}
}
