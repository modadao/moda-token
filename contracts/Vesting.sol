// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IMintableToken.sol";

struct VestingSchedule {
	uint256 amount;
	uint256 releaseDate;
	bool released;
}

contract Vesting is Ownable {
	IMintableToken public immutable token; // Token
	mapping(address => VestingSchedule[]) public schedule; // Vesting Schedule
	bool public vestingSealed;

	constructor(address tokenContract) {
		require(tokenContract != address(0), 'Vesting: invalid token address');

		token = IMintableToken(tokenContract);
	}

	function addToSchedule(address to, VestingSchedule[] memory newEntries) external onlyOwner {
		require(vestingSealed == false, 'Vesting: sealed');
		require(to != address(0), 'Vesting: to address must not be 0');
		require(newEntries.length > 0, 'Vesting: no entries');

		for (uint256 i = 0; i < newEntries.length; i++) {
			schedule[to].push(newEntries[i]);
		}

		emit ScheduleChanged(to, schedule[to]);
	}

	event ScheduleChanged(address indexed to, VestingSchedule[] newSchedule);

	function seal() external onlyOwner {
		vestingSealed = true;
		emit VestingSealed();
	}

	event VestingSealed();

	function withdrawalAmount(address to) public view returns (uint256) {
		if (!vestingSealed) return 0;

		uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.

		VestingSchedule[] memory entries = schedule[to];
		uint256 length = entries.length;
		for (uint256 i = 0; i < length; i++) {
			VestingSchedule memory entry = entries[i];

			if (entry.releaseDate <= block.timestamp && entry.released == false) {
				total += entry.amount;
			}
		}

		return total;
	}

	function withdraw() public {
		require(vestingSealed, 'Vesting: not sealed');

		uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.

        // We're not using the withdrawalAmount function here because we need to mark them as withdrawn as we
        // iterate the loop to avoid a second iteration.
        VestingSchedule[] memory entries = schedule[msg.sender];
        uint256 length = entries.length; // Gas optimisation
        for (uint i = 0; i < length; i++) {
            VestingSchedule memory entry = entries[i];
            if (entry.releaseDate <= block.timestamp && entry.released == false) {
                schedule[msg.sender][i].released = true;
                total += entry.amount;
            }
        }

		require(total > 0, 'Vesting: no amount to withdraw');

		token.mint(msg.sender, total);

		emit Vested(msg.sender, total);
	}

	event Vested(address indexed who, uint256 amount);
}
