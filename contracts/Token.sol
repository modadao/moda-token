// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract Token is Initializable, OwnableUpgradeable, ERC20Upgradeable, UUPSUpgradeable {
    using SafeMath for uint;

    uint256 public holderCount;
    uint256 public startBlock;

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

        _mintWithCount(_existing_holders, 2000000 * 10 ** 18);
        _mintWithCount(_outlier_ventures, 300000 * 10 ** 18);
        _mintWithCount(_investors, 500000 * 10 ** 18);
        _mintWithCount(_foundation, 3500000 * 10 ** 18);
        _mintWithCount(_growth, 1000000 * 10 ** 18);
        _mintWithCount(_advisors, 1200000 * 10 ** 18);
        _mintWithCount(_curve, 1500000 * 10 ** 18);

        startBlock = block.number;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _updateCountOnTransfer(address from, address to, uint256 amount) private {
        if (balanceOf(to) == 0 && amount > 0) {
            holderCount = holderCount.add(1);
        }

        if (balanceOf(from) == amount && amount > 0) {
            holderCount = holderCount.sub(1);
        }
    }

    function _mintWithCount(address to, uint256 amount) private {
        _updateCountOnTransfer(_msgSender(), to, amount);
        _mint(to, amount);
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _updateCountOnTransfer(_msgSender(), recipient, amount);
        return super.transfer(recipient, amount);
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _updateCountOnTransfer(sender, recipient, amount);
        return super.transferFrom(sender, recipient, amount);
    }
}
