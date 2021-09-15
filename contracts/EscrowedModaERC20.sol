// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import './ModaConstants.sol';

contract EscrowedModaERC20 is ERC20('Escrowed Moda', 'sMODA'), AccessControl, Ownable {
	function ESCROWTOKEN_UID() public pure returns (uint256) {
		return ModaConstants.ESCROWTOKEN_UID;
	}

	constructor() {
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
	 * @notice Must be called by ROLE_TOKEN_CREATOR addresses.
	 *
	 * @param recipient address to receive the tokens.
	 * @param amount number of tokens to be minted.
	 */
	function mint(address recipient, uint256 amount)
		external
		onlyRole(ModaConstants.ROLE_TOKEN_CREATOR)
	{
		_mint(recipient, amount);
	}

	/**
	 * @param amount number of tokens to be burned.
	 */
	function burn(uint256 amount) external {
		_burn(msg.sender, amount);
	}
}
