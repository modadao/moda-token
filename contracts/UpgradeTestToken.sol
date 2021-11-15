// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// Note: This contract is only used for testing upgrades to the Token.sol contract
//       and will never be deployed to any actual Ethereum network.

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import './IMintableToken.sol';

contract UpgradeTestToken is
	Initializable,
	OwnableUpgradeable,
	ERC20Upgradeable,
	UUPSUpgradeable,
	IMintableToken
{
	uint256 public holderCount;
	address public vestingContract;

	function initialize() public initializer {
		__Ownable_init();
		__ERC20_init('moda', 'MODA');
	}

	function _authorizeUpgrade(address) internal view override onlyOwner {}

	function mint(
		address, /*to*/
		uint256 /*amount*/
	) external override {}

	function newFunction() public pure returns (bool) {
		return true;
	}
}
