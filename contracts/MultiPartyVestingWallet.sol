// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract MultiPartyVestingWallet is Ownable {
	IERC20 public immutable moda;

	struct Schedule {
		uint256 amount;
		uint256 startDate;
		uint256 endDate;
		uint256 claimed;
	}

	mapping(address => Schedule[]) public schedules;
	mapping(address => uint256) public claimed;

	event ScheduleCreated(address indexed account, Schedule schedule);
	event FundsClaimed(address indexed account, uint256 amount);

	constructor(address _token) {
		require(_token != address(0), 'Invalid MODA address');
		moda = IERC20(_token);
	}

	function addSchedules(address[] memory accounts, Schedule[] memory _schedules)
		external
		onlyOwner
	{
		require(accounts.length == _schedules.length, 'Length mismatch');

		uint256 length = accounts.length;
		for (uint256 i = 0; i < length; i++) {
			address account = accounts[i];
			Schedule memory schedule = _schedules[i];
			require(address(0) != account, 'Invalid address');
			require(schedule.amount > 0, 'Invalid amount');
			require(schedule.endDate > block.timestamp, 'End date must be in future');
			require(schedule.endDate > schedule.startDate, 'End date must be gt start date');

			schedules[account].push(_schedules[i]);

			emit ScheduleCreated(account, _schedules[i]);
		}
	}

	function scheduleCount(address account) external view returns (uint256) {
		return schedules[account].length;
	}

	function amountVested(address account, uint256 index) public view returns (uint256) {
		Schedule memory schedule = schedules[account][index];
		if (schedule.amount == 0) return 0;

		if (schedule.endDate <= block.timestamp) {
			return schedule.amount - schedule.claimed;
		}

		uint256 totalVestingTime = schedule.endDate - schedule.startDate;

		uint256 vestedTime = block.timestamp - schedule.startDate;
		return ((schedule.amount * vestedTime) / totalVestingTime) - schedule.claimed;
	}

	function claim(uint256 index) external {
		uint256 claimable = amountVested(msg.sender, index);
		require(claimable > 0, 'No amount to withdraw');

		Schedule storage schedule = schedules[msg.sender][index];
		schedule.claimed += claimable;

		moda.transfer(msg.sender, claimable);

		emit FundsClaimed(msg.sender, claimable);
	}
}
