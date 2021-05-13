const { expect } = require("chai");

describe("Members", () => {
  let contract;
  let token;

  beforeEach(async() => {
    const foundation = "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B";

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.deployed();

    const Members = await ethers.getContractFactory("Members");
    const contract = await Members.deploy(token.address);
    await contract.deployed();
  })

  it("Should have 1 member when accepted", async () => {
    const [owner, addr1] = await ethers.getSigners();
    await token.connect(owner).transfer(addr1.address, 100);

    const expected = ethers.BigNumber.from("1")
    expect(await contract.Count()).to.equal(expected);
  });
});
