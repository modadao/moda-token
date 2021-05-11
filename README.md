# modadao-token
ModaDAO Token Contract

# Problem Statement
The music industry is designed to fail. The middlemen who soak up value in the ecosystem have no interest in driving change because these failures line their pockets. Even the most innovative music tech companies start-up trying to serve the needs of the artists end up selling out to big labels or big tech companies.

# Token Solution
A tokenised, music-centered creative technology company and innovation fund, would be able to provide all of the benefits of a traditional music or big tech company, without having to sacrifice its integrity for the benefit of traditional shareholders.

We propose the MODA membership token as a mechanism to unite members at all levels of the foundation from the board to the community. We proposed a ‘path to decentralization’ approach that matures alongside technological and regulatory maturation.

# Contracts
## Token Contract
The token contract is a standard ERC20 contract based off the OpenZepplin framework.  It has been extended to include a holders count as required by our DAPP.

## Members Contract
The members contract is a "role" contract that allows MODA DAO token holders to opt in.  Only token holders can be members, but not all token holders are members.  The EIP was considered too heavy for this DAO https://eips.ethereum.org/EIPS/eip-1261.

## Goverance Contract
The governance contract allows MODA DAO members to propose and vote on issue and directions of the DAO.  Members are not allowed to vote on their own proposal, and can only vote once per issue.

## Grants Contract
The grants contract allows MODA DAO members to apply for grants in MODA DAO tokens.  There is no limit at present to the amount they can apply for.  Each grant has an expiry date and the application description is stored off chain.  The foundation can approve grants within the grant period and transfer the application amount to the proposer. An application costs in MODA DAO tokens.

## Staking Contract
Similar to the grants contract, however users can fund projects that their passionate about and potentailly earn tokens for their contribution.

## Vesting
MODA DAO members can stake their tokens to the foundation, to be used in grant applications.  Token holders are rewarded interest for their amount staked.


## Vesting
Feb - Outlier announcement and governance token launch teaser
Feb - Initial light paper release / private sale round 1
EMT Lock stage 1 (30% MODA BONUS)

### March - Promo/advisors/community build / private sale round 2
EMT Lock stage 2  (20% MODA BONUS)
Emanate native app release

### April - Promo/advisors/community/PR/ private sale round 3
EMT Lock stage 3 (10% MODA BONUS)

### May - Sale registration period/KYC/LBP sale timing (Window according to market conditions)

### June - Sale registration period/KYC/LBP sale timing (Window according to market conditions)
Late stage EMT/MODA SWAP (Community level - no bonus)

### July - Contingency window/full token release
### August - new listings 
### September - Pilot publishing arm launch
### October - NFT standard release
### November - DDEX integration
### December - Begin MODA Protocol build (off EOS)


# Grants


# Techincal
## Node 14.15.4
The dependencies require Node -v 14.15.4

`nvm use 14.15.4`

## Kovan

`npx hardhat node -m carpet dynamic deal utility emerge guide matter child rapid thunder option`

### Compile

`npx hardhat compile`

### Registering a contract on Etherscan

The source code will need to be flattened to register a contract on Etherscan.

## Verify
To verify the contract code:

```bash
cd /path/to/project/files/
yarn run verify Token Grants --network kovan
```
