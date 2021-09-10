// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './ICount.sol';
import './Members.sol';

struct Proposal {
	string issue;
	address owner;
	uint256 expires;
	uint256 accept;
	uint256 reject;
	uint256 min;
	uint256 max;
}

contract Governance is ICount, Ownable {
	using SafeMath for uint256;

	mapping(uint256 => mapping(address => bool)) public votes;
	Proposal[] public proposals;

	IERC20 private immutable erc20; // MODA DAO Token
	address private immutable _foundation;
	Members private immutable _members;

	function Count() public view override returns (uint256) {
		return proposals.length;
	}

	constructor(
		address token,
		address foundation,
		address members
	) {
		require(token != address(0), 'Invalid token address');
		require(foundation != address(0), 'Invalid foundation address');
		require(token != foundation, 'Addresses for token and foundation cannot be the same');

		erc20 = IERC20(token);
		_foundation = foundation;
		_members = Members(members);
	}

	function inVotingPeriod(uint256 index) public view returns (bool) {
		return proposals[index].expires > block.timestamp;
	}

	function addProposal(string memory issue) public returns (uint256) {
		require(_members.isMember(msg.sender) == true, 'Only members can add proposals');
		require(erc20.balanceOf(msg.sender) >= 1, 'Need at least one token');

		erc20.transferFrom(msg.sender, address(this), 1);
		Proposal memory proposal = Proposal(
			issue,
			msg.sender,
			block.timestamp + 48 hours,
			0,
			0,
			1,
			1
		);
		proposals.push(proposal);

		return proposals.length;
	}

	function _vote(
		uint256 index,
		bool accept,
		uint256 amount
	) private {
		require(proposals[index].owner != msg.sender, 'Cannot vote on own proposal');
		require(votes[index][msg.sender] != true, 'Cannot vote twice');

		require(inVotingPeriod(index), 'Proposal closed for voting');
		require(
			amount >= proposals[index].min && proposals[index].max >= amount,
			'Amount outside the bounds.'
		);

		votes[index][msg.sender] = true;
		erc20.transferFrom(msg.sender, address(this), amount);

		if (accept) {
			proposals[index].accept = proposals[index].accept.add(amount);
		} else {
			proposals[index].reject = proposals[index].accept.add(amount);
		}
	}

	function acceptProposal(uint256 index) public {
		require(_members.isMember(msg.sender) == true, 'Only members can vote');
		require(erc20.balanceOf(msg.sender) >= 1, 'Need more tokens');
		_vote(index, true, 1);

		emit Accepted(index, msg.sender);
	}

	function rejectProposal(uint256 index) public {
		require(_members.isMember(msg.sender) == true, 'Only members can vote');
		require(erc20.balanceOf(msg.sender) >= 1, 'Need more tokens');
		_vote(index, false, 1);

		emit Rejected(index, msg.sender);
	}

	event Accepted(uint256 index, address indexed who);
	event Rejected(uint256 index, address indexed who);
}
