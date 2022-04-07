// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor (string memory name_, string memory symbol_, uint amountToMint) ERC20(name_, symbol_) {
        setBalance(msg.sender, amountToMint);
    }

    function setBalance(address to, uint amount) public {
        uint old = balanceOf(to);
        if (old < amount) {
            _mint(to, amount - old);
        } else if (old > amount) {
            _burn(to, old - amount);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
