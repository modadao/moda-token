import { BigNumber } from '@ethersproject/bignumber';
import { BlockForkEvent } from '@ethersproject/contracts/node_modules/@ethersproject/abstract-provider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { EscrowedModaERC20, ModaCorePool, Token } from '../typechain';
import { add, addTimestamp, fastForward, fromTimestamp } from './utils';

function toEth(amount: string): BigNumber {
	return ethers.utils.parseEther(amount);
}
const ROLE_TOKEN_CREATOR = [
	0, 0xa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const ROLE_POOL_STAKING = [
	0, 0xb, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

const BNZero: BigNumber = BigNumber.from(0);
const address0 = '0x0000000000000000000000000000000000000000';

type Deposit = Array<unknown>;

const MILLIS: number = 1000;
const HOUR: number = 60 * 60 * MILLIS;
const DAY: number = 24 * HOUR;
const YEAR: number = 365 * DAY;

describe('Core Pool Rewards', () => {
	let token: Token;
	let escrowToken: EscrowedModaERC20;
	let corePool: ModaCorePool;
	let start = new Date();
	let owner: SignerWithAddress, user0: SignerWithAddress, user1: SignerWithAddress;
	let addr: string[];
	let userBalances = [toEth('6500000'), toEth('3500000')];

	function logSetup() {
		console.log('Owner', owner.address);
		console.log('Users', addr);
		console.log('Token', token.address);
		console.log('Escrow Token', escrowToken.address);
		console.log('Core Pool', corePool.address);
	}

	beforeEach(async () => {
		let currentBlock = await ethers.provider.getBlock(ethers.provider.getBlockNumber());
		start = fromTimestamp(currentBlock.timestamp);

		[owner, user0, user1] = await ethers.getSigners();
		addr = [user0.address, user1.address];

		const tokenFactory = await ethers.getContractFactory('Token');
		token = (await upgrades.deployProxy(tokenFactory, [addr, userBalances], {
			kind: 'uups',
		})) as Token;
		await token.deployed();

		const escrowTokenFactory = await ethers.getContractFactory('EscrowedModaERC20');
		escrowToken = (await escrowTokenFactory.deploy()) as EscrowedModaERC20;
		await escrowToken.deployed();

		const nextBlock = (await ethers.provider.getBlockNumber()) + 1;
		//console.log(`Block number: ${nextBlock}`);
		const corePoolFactory = await ethers.getContractFactory('ModaCorePool');
		corePool = (await corePoolFactory.deploy(
			token.address, // moda MODA ERC20 Token ModaERC20 address
			address0, // This is a modaPool, so set to zero.
			escrowToken.address, // smoda sMODA ERC20 Token EscrowedModaERC20 address
			token.address, // poolToken token the pool operates on, for example MODA or MODA/ETH pair
			100, // weight number representing a weight of the pool, actual weight fraction is calculated as that number divided by the total pools weight and doesn't exceed one
			150000 * 216000, // modaPerBlock initial MODA/block value for rewards
			1, // blocksPerUpdate how frequently the rewards gets updated (decreased by 3%), blocks
			nextBlock, // initBlock initial block used to calculate the rewards
			nextBlock + 3672000 // endBlock block number when farming stops and rewards cannot be updated anymore
		)) as ModaCorePool;
		await corePool.deployed();

		await token.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
		await escrowToken.grantPrivilege(ROLE_TOKEN_CREATOR, corePool.address);
	});

	it('Should allow a user to stake (unlocked) amount continue calling processRewards(to sMODA)', async () => {
		//logSetup();
		// Set up the balance first
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0]);

		// Calculate a suitable locking end date
		let endDate: Date = new Date();
		endDate.setTime(start.getTime() + 28 * DAY);
		let lockUntil: BigNumber = BigNumber.from(endDate.getTime()).div(MILLIS);

		//console.log('lockedUntil', lockUntil);
		const amount: BigNumber = BigNumber.from(105);
		await token.connect(user0).approve(corePool.address, amount);
		expect(await token.allowance(addr[0], corePool.address)).to.equal(amount);
		await corePool.connect(user0).stake(amount, BigNumber.from(0), true);

		// Staking moves the user's MODA from the Token contract to the CorePool.
		expect(await token.balanceOf(addr[0])).to.equal(userBalances[0].sub(amount));
		//console.log(contractTx);
		expect(await corePool.getDepositsLength(addr[0])).to.equal(1);
		let [
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BigNumber.from(0));
		expect(tokenAmount).to.equal(amount);
		expect(weight).to.equal(113054760);
		//expect(lockedFrom).to.equal(0);
		expect(lockedUntil).to.equal(lockUntil);
		expect(isYield).to.equal(false);

		interface ROI_Record {
			Deposit: BigNumber;
			Amount: BigNumber;
			Weight: BigNumber;
			MODA: BigNumber;
			SMODA: BigNumber;
		}
		let ReturnsOnInvestment = Array<ROI_Record>();

		let RoI_: ROI_Record = {
			Deposit: BNZero,
			Amount: BNZero,
			Weight: BNZero,
			MODA: BNZero,
			SMODA: BNZero,
		};
		let RoI: ROI_Record = Object.assign({}, RoI_);

		const maxMonths = 17;
		for (let ff = 0; ff < maxMonths; ++ff) {
			// Day after rewards should be available, approximately.
			//console.log('block', await ethers.provider.getBlockNumber());
			let nextMonth: Date = new Date();
			nextMonth.setTime(start.getTime() + ff * 30 * DAY + DAY);
			await fastForward(nextMonth);

			// Collect rewards.
			await corePool.connect(user0).processRewards(false);
			let depositIndex = await corePool.getDepositsLength(addr[0]);
			//console.log('depositIndex', depositIndex);
			RoI.Deposit = depositIndex.sub(1);
			// Examine the tokens this address now owns.
			RoI.MODA = await token.balanceOf(addr[0]);
			RoI.SMODA = await escrowToken.balanceOf(addr[0]);
			[
				tokenAmount, // @dev token amount staked
				weight, //      @dev stake weight
				lockedFrom, //  @dev locking period - from
				lockedUntil, // @dev locking period - until
				isYield, //     @dev indicates if the stake was created as a yield reward
			] = await corePool.getDeposit(addr[0], depositIndex.sub(1));
			expect(isYield).to.equal(true);
			//console.log('weight', weight);
			RoI.Amount = tokenAmount;
			RoI.Weight = weight;
			ReturnsOnInvestment.push(RoI);
			RoI = Object.assign({}, RoI_);
		}
		// Unstake completely after yield farming ends.
		await corePool.connect(user0).unstake(BigNumber.from(0), amount, true);

		// Examine the tokens this address now owns.
		RoI.Deposit = BigNumber.from(maxMonths + 1);
		RoI.MODA = await token.balanceOf(addr[0]);
		RoI.SMODA = await escrowToken.balanceOf(addr[0]);
		[
			tokenAmount, // @dev token amount staked
			weight, //      @dev stake weight
			lockedFrom, //  @dev locking period - from
			lockedUntil, // @dev locking period - until
			isYield, //     @dev indicates if the stake was created as a yield reward
		] = await corePool.getDeposit(addr[0], BigNumber.from(0));
		RoI.Amount = tokenAmount;
		RoI.Weight = weight;
		ReturnsOnInvestment.push(RoI);
		RoI = Object.assign({}, RoI_);

		//console.log(ReturnsOnInvestment);
		/**
		 	Deposit	Staked		Weight				MODA						SMODA
			0x01	60970319999	0x01b1385db2c3bb80	0x05606db4c03408967fff97	0
			0x02	59141088513	0x01a4390368e50480	0x05606db4c03408967fff97	0
			0x03	57366890292	0x01979dc3fb726a00	0x05606db4c03408967fff97	0
			0x04	55645835912	0x018b632f95876400	0x05606db4c03408967fff97	0
			0x05	53976163421	0x017f8611be182280	0x05606db4c03408967fff97	0
			0x06	52356758779	0x01740463b139e980	0x05606db4c03408967fff97	0
			0x07	50786170294	0x0168db816fc0b300	0x05606db4c03408967fff97	0
			0x08	49262744037	0x015e0868cdf90680	0x05606db4c03408967fff97	0
			0x09	47784847224	0x0153882178dd9c00	0x05606db4c03408967fff97	0
			0x0a	46351102658	0x0149582a21c16900	0x05606db4c03408967fff97	0
			0x0b	44960399143	0x013f767d57c1af80	0x05606db4c03408967fff97	0
			0x0c	43611571293	0x0135e0fc6e082280	0x05606db4c03408967fff97	0
			0x0d	42303078064	0x012c94d9c9d21800	0x05606db4c03408967fff97	0
			0x0e	41033922878	0x0123904559c49700	0x05606db4c03408967fff97	0
			0x0f	39802948053	0x011ad124076cbe80	0x05606db4c03408967fff97	0
			0x10	38609328944	0x011255f5d1725800	0x05606db4c03408967fff97	0
			0x11	37449920610	0x010a19023da6b900	0x05606db4c03408967fff97	0
			0x12			  0					 0	0x05606db4c0340896800000	18163086250
		 */
	});
});
