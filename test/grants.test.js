const { expect } = require("chai");

describe("Grants", () => {

  let contract;

  beforeEach(async() => {
    const foundation = "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B";
    
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    await token.deployed();

    const Grants = await ethers.getContractFactory("Grants");
    contract = await Grants.deploy(token.address, foundation);
    await contract.deployed();
  })

  it("Should return total supply once deployed", async () => {
    const expected = ethers.BigNumber.from("0");
    expect(await contract.Count()).to.equal(expected);
  });
});
