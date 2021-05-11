// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Deposit {
    uint256 amount;
    uint256 date;
    uint256 release;
}

contract Vesting is Ownable {

    using SafeMath for uint256;

    IERC20 immutable private erc20; // Token
    mapping (address => Deposit) private _deposits;
    uint256[] vestingPeriods;

    function getCurrentBonus() public view returns (uint256) {
        if (block.timestamp < vestingPeriods[2] && block.timestamp > vestingPeriods[1]) {
            return 10;
        }

        if (block.timestamp < vestingPeriods[1] && block.timestamp > vestingPeriods[0]) {
            return 20;
        }

        if (block.timestamp < vestingPeriods[0]) {
            return 30;
        }

        return 0;
    }
    
    constructor(address token, uint256 start) {
        require(token != address(0), "Invalid address");
        erc20 = IERC20(token);

        vestingPeriods.push(start);
        vestingPeriods.push(start + 30 days);
        vestingPeriods.push(start + 60 days);
    }

    function deposit(uint256 amount) public {
        require(amount > 0, "Doesn't make sense");
        erc20.transferFrom(address(msg.sender), address(this), amount);
        
        uint256 bonus = getCurrentBonus();
        amount = amount.add(bonus);

        _deposits[msg.sender] = Deposit(amount, block.timestamp, block.timestamp + 30 days);
        emit DepositReceived(amount, msg.sender);
    }

    function withdraw(uint256 amount) public {
        require(_deposits[msg.sender].amount >= amount, "Insufficient funds");
        require(inVestingPeriod(msg.sender), "Too early");

        erc20.transferFrom( address(this), address(msg.sender), amount);
        _deposits[msg.sender].amount = _deposits[msg.sender].amount.sub(amount);
    }

    // Vesting
    function inVestingPeriod(address who) public view returns (bool) {
        return _deposits[who].release < block.timestamp;
    }

    event DepositReceived(uint256 amount, address indexed who);
}