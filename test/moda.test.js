const Token = artifacts.require("Token");

const {
  BN,
  expectEvent,
  expectRevert,
  time,
  constants: { ZERO_ADDRESS },
} = require("@openzeppelin/test-helpers");

const { expect } = require("chai");

contract("Token", (accounts) => {
  let token;

  beforeEach(async () => {
    token = await Token.new();
  });

  describe("deployment", () => {
    it("should get standard ERC20 properties", async () => {
      const symbol = await token.symbol();
      expect(symbol).to.be.equal("MODA");

      const name = await token.name();
      expect(name).to.be.equal("moda");

      const decimals = new BN("18");
      const expected = new BN("10000000").mul(new BN("10").pow(decimals));

      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.be.bignumber.equal(expected);
    });

    it("should have holder count as 1", async () => {
      const actual = await token.holderCount();
      const expected = new BN("1");

      expect(actual).to.be.bignumber.equal(expected);
    });
  });
});
