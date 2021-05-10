// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Deposit {
    uint256 amount;
    uint256 date;
}

contract Vesting is Ownable {

    using SafeMath for uint256;

    address private immutable _token;
    mapping (address => uint256) private _balances;
    mapping (address => Deposit) private _deposits;

    constructor(address token) public {
        require(token != address(0), "Invalid address");
        _token = token;
    }

    function deposit(uint256 amount) public {
        require(amount > 0, "Doesn't make sense");
        IERC20(_token).transferFrom(address(msg.sender), address(this), amount);
        // _balances[msg.sender] = _balances[msg.sender].add(amount);

        _deposits[msg.sender] = Deposit(amount, block.timestamp);

        emit DepositReceived(amount, msg.sender);
    }

    event DepositReceived(uint256 amount, address indexed who);
}