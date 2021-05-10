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
