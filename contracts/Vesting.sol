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

    address private immutable _token;
    // mapping (address => uint256) private _balances;
    mapping (address => Deposit) private _deposits;
    mapping (address => bool) private _members;
    uint256[] vestingPeriods;

    mapping(address => bool) private _members;
    uint256 private _memeberCount;

    function isMember(address who) public view returns (bool) {
        return _members[who];
    }

    function memberCount() public view returns (uint256) {
        return _memeberCount;
    }

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
    
    constructor(address token, uint256 start) public {
        require(token != address(0), "Invalid address");
        _token = token;

        vestingPeriods.push(start);
        vestingPeriods.push(start + 30 days);
        vestingPeriods.push(start + 60 days);
    }

    function deposit(uint256 amount) public {
        require(amount > 0, "Doesn't make sense");
        IERC20(_token).transferFrom(address(msg.sender), address(this), amount);
        
        uint256 bonus = getCurrentBonus();
        amount = amount.add(bonus);

        _deposits[msg.sender] = Deposit(amount, block.timestamp, block.timestamp + 30 days);
        emit DepositReceived(amount, msg.sender);
    }

    function withdraw(uint256 amount) public {
        require(_deposits[msg.sender].amount >= amount, "Insufficient funds");
        require(inVestingPeriod(msg.sender), "Too early");

        IERC20(_token).allow(address(this), amount);
        IERC20(_token).transferFrom( address(this), address(msg.sender), amount);

        _deposits[msg.sender].amount = _deposits[msg.sender].amount.sub(amount);
    }

    // Vesting
    function inVestingPeriod(address who) public returns (bool) {
        return _deposits[who].release < block.timestamp;
    }

    function accept(address who) public onlyOwner {
        require(who != address(0), "Invalid address");
        require(_members[msg.sender] == false, "Already a member");
        _members[msg.sender] = true;
        _memeberCount = _memeberCount.add(1);
        emit MemberAdded(who);
    }

    function revoke() public onlyOwner {
        require(_members[msg.sender] == true, "Not a member");
        _members[msg.sender] = false;
        _memeberCount = _memeberCount.sub(1);
        emit MemberRevoked(who);
    }

    event DepositReceived(uint256 amount, address indexed who);
    event MemberAdded(address indexed who);
    event MemberRevoked(address indexed who);
}