// // SPDX-License-Identifier: MIT
// pragma solidity ^0.7.6;

// import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/math/SafeMath.sol";

// struct Proposal {
//     string issue;
//     address who;
//     uint256 expires;
//     uint256 accept;
//     uint256 reject;
//     uint min;
//     uint max;
// }

// contract Proposals is Ownable {
//     using SafeMath for uint;

//     mapping (uint256 => mapping(address => bool)) public votes;
//     Proposal[] public proposals;

//     address immutable erc20;

//     constructor() public {
//         erc20 = "0x310cb53178181b3381805D196F9ceF52be31927b";
//     }

//     function grant(address who, uint256 tokens) public onlyOwner() {
//         _balances[who] = _balances[who].add(tokens);
//     }

//     function revoke(address who, uint256 tokens) public onlyOwner() {
//         _balances[who] = _balances[who].sub(tokens);
//     }

//     function inVotingPeriod(uint index) public view returns (bool) {
//         return proposals[index].expires > now;
//     }

//     function addProposal(string memory issue) public returns(uint256) {

//         // if sender == member

//         require(balanceOf(msg.sender) >= 1, "Need at least one token");

//         _balances[msg.sender] = _balances[msg.sender].sub(1);
//         Proposal memory proposal = Proposal(issue, msg.sender, now + 48 hours, 0, 0, 1, 1);
//         proposals.push(proposal);

//         return proposals.length;
//     }

//     function _vote(uint256 index, bool accept, uint256 amount) private {
//         require(proposals[index].who != msg.sender, "Cannot vote on own proposal");
//         require(votes[index][msg.sender] != true, "Cannot vote twice");
//         require(balanceOf(msg.sender) >= amount, "Need more tokens");
//         require(inVotingPeriod(index), "Proposal closed for voting");
//         require(amount >= proposals[index].min && proposals[index].max >= amount, "Amount outside the bounds.");

//         votes[index][msg.sender] = true;
//         _balances[msg.sender] = _balances[msg.sender].sub(amount);

//         if (accept) {
//             proposals[index].accept = proposals[index].accept.add(amount);
//         } else {
//             proposals[index].reject = proposals[index].accept.add(amount);
//         }
        
//         emit Vote(index);
//         emit Transfer(msg.sender, address(0), amount);
//     }

//     function accept(uint256 index, uint256 amount) public {
//         _vote(index, true, amount);
//     }

//     function reject(uint256 index, uint256 amount) public {
//         _vote(index, false, amount);
//     }

//     event Vote(uint256 index);
//     event Transfer(address indexed from, address indexed to, uint256 value);
//     event Approval(address indexed owner, address indexed spender, uint256 value);
// }