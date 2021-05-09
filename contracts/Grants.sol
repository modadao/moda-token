// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Proposal {
    uint256 amount;
    address owner;
    uint256 expires;
    uint256 balance;
}

contract Grants is Ownable {
    using SafeMath for uint;

    Proposal[] public proposals;

    IERC20 immutable erc20; // Token
    address immutable foundation;

    uint256 private _duration = 30; // In days

    function grantsCount() public view returns (uint256) {
        return proposals.length;
    }

    function duration() public view returns (uint256) {
        return _duration;
    }

    function setDuration(uint256 value) public onlyOwner {
        _duration = value;
    }

    constructor(address _erc20, address _foundation) {
        require(_erc20 != address(0) && _foundation != address(0), "Invalid address");
        erc20 = IERC20(_erc20);
        foundation = _foundation;
    }

    function claim(uint256 index) public {
        require(msg.sender == proposals[index].owner, "Must be owner");
        require(inFundingPeriod(index) == false, "In funding period");
        address owner = proposals[index].owner;
        address rewards = address(this);
        erc20.transferFrom(rewards, owner, proposals[index].balance);
        proposals[index].balance = 0;
    }

    function fund(uint256 index, uint256 amount) external {
        require(inFundingPeriod(index), "Not in funding period");
        require(proposals.length < index, "Invalid index");
        require(proposals[index].owner != address(0), "Invalid address");
        erc20.transferFrom(msg.sender, proposals[index].owner, amount);
    }

    function inFundingPeriod(uint256 index) public view returns (bool) {
        return proposals[index].expires > block.timestamp;
    }

    function addProposal(uint256 amount) public returns(uint256) {
        // Only token holders can apply
        require(erc20.balanceOf(msg.sender) >= 1, "Need at least one token");
        Proposal memory proposal = Proposal(amount, msg.sender, block.timestamp + 30 days, 0);
        proposals.push(proposal);

        return proposals.length;
    }

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}