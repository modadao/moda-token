// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EscrowedModaERC20 is ERC20("Escrowed Moda", "sMODA"), AccessControl {
  /**
  * @notice Token creator is responsible for creating (minting)
  *      tokens to an arbitrary address
  * @dev Role ROLE_TOKEN_CREATOR allows minting tokens
  *      (calling `mint` function)
  */
  bytes32 public constant ROLE_TOKEN_CREATOR = "\x00\x01\x00\x00";

  /**
   * @dev Smart contract unique identifier, a random number
   * @dev Should be regenerated each time smart contact source code is changed
   *      and changes smart contract itself is to be redeployed
   * @dev Generated using https://www.random.org/bytes/
   */
  uint256 public constant TOKEN_UID = 0xac3051b8d4f50966afb632468a4f61483ae6a953b74e387a01ef94316d6b7d62;

  /**
   * @notice Must be called by ROLE_TOKEN_CREATOR addresses.
   *
   * @param recipient address to receive the tokens.
   * @param amount number of tokens to be minted.
   */
  function mint(address recipient, uint256 amount) external {
    ///TODO: This role needs to be assigned to the owner or their proxy at initialization of the Token contract.
    require(hasRole(ROLE_TOKEN_CREATOR, msg.sender), "insufficient privileges (ROLE_TOKEN_CREATOR required)");
    _mint(recipient, amount);
  }

  /**
   * @param amount number of tokens to be burned.
   */
  function burn(uint256 amount) external {
    _burn(msg.sender, amount);
  }
}