// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IPool.sol';
import './ICorePool.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './ModaAware.sol';
import './EscrowedModaERC20.sol';

/**
 * @title Moda Pool Base
 *
 * @notice An abstract contract containing common logic for any MODA pool,
 *      be it core pool (permanent pool like MODA/ETH or MODA core pool) or something else.
 *
 * @dev Deployment and initialization.
 *      Any pool deployed must have 3 token instance addresses defined on deployment:
 *          - MODA token address
 *          - sMODA token address, used to mint sMODA rewards
 *          - pool token address, it can be MODA token address, MODA/ETH pair address, and others
 *
 * @author David Schwartz, reviewed by Kevin Brown
 */
abstract contract ModaPoolBase is IPool, ModaAware, ReentrancyGuard {
	/// @dev Data structure representing token holder using a pool
	struct User {
		// @dev Total staked amount
		uint256 tokenAmount;
		// @dev An array of holder's deposits
		Deposit[] deposits;
	}

	/// @dev Token holder storage, maps token holder address to their data record
	mapping(address => User) public users;

	/// @dev Link to sMODA ERC20 Token EscrowedModaERC20 instance
	address public immutable override smoda;

	/// @dev Link to the pool token instance, for example MODA or MODA/ETH pair
	address public immutable override poolToken;

	/// @dev Block number of the last yield distribution event
	/// This gets initialised at the first rewards pass after rewardStartTime.
	uint256 public override lastYieldDistribution;

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
	 * @dev Fired in _processRewards(), processRewards() and dependent functions (stake, unstake, etc.)
	 *
	 * @param _by an address which performed an operation
	 * @param _to an address which claimed the yield reward
	 * @param sModa flag indicating if reward was paid (minted) in sMODA
	 * @param amount amount of yield paid
	 */
	event YieldClaimed(address indexed _by, address indexed _to, bool sModa, uint256 amount);

	/**
	 * @dev Overridden in sub-contracts to construct the pool
	 *
	 * @param _moda MODA ERC20 Token ModaERC20 address
	 * @param _smoda sMODA ERC20 Token EscrowedModaERC20 address
	 * @param _poolToken token the pool operates on, for example MODA or MODA/ETH pair
	 * @param _initTime initial timestamp used to calculate the rewards
	 *      note: _initTime can be set to the future effectively meaning rewards calcs will do nothing
	 */
	constructor(
		address _moda,
		address _smoda,
		address _poolToken,
		uint256 _initTime
	)
		//,uint64 _endBlock ///TODO is this needed?
		ModaAware(_moda)
	{
		// verify the inputs are set
		require(_smoda != address(0), 'sMODA address not set');
		require(_poolToken != address(0), 'pool token address not set');
		require(_initTime > block.timestamp, 'init block not set');

		// verify sMODA instance supplied
		require(
			EscrowedModaERC20(_smoda).TOKEN_UID() ==
				0x0a9a93ba9d22fa5ed507ff32440b8750c8951e4864438c8afc02be22ad238ebf,
			'unexpected sMODA TOKEN_UID'
		);
		// save the inputs into internal state variables
		smoda = _smoda;
		poolToken = _poolToken;

		// init the dependent internal state variables
		lastYieldDistribution = 0; // Rewards haven't started yet.
	}

	/**
	 * @notice Calculates current yield rewards value available for address specified
	 *
	 * @param _staker an address to calculate yield rewards value for
	 * @return calculated  reward value for the given address
	 */
	function pendingYieldRewards(address _staker) external view override returns (uint256) {
		return _calculateRewards(_staker);
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
	 * @param _useSMODA a flag indicating if previous reward to be paid as sMODA
	 */
	function stake(
		uint256 _amount,
		uint256 _lockUntil,
		bool _useSMODA
	) external override {
		// delegate call to an internal function
		_stake(msg.sender, _amount, _lockUntil, _useSMODA);
	}

	/**
	 * @notice Unstakes specified amount of tokens, and pays pending yield rewards if any
	 *
	 * @dev Requires amount to unstake to be greater than zero
	 *
	 * @param _depositId deposit ID to unstake from, zero-indexed
	 * @param _amount amount of tokens to unstake
	 * @param _useSMODA a flag indicating if reward to be paid as sMODA
	 */
	function unstake(
		uint256 _depositId,
		uint256 _amount,
		bool _useSMODA
	) external override {
		// delegate call to an internal function
		_unstake(msg.sender, _depositId, _amount, _useSMODA);
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
	 * @param useSMODA used for _processRewards check if it should use MODA or sMODA
	 */
	function updateStakeLock(
		uint256 depositId,
		uint256 lockedUntil,
		bool useSMODA
	) external {
		_processRewards(msg.sender, useSMODA);
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
	 *
	 * @param _useSMODA flag indicating whether to mint sMODA token as a reward or not;
	 *      when set to true - sMODA reward is minted immediately and sent to sender,
	 *      when set to false - new MODA reward deposit gets created if pool is an MODA pool
	 *      (poolToken is MODA token), or new pool deposit gets created together with sMODA minted
	 *      when pool is not an MODA pool (poolToken is not an MODA token)
	 */
	function processRewards(bool _useSMODA) external virtual override {
		// delegate call to an internal function
		_processRewards(msg.sender, _useSMODA);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see stake()
	 *
	 * @param _staker an address which stakes tokens and which will receive them back
	 * @param _amount amount of tokens to stake
	 * @param _lockUntil stake period as unix timestamp; zero means no locking
	 * @param _useSMODA a flag indicating if previous reward to be paid as sMODA
	 */
	function _stake(
		address _staker,
		uint256 _amount,
		uint256 _lockUntil,
		bool _useSMODA
	) internal virtual {
		// validate the inputs
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
			_processRewards(_staker, _useSMODA);
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

		// create and save the deposit (append it to deposits array)
		Deposit memory deposit = Deposit({
			tokenAmount: addedAmount,
			lockedFrom: lockFrom,
			lockedUntil: lockUntil,
			isYield: false
		});
		// deposit ID is an index of the deposit in `deposits` array
		user.deposits.push(deposit);

		// update user record
		user.tokenAmount += addedAmount;

		// emit an event
		emit Staked(msg.sender, _staker, _amount);
	}

	/**
	 * @dev Used internally, mostly by children implementations, see unstake()
	 *
	 * @param _staker an address which unstakes tokens (which previously staked them)
	 * @param _depositId deposit ID to unstake from, zero-indexed
	 * @param _amount amount of tokens to unstake
	 * @param _useSMODA a flag indicating if reward to be paid as sMODA
	 */
	function _unstake(
		address _staker,
		uint256 _depositId,
		uint256 _amount,
		bool _useSMODA
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

		//  process current pending rewards if any
		_processRewards(_staker, _useSMODA);

		// update the deposit, or delete it if its depleted
		if (stakeDeposit.tokenAmount - _amount == 0) {
			delete user.deposits[_depositId];
		} else {
			stakeDeposit.tokenAmount -= _amount;
		}

		// update user record
		user.tokenAmount -= _amount;

		// if the deposit was created by the pool itself as a yield reward
		if (isYield) {
			// mint the yield
			mintModa(msg.sender, _amount);
		} else {
			// otherwise just return tokens back to holder
			transferPoolToken(msg.sender, _amount);
		}

		// emit an event
		emit Unstaked(msg.sender, _staker, _amount);
	}

	/**
	 * @dev Used internally to calculate user's rewards.
	 *
	 * @dev params are unspecified for the moment. ///TODO
	 *
	 *
	 */
	function _calculateRewards(address _staker) internal view virtual returns (uint256 rewards) {
		///TODO: This is intended to be overridden in ModaCorePool or other derived contracts.
		_staker;
		return 0;
	}

	/**
	 * @dev Used internally, mostly by children implementations, see processRewards()
	 *
	 * @param _staker an address which receives the reward (which has staked some tokens earlier)
	 * @param _useSMODA flag indicating whether to mint sMODA token as a reward or not, see processRewards()
	 * @return rewards the rewards calculated and optionally re-staked
	 */
	function _processRewards(address _staker, bool _useSMODA)
		internal
		virtual
		returns (uint256 rewards)
	{
		rewards = _calculateRewards(_staker);
		if (rewards == 0) return rewards;
		// get link to a user data structure, we will write into it later
		User storage user = users[_staker];

		// if sMODA is requested
		if (_useSMODA) {
			// - mint sMODA
			mintSModa(_staker, rewards);
		} else if (poolToken == moda) {
			// if the pool is MODA Pool - create new MODA deposit
			// and save it - push it into deposits array
			Deposit memory newDeposit = Deposit({
				tokenAmount: rewards,
				lockedFrom: uint64(block.timestamp),
				lockedUntil: uint64(block.timestamp + 365 days), // staking yield for 1 year
				isYield: true
			});
			user.deposits.push(newDeposit);

			// update user record
			user.tokenAmount += rewards;
		} else {
			// for other pools - stake as pool
			///NOTE: We're not having other pools. yet.
		}

		// emit an event
		emit YieldClaimed(msg.sender, _staker, _useSMODA, rewards);
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
		// emit an event
		emit StakeLockUpdated(_staker, _depositId, stakeDeposit.lockedFrom, _lockedUntil);
	}

	/**
	 * @dev Executes EscrowedModaERC20.mint(_to, _values)
	 *      on the bound EscrowedModaERC20 instance
	 *
	 * @dev Reentrancy safe due to the EscrowedModaERC20 design
	 */
	function mintSModa(address _to, uint256 _value) private {
		// just delegate call to the target
		EscrowedModaERC20(smoda).mint(_to, _value);
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
