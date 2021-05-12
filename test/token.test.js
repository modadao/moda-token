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
    expect(await token.Count()).to.equal(expected);
  });

  it("Should set holders allocations on deploy", async () => {
    const expected = ethers.BigNumber.from('10000000000000000000000000')
    expect(await token.balanceOf("0x0364eAA7C884cb5495013804275120ab023619A5")).to.equal(expected);
  });
});
