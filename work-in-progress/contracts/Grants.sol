// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ICount.sol";

struct Proposal {
    uint256 amount;
    address owner;
    uint256 expires;
    uint256 balance;
    bool claimed;
}

contract Grants is Ownable, ICount {
    using SafeMath for uint;

    Proposal[] public proposals;

    IERC20 immutable private erc20; // Token
    address immutable private _foundation;

    uint256 private _duration = 30; // In days

    function Count() public override view returns (uint256) {
        return proposals.length;
    }

    function duration() public view returns (uint256) {
        return _duration;
    }

    function setDuration(uint256 value) public onlyOwner {
        _duration = value;
    }

    constructor(address token, address foundation) {
        require(token != address(0) && foundation != address(0), "Invalid address");
        erc20 = IERC20(token);
        _foundation = foundation;
    }

    // function claim(uint256 index) public {
    //     require(inFundingPeriod(index) == false, "In funding period");
    //     address owner = proposals[index].owner;
    //     address rewards = address(this);
    //     erc20.transferFrom(rewards, owner, proposals[index].balance);
    //     proposals[index].balance = 0;
    // }

    function accept(uint256 index) public onlyFoundation {
        require(hasExpired(index) == false, "Grant application has expired");

        erc20.transferFrom(_foundation, proposals[index].owner, proposals[index].balance);
    }

    // function fund(uint256 index, uint256 amount) external {
    //     require(inFundingPeriod(index), "Not in funding period");
    //     require(proposals.length < index, "Invalid index");
    //     require(proposals[index].owner != address(0), "Invalid address");
    //     erc20.transferFrom(msg.sender, proposals[index].owner, amount);
    // }

    function hasExpired(uint256 index) public view returns (bool) {
        return proposals[index].expires < block.timestamp;
    }

    function addProposal(uint256 amount) public returns(uint256) {
        // Only memebers

        require(erc20.balanceOf(msg.sender) >= 1, "Need at least one token");
        Proposal memory proposal = Proposal(amount, msg.sender, block.timestamp + 30 days, 0, false);
        proposals.push(proposal);

        emit NewProposal(msg.sender, proposals.length.sub(1), amount);

        return proposals.length;
    }

    modifier onlyFoundation() {
        require(msg.sender == _foundation, "Not authorised");
        _;
    }

    event NewProposal(address indexed from, uint256 index, uint256 amount);
}