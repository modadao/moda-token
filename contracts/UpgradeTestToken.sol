// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// Note: This contract is only used for testing upgrades to the Token.sol contract
//       and will never be deployed to any actual Ethereum network.

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract UpgradeTestToken is Initializable, OwnableUpgradeable, ERC20Upgradeable, UUPSUpgradeable {
    using SafeMath for uint;

    uint256 public holderCount;
    address public vestingContract;

    address public constant _existing_holders = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _outlier_ventures = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _investors = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _foundation = 0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C;
    address public constant _growth = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _advisors = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _curve = 0x0364eAA7C884cb5495013804275120ab023619A5;

    function initialize() public initializer {
        __Ownable_init();
        __ERC20_init("moda", "MODA");
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

	function newFunction() public pure returns (bool) {
		return true;
	}
}
