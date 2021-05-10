const { expect } = require("chai");

describe("Token", () => {
  it("Should return total supply once deployed", async () => {
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    
    await token.deployed();
    const expected = ethers.BigNumber.from('10000000000000000000000000')
    expect(await token.totalSupply()).to.equal(expected);
  });
});
