// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import './ModaAware.sol';
import './EscrowedModaERC20.sol';

/**
 * @title Moda Core Pool
 *
 * @notice Core pools represent permanent pools like MODA or MODA/ETH Pair pool,
 *      core pools allow staking for arbitrary periods of time up to 1 year
 *
 * @dev Pulled from the original Factory code to provide the weight calculations.
 */
abstract contract ModaPoolFactory is ModaAware, Ownable {
	/**
	 * @dev MODA/block determines yield farming reward base
	 *      used by the yield pools controlled by the factory
	 */
	uint256 public modaPerSecond;

	/**
	 * @dev The yield is distributed proportionally to pool weights;
	 *      total weight is here to help in determining the proportion
	 */
	uint32 public totalWeight;

	/**
	 * @dev MODA/block decreases by 3% every blocks/update (set to 91252 blocks during deployment);
	 *      an update is triggered by executing `updateMODAPerSecond` public function
	 */
	uint256 public immutable secondsPerUpdate;

	/**
	 * @dev End timestamp is the last timestamp when MODA/block can be decreased;
	 *      it is implied that yield farming stops after that timestamp
	 */
	uint256 public endTimestamp;

	/**
	 * @dev Each time the MODA/block ratio gets updated, the block timestamp
	 *      when the operation has occurred gets recorded into `lastRatioUpdate`
	 * @dev This block timestamp is then used to check if blocks/update `secondsPerUpdate`
	 *      has passed when decreasing yield reward by 3%
	 */
	uint256 public lastRatioUpdate;

	/**
	 * @dev Fired in _changePoolWeight()
	 *
	 * @param _by an address which executed an action
	 * @param poolAddress deployed pool instance address
	 * @param weight new pool weight
	 */
	event WeightUpdated(address indexed _by, address indexed poolAddress, uint32 weight);

	/**
	 * @dev Fired in updateILVPerBlock()
	 *
	 * @param _by an address which executed an action
	 * @param newIlvPerBlock new ILV/block value
	 */
	event ModaRatioUpdated(address indexed _by, uint256 newIlvPerBlock);

	/**
	 * @dev Creates/deploys a factory instance
	 *
	 * @param _moda MODA ERC20 token address
	 * @param _modaPerSecond initial MODA/block value for rewards
	 * @param _secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), seconds
	 * @param _initTimestamp block timestamp to measure _secondsPerUpdate from
	 * @param _endTimestamp block timestamp when farming stops and rewards cannot be updated anymore
	 */
	constructor(
		address _moda,
		uint256 _modaPerSecond,
		uint256 _secondsPerUpdate,
		uint256 _initTimestamp,
		uint256 _endTimestamp
	) ModaAware(_moda) {
		// verify the inputs are set
		require(_modaPerSecond > 0, 'MODA/block not set');
		require(_secondsPerUpdate > 0, 'blocks/update not set');
		require(_initTimestamp > 0, 'init timestamp not set');
		require(_endTimestamp > _initTimestamp, 'invalid end timestamp: must be greater than init timestamp');

		// save the inputs into internal state variables
		modaPerSecond = _modaPerSecond;
		secondsPerUpdate = _secondsPerUpdate;
		lastRatioUpdate = _initTimestamp;
		endTimestamp = _endTimestamp;
	}

	/**
	 * @dev Verifies if `secondsPerUpdate` has passed since last MODA/block
	 *      ratio update and if MODA/block reward can be decreased by 3%
	 *
	 * @return true if enough time has passed and `updateMODAPerSecond` can be executed
	 */
	function shouldUpdateRatio() internal view returns (bool) {
		// if yield farming period has ended
		if (block.timestamp > endTimestamp) {
			// MODA/block reward cannot be updated anymore
			return false;
		}

		// check if blocks/update (91252 blocks) have passed since last update
		return block.timestamp >= lastRatioUpdate + secondsPerUpdate;
	}

	/**
	 * @notice Decreases MODA/block reward by 3%, can be executed
	 *      no more than once per `secondsPerUpdate` blocks
	 */
	function updateMODAPerSecond() internal {
		// checks if ratio can be updated i.e. if enough time has passed
		require(shouldUpdateRatio(), 'too frequent');

		// decreases MODA/block reward by 3%
		modaPerSecond = (modaPerSecond * 97) / 100;

		// set current block as the last ratio update block
		lastRatioUpdate = block.timestamp;

		// emit an event
		emit ModaRatioUpdated(msg.sender, modaPerSecond);
	}

	/**
	 * @dev Mints MODA tokens; executed by MODA Pool only
	 *
	 * @dev Requires caller to have ROLE_TOKEN_CREATOR permission
	 *      on the MODA ERC20 token instance
	 *
	 * @param _to an address to mint tokens to
	 * @param _amount amount of MODA tokens to mint
	 */
	function mintYieldTo(address _to, uint256 _amount) internal {
		// mint MODA tokens as required
		//console.log('ModaPoolFactory.mintYieldTo', address(this), _msgSender(), _to);
		mintModa(_to, _amount);
	}

	/**
	 * @dev Provided a virtual accessor to the IPool.weight()
	 *      implemented in ModaPoolBase.
	 * @dev This is used by _changePoolWeight in place of the
	 *      original implementation's pool address parameter.
	 */
	function _poolWeight() internal view virtual returns (uint32);

	/**
	 * @dev Changes the weight of the pool;
	 *      executed by the pool itself or by the factory owner
	 *
	 * @param newWeight new weight value to set to
	 */
	function _changePoolWeight(uint32 newWeight) internal onlyOwner {
		// recalculate total weight
		totalWeight = totalWeight + newWeight - _poolWeight();

		// emit an event
		emit WeightUpdated(msg.sender, address(this), newWeight);
	}
}
