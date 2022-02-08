// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './IPool.sol';
import './ICorePool.sol';
import './ModaConstants.sol';
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
	ReentrancyGuard
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
		// @dev An array of holder's deposits
		Deposit[] deposits;
	}

	/// @dev Token holder storage, maps token holder address to their data record
	mapping(address => User) public users;

	/// @dev Link to the pool token instance, for example MODA or MODA/ETH pair
	address public immutable override poolToken;

	/// @dev Link to the pool factory instance that manages weights
	ModaPoolFactory public immutable modaPoolFactory;

	/// @dev Pool weight, 200 for MODA pool or 800 for MODA/ETH
	uint32 public override weight;

	/// @dev Used to calculate yield rewards, keeps track of the tokens weight locked in staking
	uint256 public override usersLockingWeight;

	/// @dev Used to calculate yield rewards, keeps track of when the pool started
	uint256 public override startTimestamp;

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

	/**
	 * @dev When we know beforehand that staking is done for a year, and fraction of the year locked is one,
	 *      we use simplified calculation and use the following constant instead previous one
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
	 * @param _modaPoolFactory MODA Pool Factory Address
	 * @param _modaPool MODA ERC20 Liquidity Pool contract address
	 * @param _poolToken token the pool operates on, for example MODA or MODA/ETH pair
	 * @param _weight number representing a weight of the pool, actual weight fraction
	 *      is calculated as that number divided by the total pools weight and doesn't exceed one
	 * @param _startTimestamp timestamp that pool should start from
	 */
	constructor(
		address _moda,
		address _modaPoolFactory,
		address _modaPool,
		address _poolToken,
		uint32 _weight,
		uint256 _startTimestamp
	) ModaAware(_moda) {
		// verify the inputs are set
		require(_poolToken != address(0), 'pool token address not set');
		require(_modaPoolFactory != address(0), 'pool factory address not set');
		require(_weight > 0, 'pool weight not set');
		require(_startTimestamp >= block.timestamp, 'start already passed');
		require(
			((_poolToken == _moda ? 1 : 0) ^ (_modaPool != address(0) ? 1 : 0)) == 1,
			'Either a MODA pool or manage external tokens, never both'
		);

		// Verify Moda instance supplied
		require(Token(_moda).TOKEN_UID() == ModaConstants.TOKEN_UID, 'Moda TOKEN_UID invalid');

		// Verify Moda factory instance supplied
		require(ModaPoolFactory(_modaPoolFactory).FACTORY_UID() == ModaConstants.FACTORY_UID, 'Moda FACTORY_UID invalid');

		// Verify Moda pool instance supplied
		if (_modaPool != address(0)) {
			require(ModaPoolBase(_modaPool).POOL_UID() == ModaConstants.POOL_UID);
		}

		// save the inputs into internal state variables
		modaPool = _modaPool;
		modaPoolFactory = ModaPoolFactory(_modaPoolFactory);
		poolToken = _poolToken;
		weight = _weight;
		startTimestamp = _startTimestamp;
	}

	/**
	 * @notice Calculates current yield rewards value available for address specified
	 *
	 * @param _staker an address to calculate yield rewards value for
	 * @return calculated yield reward value for the given address
	 */
	function pendingYieldRewards(address _staker) public view override returns (uint256) {
		if (block.timestamp < startTimestamp) return 0;
		if (usersLockingWeight == 0) return 0;

		// Gas optimisation
		uint256 factoryEnd = modaPoolFactory.endTimestamp();

		// Get the current rate of rewards
		uint256 endOfTimeframe = block.timestamp > factoryEnd ? block.timestamp : factoryEnd;
		uint256 modaPerSecond = modaPoolFactory.modaPerSecondAt(endOfTimeframe);

		// Calculate total rewards for timeframe
		uint256 totalRewards = modaPerSecond * (endOfTimeframe - startTimestamp);

		// Weight for the pool.
		uint256 poolRewards = totalRewards * weight / modaPoolFactory.totalWeight();

		// And finally weight for the user.
		return poolRewards * users[_staker].totalWeight / usersLockingWeight;
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
		// call processRewards
		_processRewards(msg.sender);
		// delegate call to an internal function
		_updateStakeLock(msg.sender, depositId, lockedUntil);
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
		_processRewards(msg.sender);
	}

	/**
	 * @dev Executed by the factory to modify pool weight; the factory is expected
	 *      to keep track of the total pools weight when updating
	 *
	 * @dev Set weight to zero to disable the pool
	 *
	 * @param _weight new weight to set for the pool
	 */
	function setWeight(uint32 _weight) external override {
		// Only the factory can send a set weight command
		require(msg.sender == address(modaPoolFactory), 'Access denied: factory only');

		uint32 oldWeight = weight;
		weight = _weight;

		// emit an event logging old and new weight values
		emit PoolWeightUpdated(msg.sender, oldWeight, weight);
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
		require(_amount > 0, 'zero amount');
		require(
			_lockUntil == 0 ||
				(_lockUntil > block.timestamp && _lockUntil - block.timestamp <= 365 days),
			'invalid lock interval'
		);

		// get a link to user data struct, we will write to it later
		User storage user = users[_staker];
		// process current pending rewards if any
		if (user.tokenAmount > 0) {
			_processRewards(_staker);
		}

		// in most of the cases added amount `addedAmount` is simply `_amount`
		// however for deflationary tokens this can be different

		// read the current balance
		uint256 previousBalance = IERC20(poolToken).balanceOf(address(this));
		// transfer `_amount`; note: some tokens may get burnt here if the token contract
		// withholds fees on transfers.
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

		// update global variable
		usersLockingWeight += stakeWeight;

		// let the world know
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
		// if staker address at deposit doesn't exist this check will fail as well
		require(stakeDeposit.tokenAmount >= _amount, 'amount exceeds stake');

		// and process current pending rewards if any
		_processRewards(_staker);

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

		// update global variable
		usersLockingWeight = usersLockingWeight - previousWeight + newWeight;

		// if the deposit was created by the pool itself as a yield reward
		if (isYield) {
			// mint the yield via the factory
			modaPoolFactory.mintYieldTo(msg.sender, _amount);
		} else {
			// otherwise just return tokens back to holder
			transferPoolToken(msg.sender, _amount);
		}

		// emit an event
		emit Unstaked(msg.sender, _staker, _amount);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see processRewards()
	 *
	 * @param _staker an address which receives the reward (which has staked some tokens earlier)
	 * @return pendingYield the rewards calculated and optionally re-staked
	 */
	function _processRewards(address _staker) internal virtual returns (uint256 pendingYield) {
		// calculate pending yield rewards, this value will be returned
		pendingYield = pendingYieldRewards(_staker);

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
			// This pool was somehow not constructed correctly if it has address(0) as the pool address.
			assert(modaPool != address(0));

			// for other pools - stake as pool.
			// NB: the target modaPool must be configured to give
			// this contract instance the ROLE_TOKEN_CREATOR role/privilege.
			ICorePool(modaPool).stakeAsPool(_staker, pendingYield);
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
}
