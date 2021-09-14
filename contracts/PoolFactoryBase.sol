// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import './ModaAware.sol';
import './EscrowedModaERC20.sol';

/**
 * @title Moda Core Pool
 *
 * @notice Core pools represent permanent pools like MODA or MODA/ETH Pair pool,
 *      core pools allow staking for arbitrary periods of time up to 1 year
 *
 * @dev Pulled from the original Factory code to provide the weight calculations.
 *
 * @author David Schwartz, reviewed by Kevin Brown
 */
contract PoolFactoryBase is ModaAware {
	/**
	 * @dev MODA/block determines yield farming reward base
	 *      used by the yield pools controlled by the factory
	 */
	uint192 public modaPerBlock;

	/**
	 * @dev The yield is distributed proportionally to pool weights;
	 *      total weight is here to help in determining the proportion
	 */
	uint32 public totalWeight;

	/**
	 * @dev MODA/block decreases by 3% every blocks/update (set to 91252 blocks during deployment);
	 *      an update is triggered by executing `updateMODAPerBlock` public function
	 */
	uint32 public immutable blocksPerUpdate;

	/**
	 * @dev End block is the last block when MODA/block can be decreased;
	 *      it is implied that yield farming stops after that block
	 */
	uint256 public endBlock;

	/**
	 * @dev Each time the MODA/block ratio gets updated, the block number
	 *      when the operation has occurred gets recorded into `lastRatioUpdate`
	 * @dev This block number is then used to check if blocks/update `blocksPerUpdate`
	 *      has passed when decreasing yield reward by 3%
	 */
	uint256 public lastRatioUpdate;

	/**
	 * @dev Creates/deploys a factory instance
	 *
	 * @param _moda MODA ERC20 token address
	 * @param _modaPerBlock initial MODA/block value for rewards
	 * @param _blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
	 * @param _initBlock block number to measure _blocksPerUpdate from
	 * @param _endBlock block number when farming stops and rewards cannot be updated anymore
	 */
	constructor(
		address _moda,
		uint192 _modaPerBlock,
		uint32 _blocksPerUpdate,
		uint256 _initBlock,
		uint256 _endBlock
	) ModaAware(_moda) {
		// verify the inputs are set
		require(_modaPerBlock > 0, 'MODA/block not set');
		require(_blocksPerUpdate > 0, 'blocks/update not set');
		require(_initBlock > 0, 'init block not set');
		require(_endBlock > _initBlock, 'invalid end block: must be greater than init block');

		// save the inputs into internal state variables
		modaPerBlock = _modaPerBlock;
		blocksPerUpdate = _blocksPerUpdate;
		lastRatioUpdate = _initBlock;
		endBlock = _endBlock;
	}

	/**
	 * @dev Verifies if `blocksPerUpdate` has passed since last MODA/block
	 *      ratio update and if MODA/block reward can be decreased by 3%
	 *
	 * @return true if enough time has passed and `updateMODAPerBlock` can be executed
	 */
	function shouldUpdateRatio() internal view returns (bool) {
		// if yield farming period has ended
		if (block.number > endBlock) {
			// MODA/block reward cannot be updated anymore
			return false;
		}

		// check if blocks/update (91252 blocks) have passed since last update
		return block.number >= lastRatioUpdate + blocksPerUpdate;
	}

	/// Imported from ModaPoolFactory after that was removed from the design.

	/**
	 * @dev Fired in updateMODAPerBlock()
	 *
	 * @param _by an address which executed an action
	 * @param newIlvPerBlock new MODA/block value
	 */
	event ModaRatioUpdated(address indexed _by, uint256 newIlvPerBlock);

	/**
	 * @notice Decreases MODA/block reward by 3%, can be executed
	 *      no more than once per `blocksPerUpdate` blocks
	 */
	function updateMODAPerBlock() internal {
		// checks if ratio can be updated i.e. if blocks/update (91252 blocks) have passed
		require(shouldUpdateRatio(), 'too frequent');

		// decreases MODA/block reward by 3%
		modaPerBlock = (modaPerBlock * 97) / 100;

		// set current block as the last ratio update block
		lastRatioUpdate = block.number;

		// emit an event
		emit ModaRatioUpdated(msg.sender, modaPerBlock);
	}

	/**
	 * @dev Mints MODA tokens; executed by MODA Pool only
	 *
	 * @dev Requires factory to have ROLE_TOKEN_CREATOR permission
	 *      on the MODA ERC20 token instance
	 *
	 * @param _to an address to mint tokens to
	 * @param _amount amount of MODA tokens to mint
	 */
	function mintYieldTo(address _to, uint256 _amount) internal {
		// mint MODA tokens as required
		mintModa(_to, _amount);
	}
}
