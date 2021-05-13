// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ICount.sol";
import "./Members.sol";


struct Proposal {
    string issue;
    address owner;
    uint256 expires;
    uint256 accept;
    uint256 reject;
    uint min;
    uint max;
}

contract Governance is ICount, Ownable {
    using SafeMath for uint;

    mapping (uint256 => mapping(address => bool)) public votes;
    Proposal[] public proposals;

    IERC20 immutable private erc20; // MODA DAO Token
    address immutable private _foundation;
    Members immutable private _members;

    function Count() public override view returns (uint256) {
        return proposals.length;
    }

    constructor(address token, address foundation, address members) {
        require(token != address(0) && foundation != address(0), "Invalid address");
        erc20 = IERC20(token);
        _foundation = foundation;
        _members = Members(members);
    }

    // function grant(address who, uint256 tokens) public onlyOwner() {
    //     require(who != address(0), "Invalid address");
    //     // _balances[who] = _balances[who].add(tokens);
    // }

    // function revoke(address who, uint256 tokens) public onlyOwner() {
    //     require(who != address(0), "Invalid address");
    //     // _balances[who] = _balances[who].sub(tokens);
    // }

    // function claim(uint256 index) public {
    //     require(msg.sender == proposals[index].owner, "Must be owner");
    //     // require(inFundingPeriod(index) == false, "In funding period");
    //     address owner = proposals[index].owner;
    //     address rewards = address(this);
    //     erc20.transferFrom(rewards, owner, proposals[index].balance);
    //     proposals[index].balance = 0;
    // }

    function inVotingPeriod(uint index) public view returns (bool) {
        return proposals[index].expires > block.timestamp;
    }

    function addProposal(string memory issue) public returns(uint256) {
        require(_members.isMember(msg.sender) == true, "Only members can add proposals");
        require(erc20.balanceOf(msg.sender) >= 1, "Need at least one token");

        erc20.transferFrom(msg.sender, address(this), 1);
        Proposal memory proposal = Proposal(issue, msg.sender, block.timestamp + 48 hours, 0, 0, 1, 1);
        proposals.push(proposal);

        return proposals.length;
    }

    function _vote(uint256 index, bool accept, uint256 amount) private {
        require(proposals[index].owner != msg.sender, "Cannot vote on own proposal");
        require(votes[index][msg.sender] != true, "Cannot vote twice");
        
        require(inVotingPeriod(index), "Proposal closed for voting");
        require(amount >= proposals[index].min && proposals[index].max >= amount, "Amount outside the bounds.");

        votes[index][msg.sender] = true;
        erc20.transferFrom(msg.sender, address(this), amount);

        if (accept) {
            proposals[index].accept = proposals[index].accept.add(amount);
        } else {
            proposals[index].reject = proposals[index].accept.add(amount);
        }
    }

    function acceptProposal(uint256 index) public {
        require(_members.isMember(msg.sender) == true, "Only members can vote");
        require(erc20.balanceOf(msg.sender) >= 1, "Need more tokens");
        _vote(index, true, 1);

        emit Accepted(index, msg.sender);(index, msg.sender);
    }

    function rejectProposal(uint256 index) public {
        require(_members.isMember(msg.sender) == true, "Only members can vote");
        require(erc20.balanceOf(msg.sender) >= 1, "Need more tokens");
        _vote(index, false, 1);

        emit Rejected(index, msg.sender);
    }

    event Accepted(uint256 index, address indexed who);
    event Rejected(uint256 index, address indexed who);
}