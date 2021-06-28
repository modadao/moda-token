// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "./IVestingToken.sol";

contract Token is Initializable, OwnableUpgradeable, ERC20Upgradeable, UUPSUpgradeable, IVestingToken {
    using SafeMath for uint;

    address public constant _existingHolders = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _outlierVentures = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _investors = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _foundation = 0xB1C0a6ea0c0E54c4150ffA3e984b057d25d8b28C;
    address public constant _growth = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _advisors = 0x0364eAA7C884cb5495013804275120ab023619A5;
    address public constant _curve = 0x0364eAA7C884cb5495013804275120ab023619A5;

    uint256 public holderCount;
    address public vestingContract;

    /**
     * @dev Our constructor (with UUPS upgrades we need to use initialize(), but this is only
     *      able to be called once because of the initializer modifier.
     */
    function initialize() public initializer {
        __Ownable_init();
        __ERC20_init("moda", "MODA");

        _mintWithCount(_existingHolders, 2000000 * 10 ** 18);
        _mintWithCount(_outlierVentures, 300000 * 10 ** 18);
        _mintWithCount(_investors, 500000 * 10 ** 18);
        _mintWithCount(_foundation, 3500000 * 10 ** 18);
        _mintWithCount(_growth, 1000000 * 10 ** 18);
        _mintWithCount(_advisors, 1200000 * 10 ** 18);
        _mintWithCount(_curve, 1500000 * 10 ** 18);
    }

    /**
     * @dev This function is required by Open Zeppelin's UUPS proxy implementation
     *      and indicates whether a contract upgrade should go ahead or not.
     *
     *      This implementation only allows the contract owner to perform upgrades.
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @dev Internal function to manage the holderCount variable that should be called
     *      BEFORE transfers alter balances.
     */
    function _updateCountOnTransfer(address from, address to, uint256 amount) private {
        if (balanceOf(to) == 0 && amount > 0) {
            holderCount = holderCount.add(1);
        }

        if (balanceOf(from) == amount && amount > 0) {
            holderCount = holderCount.sub(1);
        }
    }

    /**
     * @dev Allows the vesting contract to mint tokens without limit.
     */
    function vestingMint(address to, uint256 amount) external override onlyVesting {
        _updateCountOnTransfer(address(0), to, amount);
        _mint(to, amount);
    }

    /**
     * @dev Allows the owner of the contract to set the vesting contract address
     */
    function setVestingContract(address newVestingContract) external onlyOwner {
        address oldVestingContract = vestingContract;
        vestingContract = newVestingContract;

        emit VestingContractChanged(oldVestingContract, newVestingContract);
    }

    /**
     * @dev A private function that mints while maintaining the holder count variable.
     */
    function _mintWithCount(address to, uint256 amount) private {
        _updateCountOnTransfer(_msgSender(), to, amount);
        _mint(to, amount);
    }

    /**
     * @dev ERC20 transfer function. Overridden to maintain holder count variable.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _updateCountOnTransfer(_msgSender(), recipient, amount);
        return super.transfer(recipient, amount);
    }

    /**
     * @dev ERC20 transferFrom function. Overridden to maintain holder count variable.
     */
    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _updateCountOnTransfer(sender, recipient, amount);
        return super.transferFrom(sender, recipient, amount);
    }

    /**
     * @dev Emitted whenever the owner changes the vesting contract address.
     */
    event VestingContractChanged(address oldVestingContract, address newVestingContract);

    /**
     * @dev Throws if called by any account other than the vesting contract.
     */
    modifier onlyVesting() {
        require(vestingContract == _msgSender(), "Token: caller is not the vesting contract");
        _;
    }
}
