// const Token = artifacts.require("Token");
// const Grants = artifacts.require("Grants");

// const {
//   BN,
//   expectEvent,
//   expectRevert,
//   time,
//   constants: { ZERO_ADDRESS },
// } = require("@openzeppelin/test-helpers");

// const { expect } = require("chai");

// contract("Grants", (accounts) => {
//   let grants;

//   beforeEach(async () => {
//     const token = await Token.new();
//     grants = await Grants.new(token.address, "");
//   });

//   describe("properties", () => {
//     it("should have holder count as 0", async () => {
//       const actual = await grants.grantsCount();
//       const expected = new BN("0");

//       expect(actual).to.be.bignumber.equal(expected);
//     });
//   });
// });

const { expect } = require("chai");

const foundation = "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B";

describe("Grants", () => {

  let grants;

  beforeEach(async() => {
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    await token.deployed();

    const Grants = await ethers.getContractFactory("Grants");
    grants = await Grants.deploy(token.address, foundation);
    await grants.deployed();
  })

  it("Should return total supply once deployed", async () => {
    const expected = ethers.BigNumber.from("0");
    expect(await grants.grantsCount()).to.equal(expected);
  });
});
