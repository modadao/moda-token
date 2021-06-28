// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IVestingToken.sol";

struct VestingSchedule {
    address to;
    uint256 amount;
    uint256 releaseDate;
    bool released;
}

contract Vesting {
    using SafeMath for uint256;

    IVestingToken immutable private _token; // Token
    VestingSchedule[] private _schedule; // Vesting Schedule
    
    constructor(address token, VestingSchedule[] memory schedule) {
        require(token != address(0), "Vesting: invalid token address");
        uint256 length = schedule.length;
        require(length > 0, "Vesting: invalid schedule");

        _token = IVestingToken(token);
        
        for (uint i = 0; i < length; i++) {
            _schedule.push(schedule[i]);
        }
    }

    function withdrawalAmount(address to) public view returns (uint256) {
        uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.
        uint256 length = schedule.length;
        for (uint i = 0; i < length; i++) {
            if (_schedule[i].to == to && _schedule[i].releaseDate <= block.timestamp && _schedule[i].released == false) {
                total = total.add(_schedule[i].amount);
            }
        }

        return total;
    }

    function withdraw() public {
        uint256 total; // Note: Not explicitly initialising to zero to save gas, default value of uint256 is 0.

        // We're not using the withdrawalAmount function here because we need to mark them as withdrawn as we
        // iterate the loop to avoid a second iteration.
        uint256 length = schedule.length;
        for (uint i = 0; i < length; i++) {
            if (_schedule[i].to == msg.sender && _schedule[i].releaseDate <= block.timestamp && _schedule[i].released == false) {
                _schedule[i].released = true;
                total = total.add(_schedule[i].amount);
            }
        }

        require(total > 0, "Vesting: no amount to withdraw");

        _token.vestingMint(msg.sender, total);

        emit Vested(msg.sender, total);
    }

    event Vested(address indexed who, uint256 amount);
}
