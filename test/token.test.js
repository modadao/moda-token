const { expect } = require("chai");

describe("Token", () => {
  let token;

  beforeEach(async() => {
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.deployed();
  })

  it("Should return total supply once deployed", async () => {
    const expected = ethers.BigNumber.from('10000000000000000000000000')
    expect(await token.totalSupply()).to.equal(expected);
  });

  it("Should have holder count as 1", async () => {
    const expected = ethers.BigNumber.from('1')
    expect(await token.holderCount()).to.equal(expected);
  });
});
