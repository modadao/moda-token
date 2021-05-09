const Token = artifacts.require("Token");
const Grants = artifacts.require("Grants");

const {
  BN,
  expectEvent,
  expectRevert,
  time,
  constants: { ZERO_ADDRESS },
} = require("@openzeppelin/test-helpers");

const { expect } = require("chai");

contract("Grants", (accounts) => {
  let grants;

  beforeEach(async () => {
    const token = await Token.new();
    grants = await Grants.new(token.address, "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B");
  });

  describe("properties", () => {
    it("should have holder count as 0", async () => {
      const actual = await grants.grantsCount();
      const expected = new BN("0");

      expect(actual).to.be.bignumber.equal(expected);
    });
  });
});
