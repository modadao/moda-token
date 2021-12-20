// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./IPool.sol";
import "./ModaAware.sol";
import "./ModaCorePool.sol";
import "./EscrowedModaERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Moda Pool Factory
 *
 * @notice Moda Pool Factory manages Moda Yield farming pools, provides a single
 *      public interface to access the pools, provides an interface for the pools
 *      to mint yield rewards, access pool-related info, update weights, etc.
 *
 * @notice The factory is authorized (via its owner) to register new pools, change weights
 *      of the existing pools, removing the pools (by changing their weights to zero)
 *
 * @dev The factory requires ROLE_TOKEN_CREATOR permission on the Moda token to mint yield
 *      (see `mintYieldTo` function)
 *
 * @author Kevin Brown, based on Illuvium Pool Factory Contract by Pedro Bergamini, reviewed by Basil Gorin
 */
contract ModaPoolFactory is Ownable, ModaAware {
    // @dev FACTORY_UID defined to add another check to ensure compliance with the contract.
	function FACTORY_UID() public pure returns (uint256) {
		return ModaConstants.FACTORY_UID;
	}

    /// @dev Auxiliary data structure used only in getPoolData() view function
    struct PoolData {
        // @dev pool token address (like ILV)
        address poolToken;
        // @dev pool address (like deployed core pool instance)
        address poolAddress;
        // @dev pool weight (200 for ILV pools, 800 for ILV/ETH pools - set during deployment)
        uint32 weight;
        // @dev flash pool flag
        bool isFlashPool;
    }

    /**
     * @dev Moda/second determines yield farming reward base
     *      used by the yield pools controlled by the factory
     */
    uint256 public modaPerSecond;

    /**
     * @dev The yield is distributed proportionally to pool weights;
     *      total weight is here to help in determining the proportion
     */
    uint32 public totalWeight;

    /**
     * @dev Moda/second decreases by 3% every period;
     *      an update is triggered by executing `updateModaPerSecond` public function
     */
    uint32 public immutable secondsPerUpdate;

    /**
     * @dev End timestamp is the last time when Moda/second can be decreased;
     *      it is implied that yield farming stops after that block
     */
    uint public endTimestamp;

    /**
     * @dev Each time the Moda/second ratio gets updated, the block number
     *      when the operation has occurred gets recorded into `lastRatioUpdate`
     * @dev This block number is then used to check if blocks/update `blocksPerUpdate`
     *      has passed when decreasing yield reward by 3%
     */
    uint256 public lastRatioUpdate;

    /// @dev Maps pool token address (like Moda) -> pool address (like core pool instance)
    mapping(address => address) public pools;

    /// @dev Keeps track of registered pool addresses, maps pool address -> exists flag
    mapping(address => bool) public poolExists;

    /**
     * @dev Fired in createPool() and registerPool()
     *
     * @param _by an address which executed an action
     * @param poolToken pool token address (like ILV)
     * @param poolAddress deployed pool instance address
     * @param weight pool weight
     * @param isFlashPool flag indicating if pool is a flash pool
     */
    event PoolRegistered(
        address indexed _by,
        address indexed poolToken,
        address indexed poolAddress,
        uint64 weight,
        bool isFlashPool
    );

    /**
     * @dev Fired in changePoolWeight()
     *
     * @param _by an address which executed an action
     * @param poolAddress deployed pool instance address
     * @param weight new pool weight
     */
    event WeightUpdated(address indexed _by, address indexed poolAddress, uint32 weight);

    /**
     * @dev Fired in updateModaPerSecond()
     *
     * @param _by an address which executed an action
     * @param newModaPerSecond new Moda/second value
     */
    event ModaRatioUpdated(address indexed _by, uint256 newModaPerSecond);

    /**
     * @dev Creates/deploys a factory instance
     *
     * @param _moda ILV ERC20 token address
     * @param _modaPerSecond initial Moda/second value for rewards
     * @param _secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
     * @param _startTimestamp timestamp to measure _secondsPerUpdate from
     * @param _endTimestamp timestamp when farming stops and rewards cannot be updated anymore
     */
    constructor(
        address _moda,
        uint192 _modaPerSecond,
        uint32 _secondsPerUpdate,
        uint32 _startTimestamp,
        uint32 _endTimestamp
    ) ModaAware(_moda) {
        // verify the inputs are set
        require(_modaPerSecond > 0, "Moda/second not set");
        require(_secondsPerUpdate > 0, "seconds/update not set");
        require(_startTimestamp > 0, "start timestamp not set");
        require(_endTimestamp > _endTimestamp, "invalid end timestamp: must be greater than init timestamp");

        // save the inputs into internal state variables
        modaPerSecond = _modaPerSecond;
        secondsPerUpdate = _secondsPerUpdate;
        lastRatioUpdate = _startTimestamp;
        endTimestamp = _endTimestamp;
    }

    /**
     * @notice Given a pool token retrieves corresponding pool address
     *
     * @dev A shortcut for `pools` mapping
     *
     * @param poolToken pool token address (like Moda) to query pool address for
     * @return pool address for the token specified
     */
    function getPoolAddress(address poolToken) external view returns (address) {
        // read the mapping and return
        return pools[poolToken];
    }

    /**
     * @notice Reads pool information for the pool defined by its pool token address,
     *      designed to simplify integration with the front ends
     *
     * @param _poolToken pool token address to query pool information for
     * @return pool information packed in a PoolData struct
     */
    function getPoolData(address _poolToken) public view returns (PoolData memory) {
        // get the pool address from the mapping
        address poolAddr = pools[_poolToken];

        // throw if there is no pool registered for the token specified
        require(poolAddr != address(0), "pool not found");

        // read pool information from the pool smart contract
        // via the pool interface (IPool)
        address poolToken = IPool(poolAddr).poolToken();
        bool isFlashPool = IPool(poolAddr).isFlashPool();
        uint32 weight = IPool(poolAddr).weight();

        // create the in-memory structure and return it
        return PoolData({ poolToken: poolToken, poolAddress: poolAddr, weight: weight, isFlashPool: isFlashPool });
    }

    /**
     * @dev Verifies if `blocksPerUpdate` has passed since last Moda/second
     *      ratio update and if Moda/second reward can be decreased by 3%
     *
     * @return true if enough time has passed and `updateModaPerSecond` can be executed
     */
    function shouldUpdateRatio() public view returns (bool) {
        // if yield farming period has ended
        if (block.timestamp > endTimestamp) {
            // Moda/second reward cannot be updated anymore
            return false;
        }

        // check if seconds/update have passed since last update
        return block.timestamp >= lastRatioUpdate + secondsPerUpdate;
    }

    /**
     * @dev Creates a core pool (ModaCorePool) and registers it within the factory
     *
     * @dev Can be executed by the pool factory owner only
     *
     * @param startTimestamp init timestamp to be used for the pool creation time
     * @param weight weight of the pool to be created
     */
    function createCorePool(
        uint256 startTimestamp,
        uint32 weight
    ) external virtual onlyOwner {
        // create/deploy new core pool instance
        IPool pool = new ModaCorePool(moda, address(this), weight, startTimestamp);

        // register it within this factory
        registerPool(address(pool));
    }

    /**
     * @dev Registers an already deployed pool instance within the factory
     *
     * @dev Can be executed by the pool factory owner only
     *
     * @param poolAddr address of the already deployed pool instance
     */
    function registerPool(address poolAddr) public onlyOwner {
        // read pool information from the pool smart contract
        // via the pool interface (IPool)
        address poolToken = IPool(poolAddr).poolToken();
        bool isFlashPool = IPool(poolAddr).isFlashPool();
        uint32 weight = IPool(poolAddr).weight();

        // ensure that the pool is not already registered within the factory
        require(pools[poolToken] == address(0), "this pool is already registered");

        // create pool structure, register it within the factory
        pools[poolToken] = poolAddr;
        poolExists[poolAddr] = true;
        // update total pool weight of the factory
        totalWeight += weight;

        // emit an event
        emit PoolRegistered(msg.sender, poolToken, poolAddr, weight, isFlashPool);
    }

    /**
     * @notice Decreases Moda/second reward by 3%, can be executed
     *      no more than once per `blocksPerUpdate` blocks
     */
    function updateModaPerSecond() external {
        // checks if ratio can be updated i.e. if blocks/update (91252 blocks) have passed
        require(shouldUpdateRatio(), "too frequent");

        // decreases ILV/block reward by 3%
        modaPerSecond = (modaPerSecond * 97) / 100;

        // set current block as the last ratio update block
        lastRatioUpdate = block.timestamp;

        // emit an event
        emit ModaRatioUpdated(msg.sender, modaPerSecond);
    }

    /**
     * @dev Mints Moda tokens; executed by Moda Pool only
     *
     * @dev Requires factory to have ROLE_TOKEN_CREATOR permission
     *      on the Moda ERC20 token instance
     *
     * @param _to an address to mint tokens to
     * @param _amount amount of Moda tokens to mint
     */
    function mintYieldTo(address _to, uint256 _amount) external {
        // verify that sender is a pool registered withing the factory
        require(poolExists[msg.sender], "access denied");

        // mint Moda tokens as required
        mintModa(_to, _amount);
    }

    /**
     * @dev Changes the weight of the pool;
     *      executed by the pool itself or by the factory owner
     *
     * @param poolAddr address of the pool to change weight for
     * @param weight new weight value to set to
     */
    function changePoolWeight(address poolAddr, uint32 weight) external {
        // verify function is executed either by factory owner or by the pool itself
        require(msg.sender == owner() || poolExists[msg.sender]);

        // recalculate total weight
        totalWeight = totalWeight + weight - IPool(poolAddr).weight();

        // set the new pool weight
        IPool(poolAddr).setWeight(weight);

        // emit an event
        emit WeightUpdated(msg.sender, poolAddr, weight);
    }
}
