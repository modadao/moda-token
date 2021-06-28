// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ICount.sol";

contract Members is Ownable, ICount {

    using SafeMath for uint256;

    IERC20 immutable private erc20;

    mapping(address => bool) private _members;
    uint256 private _memberCount;

    function isMember(address who) external view returns (bool) {
        return _members[who];
    }

    function Count() external override view returns (uint256) {
        return _memberCount;
    }

    constructor(address token) {
        require(token != address(0), "Invalid address");
        erc20 = IERC20(token);
    }

    function accept() public {
        require(_members[msg.sender] == false, "Already a member");
        require(erc20.balanceOf(msg.sender) > 1, "Must hold MODA DAO tokens");
        _members[msg.sender] = true;
        _memberCount = _memberCount.add(1);
        emit MemberAdded(msg.sender);
    }

    function revoke(address who) public onlyOwner {
        require(_members[who] == true, "Not a member");
        _members[who] = false;
        _memberCount = _memberCount.sub(1);
        emit MemberRevoked(who);
    }

    event MemberAdded(address indexed who);
    event MemberRevoked(address indexed who);
}