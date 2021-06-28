// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IVestingToken.sol";

struct VestingSchedule {
    uint256 amount;
    uint256 releaseDate;
    bool released;
}

contract Vesting is Ownable {
    using SafeMath for uint256;

    IVestingToken immutable public token;
    mapping(address => VestingSchedule[]) public schedule;
    bool public vestingSealed;

    constructor(address tokenContract) {
        require(tokenContract != address(0), "Vesting: invalid token address");

        token = IVestingToken(tokenContract);
    }

    function addToSchedule(address to, VestingSchedule[] memory newEntries) external onlyOwner {
        require(vestingSealed == false, "Vesting: sealed");
        require(to != address(0), "Vesting: to address must not be 0");
        require(newEntries.length > 0, "Vesting: no entries");

        for (uint i = 0; i < newEntries.length; i++) {
            schedule[to].push(newEntries[i]);
        }
        
        emit ScheduleChanged(to, schedule[to]);
    }

    event ScheduleChanged(address to, VestingSchedule[] newSchedule);

    function seal() external onlyOwner {
        vestingSealed = true;
        emit VestingSealed();
    }

    event VestingSealed();

    function withdrawalAmount(address to) public view returns (uint256) {
        if (!vestingSealed) return 0;

        uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.

        VestingSchedule[] memory entries = schedule[to];
        for (uint i = 0; i < entries.length; i++) {
            VestingSchedule memory entry = entries[i];
            if (entry.releaseDate <= block.timestamp && entry.released == false) {
                total = total.add(entry.amount);
            }
        }

        return total;
    }

    function withdraw() public {
        require(vestingSealed, "Vesting: not sealed");

        uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.

        // We're not using the withdrawalAmount function here because we need to mark them as withdrawn as we
        // iterate the loop to avoid a second iteration.
        VestingSchedule[] memory entries = schedule[msg.sender];
        for (uint i = 0; i < entries.length; i++) {
            VestingSchedule memory entry = entries[i];
            if (entry.releaseDate <= block.timestamp && entry.released == false) {
                schedule[msg.sender][i].released = true;
                total = total.add(entry.amount);
            }
        }

        require(total > 0, "Vesting: no amount to withdraw");

        token.vestingMint(msg.sender, total);

        emit Vested(msg.sender, total);
    }

    event Vested(address indexed who, uint256 amount);
}