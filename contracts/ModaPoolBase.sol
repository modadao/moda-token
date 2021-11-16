// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

//import 'hardhat/console.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './IPool.sol';
import './ICorePool.sol';
import './ModaConstants.sol';
import './EscrowedModaERC20.sol';
import './ModaPoolFactory.sol';

/**
 * @title Moda Pool Base
 *
 * @notice An abstract contract containing common logic for any MODA pool,
 *      be it core pool (permanent pool like MODA/ETH or MODA core pool) or something else.
 *
 * @dev Deployment and initialization.
 *      Any pool deployed must have 3 token instance addresses defined on deployment:
 *          - MODA token address
 *          - pool token address, it can be MODA token address, MODA/ETH pair address, and others
 */
abstract contract ModaPoolBase is
	IPool,
	ModaAware,
	ModaPoolFactory,
	ReentrancyGuard,
	AccessControl
{
	// @dev POOL_UID defined to add another check to ensure compliance with the contract.
	function POOL_UID() public pure returns (uint256) {
		return ModaConstants.POOL_UID;
	}

	// @dev modaPool MODA ERC20 Liquidity Pool contract address.
	// @dev This value is address(0) for the default MODA Core Pool.
	// @dev This value MUST be provided for any pool created which is not a MODA pool.
	// @dev This is used in the case where poolToken != moda.
	//      The use case relates to shadowing Liquidity Pool stakes
	//      by allowing people to store the LP tokens here to gain
	//      further MODA rewards. I'm not sure it's both. (dex 2021.09.16)
	address modaPool;

	/// @dev Data structure representing token holder using a pool
	struct User {
		// @dev Total staked amount
		uint256 tokenAmount;
		// @dev Total weight
		uint256 totalWeight;
		// @dev Auxiliary variable for yield calculation
		uint256 subYieldRewards;
		// @dev Auxiliary variable for vault rewards calculation
		uint256 subVaultRewards;
		// @dev An array of holder's deposits
		Deposit[] deposits;
	}

	/// @dev Token holder storage, maps token holder address to their data record
	mapping(address => User) public users;

	/// @dev Link to the pool token instance, for example MODA or MODA/ETH pair
	address public immutable override poolToken;

	/// @dev Pool weight, 100 for MODA pool or 900 for MODA/ETH
	uint32 public override weight;

	/// @dev Block number of the last yield distribution event
	/// This gets initialised at the first rewards pass after rewardStartTime.
	uint256 public override lastYieldDistribution;

	/// @dev Used to calculate yield rewards, keeps track of the tokens weight locked in staking
	uint256 public override usersLockingWeight;

	/**
	 * @dev Stake weight is proportional to deposit amount and time locked, precisely
	 *      "deposit amount wei multiplied by (fraction of the year locked plus one)"
	 * @dev To avoid significant precision loss due to multiplication by "fraction of the year" [0, 1],
	 *      weight is stored multiplied by 1e6 constant, as an integer
	 * @dev Corner case 1: if time locked is zero, weight is deposit amount multiplied by 1e6
	 * @dev Corner case 2: if time locked is one year, fraction of the year locked is one, and
	 *      weight is a deposit amount multiplied by 2 * 1e6
	 */
	uint256 internal constant WEIGHT_MULTIPLIER = 1e6;

	/// @dev Used to calculate yield rewards
	/// @dev This value is different from "reward per token" used in locked pool
	/// @dev Note: stakes are different in duration and "weight" reflects that
	uint256 public override yieldRewardsPerWeight;

	/**
	 * @dev When we know beforehand that staking is done for a year, and fraction of the year locked is one,
	 *      we use simplified calculation and use the following constant instead previos one
	 */
	uint256 internal constant YEAR_STAKE_WEIGHT_MULTIPLIER = 2 * WEIGHT_MULTIPLIER;

	/**
	 * @dev Rewards per weight are stored multiplied by 1e12, as integers.
	 */
	uint256 internal constant REWARD_PER_WEIGHT_MULTIPLIER = 1e12;

	/**
	 * @dev Fired in _stake() and stake()
	 *
	 * @param _by an address which performed an operation, usually token holder
	 * @param _from token holder address, the tokens will be returned to that address
	 * @param amount amount of tokens staked
	 */
	event Staked(address indexed _by, address indexed _from, uint256 amount);

	/**
	 * @dev Fired in _updateStakeLock() and updateStakeLock()
	 *
	 * @param _by an address which performed an operation
	 * @param depositId updated deposit ID
	 * @param lockedFrom deposit locked from value
	 * @param lockedUntil updated deposit locked until value
	 */
	event StakeLockUpdated(
		address indexed _by,
		uint256 depositId,
		uint256 lockedFrom,
		uint256 lockedUntil
	);

	/**
	 * @dev Fired in _unstake() and unstake()
	 *
	 * @param _by an address which performed an operation, usually token holder
	 * @param _to an address which received the unstaked tokens, usually token holder
	 * @param amount amount of tokens unstaked
	 */
	event Unstaked(address indexed _by, address indexed _to, uint256 amount);

	/**
	 * @dev Fired in _sync(), sync() and dependent functions (stake, unstake, etc.)
	 *
	 * @param _by an address which performed an operation
	 * @param yieldRewardsPerWeight updated yield rewards per weight value
	 * @param lastYieldDistribution usually, current block number
	 */
	event Synchronized(
		address indexed _by,
		uint256 yieldRewardsPerWeight,
		uint256 lastYieldDistribution
	);

	/**
	 * @dev Fired in _processRewards(), processRewards() and dependent functions (stake, unstake, etc.)
	 *
	 * @param _by an address which performed an operation
	 * @param _to an address which claimed the yield reward
	 * @param amount amount of yield paid
	 */
	event YieldClaimed(address indexed _by, address indexed _to, uint256 amount);

	/**
	 * @dev Fired in setWeight()
	 *
	 * @param _by an address which performed an operation, always a factory
	 * @param _fromVal old pool weight value
	 * @param _toVal new pool weight value
	 */
	event PoolWeightUpdated(address indexed _by, uint32 _fromVal, uint32 _toVal);

	/**
	 * @dev Overridden in sub-contracts to construct the pool
	 *
	 * @param _moda MODA ERC20 Token ModaERC20 address
	 * @param _modaPool MODA ERC20 Liquidity Pool contract address
	 * @param _poolToken token the pool operates on, for example MODA or MODA/ETH pair
	 * @param _initBlock initial block used to calculate the rewards
	 *      note: _initBlock can be set to the future effectively meaning _sync() calls will do nothing
	 * @param _weight number representing a weight of the pool, actual weight fraction
	 *      is calculated as that number divided by the total pools weight and doesn't exceed one
	 * @param _modaPerBlock initial MODA/block value for rewards
	 * @param _blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
	 * @param _endBlock block number when farming stops and rewards cannot be updated anymore
	 */
	constructor(
		address _moda,
		address _modaPool,
		address _poolToken,
		uint32 _weight,
		uint256 _modaPerBlock,
		uint256 _blocksPerUpdate,
		uint256 _initBlock,
		uint256 _endBlock
	) ModaPoolFactory(_moda, _modaPerBlock, _blocksPerUpdate, _initBlock, _endBlock) {
		// verify the inputs are set
		require(_poolToken != address(0), 'pool token address not set');
		require(_initBlock >= block.number, 'init block not set');
		require(_weight > 0, 'pool weight not set');
		require(
			((_poolToken == _moda ? 1 : 0) ^ (_modaPool != address(0) ? 1 : 0)) == 1,
			'The pool is either a MODA pool or manages external tokens, never both'
		);

		// verify MODA instance supplied
		require(Token(_moda).TOKEN_UID() == ModaConstants.TOKEN_UID, 'MODA TOKEN_UID invalid');

		if (_modaPool != address(0)) {
			require(ModaPoolBase(_modaPool).POOL_UID() == ModaConstants.POOL_UID);
		}
		// save the inputs into internal state variables
		modaPool = _modaPool;
		poolToken = _poolToken;
		_setWeight(_weight);

		// init the dependent internal state variables
		lastYieldDistribution = _initBlock;

		_setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
		_setRoleAdmin(ModaConstants.ROLE_TOKEN_CREATOR, DEFAULT_ADMIN_ROLE);
		grantRole(ModaConstants.ROLE_TOKEN_CREATOR, _msgSender());
	}

	/**
	 * @dev Granting privileges required for allowing ModaCorePool and whatever else later,
	 *     the ability to mint Tokens as required.
	 */
	function grantPrivilege(bytes32 _role, address _account) public onlyOwner {
		grantRole(_role, _account);
	}

	/**
	 * @notice Calculates current yield rewards value available for address specified
	 *
	 * @param _staker an address to calculate yield rewards value for
	 * @return calculated yield reward value for the given address
	 */
	function pendingYieldRewards(address _staker) external view override returns (uint256) {
		// `newYieldRewardsPerWeight` will store stored a recalculated value for `yieldRewardsPerWeight`
		uint256 newYieldRewardsPerWeight;

		// if smart contract state was not updated recently, `yieldRewardsPerWeight` value
		// is outdated and we need to recalculate it in order to calculate pending rewards correctly
		if (block.number > lastYieldDistribution && usersLockingWeight != 0) {
			uint256 endBlock = endBlock;
			uint256 multiplier = block.number > endBlock
				? endBlock - lastYieldDistribution
				: block.number - lastYieldDistribution;
			uint256 modaRewards = (multiplier * weight * modaPerBlock) / totalWeight;

			// recalculated value for `yieldRewardsPerWeight`
			newYieldRewardsPerWeight =
				rewardToWeight(modaRewards, usersLockingWeight) +
				yieldRewardsPerWeight;
		} else {
			// if smart contract state is up to date, we don't recalculate
			newYieldRewardsPerWeight = yieldRewardsPerWeight;
		}

		// based on the rewards per weight value, calculate pending rewards;
		User memory user = users[_staker];
		uint256 pending = weightToReward(user.totalWeight, newYieldRewardsPerWeight) -
			user.subYieldRewards;

		return pending;
	}

	/**
	 * @notice Returns total staked token balance for the given address
	 *
	 * @param _user an address to query balance for
	 * @return total staked token balance
	 */
	function balanceOf(address _user) external view override returns (uint256) {
		// read specified user token amount and return
		return users[_user].tokenAmount;
	}

	/**
	 * @notice Returns information on the given deposit for the given address
	 *
	 * @dev See getDepositsLength
	 *
	 * @param _user an address to query deposit for
	 * @param _depositId zero-indexed deposit ID for the address specified
	 * @return deposit info as Deposit structure
	 */
	function getDeposit(address _user, uint256 _depositId)
		external
		view
		override
		returns (Deposit memory)
	{
		// read deposit at specified index and return
		return users[_user].deposits[_depositId];
	}

	/**
	 * @notice Returns number of deposits for the given address. Allows iteration over deposits.
	 *
	 * @dev See getDeposit
	 *
	 * @param _user an address to query deposit length for
	 * @return number of deposits for the given address
	 */
	function getDepositsLength(address _user) external view override returns (uint256) {
		// read deposits array length and return
		return users[_user].deposits.length;
	}

	/**
	 * @notice Stakes specified amount of tokens for the specified amount of time,
	 *      and pays pending yield rewards if any
	 *
	 * @dev Requires amount to stake to be greater than zero
	 *
	 * @param _amount amount of tokens to stake
	 * @param _lockUntil stake period as unix timestamp; zero means no locking
	 */
	function stake(
		uint256 _amount,
		uint256 _lockUntil
	) external override {
		// delegate call to an internal function
		_stake(msg.sender, _amount, _lockUntil,  false);
	}

	/**
	 * @notice Unstakes specified amount of tokens, and pays pending yield rewards if any
	 *
	 * @dev Requires amount to unstake to be greater than zero
	 *
	 * @param _depositId deposit ID to unstake from, zero-indexed
	 * @param _amount amount of tokens to unstake
	 */
	function unstake(
		uint256 _depositId,
		uint256 _amount
	) external override {
		// delegate call to an internal function
		//console.log('ModaPoolBase unstake', _msgSender());
		_unstake(msg.sender, _depositId, _amount);
	}

	/**
	 * @notice Extends locking period for a given deposit
	 *
	 * @dev Requires new lockedUntil value to be:
	 *      higher than the current one, and
	 *      in the future, but
	 *      no more than 1 year in the future
	 *
	 * @param depositId updated deposit ID
	 * @param lockedUntil updated deposit locked until value
	 */
	function updateStakeLock(
		uint256 depositId,
		uint256 lockedUntil
	) external {
		// sync and call processRewards
		_sync();
		_processRewards(msg.sender, false);
		// delegate call to an internal function
		_updateStakeLock(msg.sender, depositId, lockedUntil);
	}

	/**
	 * @notice Service function to synchronize pool state with current time
	 *
	 * @dev Can be executed by anyone at any time, but has an effect only when
	 *      at least one block passes between synchronizations
	 * @dev Executed internally when staking, unstaking, processing rewards in order
	 *      for calculations to be correct and to reflect state progress of the contract
	 * @dev When timing conditions are not met (executed too frequently, or after factory
	 *      end block), function doesn't throw and exits silently
	 */
	function sync() external override {
		// delegate call to an internal function
		_sync();
	}

	/**
	 * @notice Service function to calculate and pay pending yield rewards to the sender
	 *
	 * @dev Can be executed by anyone at any time, but has an effect only when
	 *      executed by deposit holder and when at least one block passes from the
	 *      previous reward processing
	 * @dev When timing conditions are not met (executed too frequently, or after
	 *      end block), function doesn't throw and exits silently
	 */
	function processRewards() external virtual override {
		// delegate call to an internal function
		_processRewards(msg.sender, true);
	}

	/**
	 * @dev Executed by the factory to modify pool weight; the factory is expected
	 *      to keep track of the total pools weight when updating
	 *
	 * @dev Set weight to zero to disable the pool
	 *
	 * @param _weight new weight to set for the pool
	 */
	function setWeight(uint32 _weight) external override onlyOwner {
		_setWeight(_weight);
	}

	/**
	 * @dev Executed by the factory to modify pool weight; the factory is expected
	 *      to keep track of the total pools weight when updating
	 *
	 * @dev Set weight to zero to disable the pool
	 *
	 * @param _weight new weight to set for the pool
	 */
	function _setWeight(uint32 _weight) internal onlyOwner {
		///TODO: this could be more efficient.
		// order of operations is important here.
		_changePoolWeight(_weight);
		// set the new weight value
		weight = _weight;
		// emit an event logging old and new weight values
		emit PoolWeightUpdated(msg.sender, weight, _weight);
	}

	/**
	 * @dev Similar to public pendingYieldRewards, but performs calculations based on
	 *      current smart contract state only, not taking into account any additional
	 *      time/blocks which might have passed
	 *
	 * @param _staker an address to calculate yield rewards value for
	 * @return pending calculated yield reward value for the given address
	 */
	function _pendingYieldRewards(address _staker) internal view returns (uint256 pending) {
		// read user data structure into memory
		User memory user = users[_staker];

		// and perform the calculation using the values read
		return weightToReward(user.totalWeight, yieldRewardsPerWeight) - user.subYieldRewards;
	}

	/**
	 * @dev Used internally, mostly by children implementations, see stake()
	 *
	 * @param _staker an address which stakes tokens and which will receive them back
	 * @param _amount amount of tokens to stake
	 * @param _lockUntil stake period as unix timestamp; zero means no locking
	 * @param _isYield a flag indicating if that stake is created to store yield reward
	 *      from the previously unstaked stake
	 */
	function _stake(
		address _staker,
		uint256 _amount,
		uint256 _lockUntil,
		bool _isYield
	) internal virtual {
		// validate the inputs
		// console.log('lockUntil', _lockUntil);
		// console.log('timestamp', block.timestamp);
		require(_amount > 0, 'zero amount');
		require(
			_lockUntil == 0 ||
				(_lockUntil > block.timestamp && _lockUntil - block.timestamp <= 365 days),
			'invalid lock interval'
		);

		// update smart contract state
		_sync();

		// get a link to user data struct, we will write to it later
		User storage user = users[_staker];
		// process current pending rewards if any
		if (user.tokenAmount > 0) {
			_processRewards(_staker, false);
		}

		// in most of the cases added amount `addedAmount` is simply `_amount`
		// however for deflationary tokens this can be different

		// read the current balance
		uint256 previousBalance = IERC20(poolToken).balanceOf(address(this));
		// transfer `_amount`; note: some tokens may get burnt here
		transferPoolTokenFrom(address(msg.sender), address(this), _amount);
		// read new balance, usually this is just the difference `previousBalance - _amount`
		uint256 newBalance = IERC20(poolToken).balanceOf(address(this));
		// calculate real amount taking into account deflation
		uint256 addedAmount = newBalance - previousBalance;

		// set the `lockFrom` and `lockUntil` taking into account that
		// zero value for `_lockUntil` means "no locking" and leads to zero values
		// for both `lockFrom` and `lockUntil`
		uint256 lockFrom = _lockUntil > 0 ? block.timestamp : 0;
		uint256 lockUntil = _lockUntil;

		// stake weight formula rewards for locking
		uint256 stakeWeight = (((lockUntil - lockFrom) * WEIGHT_MULTIPLIER) /
			365 days +
			WEIGHT_MULTIPLIER) * addedAmount;

		// makes sure stakeWeight is valid
		assert(stakeWeight > 0);

		// create and save the deposit (append it to deposits array)
		Deposit memory deposit = Deposit({
			tokenAmount: addedAmount,
			weight: stakeWeight,
			lockedFrom: lockFrom,
			lockedUntil: lockUntil,
			isYield: _isYield
		});
		// deposit ID is an index of the deposit in `deposits` array
		user.deposits.push(deposit);

		// update user record
		user.tokenAmount += addedAmount;
		user.totalWeight += stakeWeight;
		user.subYieldRewards = weightToReward(user.totalWeight, yieldRewardsPerWeight);

		// update global variable
		usersLockingWeight += stakeWeight;

		// emit an event
		emit Staked(msg.sender, _staker, _amount);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see unstake()
	 *
	 * @param _staker an address which unstakes tokens (which previously staked them)
	 * @param _depositId deposit ID to unstake from, zero-indexed
	 * @param _amount amount of tokens to unstake
	 */
	function _unstake(
		address _staker,
		uint256 _depositId,
		uint256 _amount
	) internal virtual {
		// verify an amount is set
		require(_amount > 0, 'zero amount');

		// get a link to user data struct, we will write to it later
		User storage user = users[_staker];
		// get a link to the corresponding deposit, we may write to it later
		Deposit storage stakeDeposit = user.deposits[_depositId];
		// deposit structure may get deleted, so we save isYield flag to be able to use it
		bool isYield = stakeDeposit.isYield;

		// verify available balance
		// if staker address ot deposit doesn't exist this check will fail as well
		require(stakeDeposit.tokenAmount >= _amount, 'amount exceeds stake');

		// update smart contract state
		_sync();
		// and process current pending rewards if any
		_processRewards(_staker, false);

		// recalculate deposit weight
		uint256 previousWeight = stakeDeposit.weight;
		uint256 newWeight = (((stakeDeposit.lockedUntil - stakeDeposit.lockedFrom) *
			WEIGHT_MULTIPLIER) /
			365 days +
			WEIGHT_MULTIPLIER) * (stakeDeposit.tokenAmount - _amount);

		// update the deposit, or delete it if its depleted
		if (stakeDeposit.tokenAmount - _amount == 0) {
			delete user.deposits[_depositId];
		} else {
			stakeDeposit.tokenAmount -= _amount;
			stakeDeposit.weight = newWeight;
		}

		// update user record
		user.tokenAmount -= _amount;
		user.totalWeight = user.totalWeight - previousWeight + newWeight;
		user.subYieldRewards = weightToReward(user.totalWeight, yieldRewardsPerWeight);

		// update global variable
		usersLockingWeight = usersLockingWeight - previousWeight + newWeight;

		// if the deposit was created by the pool itself as a yield reward
		if (isYield) {
			// mint the yield via the factory
			mintYieldTo(msg.sender, _amount);
		} else {
			// otherwise just return tokens back to holder
			transferPoolToken(msg.sender, _amount);
		}

		// emit an event
		emit Unstaked(msg.sender, _staker, _amount);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see sync()
	 *
	 * @dev Updates smart contract state (`yieldRewardsPerWeight`, `lastYieldDistribution`),
	 *      updates factory state via `updateMODAPerBlock`
	 */
	function _sync() internal virtual {
		// update MODA per block value in factory if required
		if (shouldUpdateRatio()) {
			updateMODAPerBlock();
		}

		// check bound conditions and if these are not met -
		// exit silently, without emitting an event
		uint256 lastBlock = endBlock;
		if (lastYieldDistribution >= lastBlock) {
			return;
		}
		if (block.number <= lastYieldDistribution) {
			return;
		}
		// if locking weight is zero - update only `lastYieldDistribution` and exit
		if (usersLockingWeight == 0) {
			lastYieldDistribution = block.number;
			return;
		}

		// to calculate the reward we need to know how many blocks passed, and reward per block
		uint256 currentBlock = block.number > endBlock ? endBlock : block.number;
		uint256 blocksPassed = currentBlock - lastYieldDistribution;

		// calculate the reward
		uint256 modaReward = (blocksPassed * modaPerBlock * weight) / totalWeight;

		// update rewards per weight and `lastYieldDistribution`
		yieldRewardsPerWeight += rewardToWeight(modaReward, usersLockingWeight);
		lastYieldDistribution = currentBlock;

		// emit an event
		emit Synchronized(msg.sender, yieldRewardsPerWeight, lastYieldDistribution);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see processRewards()
	 *
	 * @param _staker an address which receives the reward (which has staked some tokens earlier)
	 * @param _withUpdate flag allowing to disable synchronization (see sync()) if set to false
	 * @return pendingYield the rewards calculated and optionally re-staked
	 */
	function _processRewards(
		address _staker,
		bool _withUpdate
	) internal virtual returns (uint256 pendingYield) {
		// update smart contract state if required
		if (_withUpdate) {
			_sync();
		}

		// calculate pending yield rewards, this value will be returned
		pendingYield = _pendingYieldRewards(_staker);

		// if pending yield is zero - just return silently
		if (pendingYield == 0) return 0;

		// get link to a user data structure, we will write into it later
		User storage user = users[_staker];

		if (poolToken == moda) {
			// calculate pending yield weight,
			// 2e6 is the bonus weight when staking for 1 year
			uint256 depositWeight = pendingYield * YEAR_STAKE_WEIGHT_MULTIPLIER;

			// if the pool is MODA Pool - create new MODA deposit
			// and save it - push it into deposits array
			Deposit memory newDeposit = Deposit({
				tokenAmount: pendingYield,
				lockedFrom: block.timestamp,
				lockedUntil: block.timestamp + 365 days, // staking yield for 1 year
				weight: depositWeight,
				isYield: true
			});
			user.deposits.push(newDeposit);

			// update user record
			user.tokenAmount += pendingYield;
			user.totalWeight += depositWeight;

			// update global variable
			usersLockingWeight += depositWeight;
		} else {
			// Force a hard error in this case.
			// The pool was somehow not constructed correctly.
			assert(modaPool != address(0));
			// for other pools - stake as pool.
			// NB: the target modaPool must be configured to give
			// this contract instance the ROLE_TOKEN_CREATOR role/privilege.
			ICorePool(modaPool).stakeAsPool(_staker, pendingYield);
		}

		// update users's record for `subYieldRewards` if requested
		if (_withUpdate) {
			user.subYieldRewards = weightToReward(user.totalWeight, yieldRewardsPerWeight);
		}

		// emit an event
		emit YieldClaimed(msg.sender, _staker, pendingYield);
	}

	/**
	 * @dev See updateStakeLock()
	 *
	 * @param _staker an address to update stake lock
	 * @param _depositId updated deposit ID
	 * @param _lockedUntil updated deposit locked until value
	 */
	function _updateStakeLock(
		address _staker,
		uint256 _depositId,
		uint256 _lockedUntil
	) internal {
		// validate the input time
		require(_lockedUntil > block.timestamp, 'lock should be in the future');

		// get a link to user data struct, we will write to it later
		User storage user = users[_staker];
		// get a link to the corresponding deposit, we may write to it later
		Deposit storage stakeDeposit = user.deposits[_depositId];

		// validate the input against deposit structure
		require(_lockedUntil > stakeDeposit.lockedUntil, 'invalid new lock');

		// verify locked from and locked until values
		if (stakeDeposit.lockedFrom == 0) {
			require(_lockedUntil - block.timestamp <= 365 days, 'max lock period is 365 days');
			stakeDeposit.lockedFrom = block.timestamp;
		} else {
			require(
				_lockedUntil - stakeDeposit.lockedFrom <= 365 days,
				'max lock period is 365 days'
			);
		}

		// update locked until value, calculate new weight
		stakeDeposit.lockedUntil = _lockedUntil;
		uint256 newWeight = (((stakeDeposit.lockedUntil - stakeDeposit.lockedFrom) *
			WEIGHT_MULTIPLIER) /
			365 days +
			WEIGHT_MULTIPLIER) * stakeDeposit.tokenAmount;

		// save previous weight
		uint256 previousWeight = stakeDeposit.weight;
		// update weight
		stakeDeposit.weight = newWeight;

		// update user total weight and global locking weight
		user.totalWeight = user.totalWeight - previousWeight + newWeight;
		usersLockingWeight = usersLockingWeight - previousWeight + newWeight;

		// emit an event
		emit StakeLockUpdated(_staker, _depositId, stakeDeposit.lockedFrom, _lockedUntil);
	}

	/**
	 * @dev Converts stake weight (not to be mixed with the pool weight) to
	 *      MODA reward value, applying the 10^12 division on weight
	 *
	 * @param _weight stake weight
	 * @param rewardPerWeight MODA reward per weight
	 * @return reward value normalized to 10^12
	 */
	function weightToReward(uint256 _weight, uint256 rewardPerWeight)
		public
		pure
		returns (uint256)
	{
		// apply the formula and return
		return (_weight * rewardPerWeight) / REWARD_PER_WEIGHT_MULTIPLIER;
	}

	/**
	 * @dev Converts reward MODA value to stake weight (not to be mixed with the pool weight),
	 *      applying the 10^12 multiplication on the reward
	 *      - OR -
	 * @dev Converts reward MODA value to reward/weight if stake weight is supplied as second
	 *      function parameter instead of reward/weight
	 *
	 * @param reward yield reward
	 * @param rewardPerWeight reward/weight (or stake weight)
	 * @return stake weight (or reward/weight)
	 */
	function rewardToWeight(uint256 reward, uint256 rewardPerWeight) public pure returns (uint256) {
		// apply the reverse formula and return
		return (reward * REWARD_PER_WEIGHT_MULTIPLIER) / rewardPerWeight;
	}

	/**
	 * @dev Executes SafeERC20.safeTransfer on a pool token
	 *
	 * @dev Reentrancy safety enforced via `ReentrancyGuard.nonReentrant`
	 */
	function transferPoolToken(address _to, uint256 _value) internal nonReentrant {
		// just delegate call to the target
		SafeERC20.safeTransfer(IERC20(poolToken), _to, _value);
	}

	/**
	 * @dev Executes SafeERC20.safeTransferFrom on a pool token
	 *
	 * @dev Reentrancy safety enforced via `ReentrancyGuard.nonReentrant`
	 */
	function transferPoolTokenFrom(
		address _from,
		address _to,
		uint256 _value
	) internal nonReentrant {
		// just delegate call to the target
		SafeERC20.safeTransferFrom(IERC20(poolToken), _from, _to, _value);
	}

	function _poolWeight() internal view override returns (uint32) {
		return weight;
	}
}
