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
    contract = await Members.deploy(token.address);
    await contract.deployed();
  })

  it("Should have 1 member when accepted", async () => {
    const [owner, addr1] = await ethers.getSigners();
    await token.connect(owner).transfer(addr1.address, 100);

    await contract.connect(addr1).accept();

    const expected = ethers.BigNumber.from("1")
    expect(await contract.Count()).to.equal(expected);
    expect(await contract.isMember(addr1.address)).to.be.true;
  });

  it("Should reject an existing member", async () => {
    const [owner, addr1] = await ethers.getSigners();

    await token.connect(owner).transfer(addr1.address, 100);
    await contract.connect(addr1).accept();
    expect(await contract.isMember(addr1.address)).to.be.true;

    await contract.connect(owner).revoke(addr1.address);
    expect(await contract.isMember(addr1.address)).to.be.false;

    const expected = ethers.BigNumber.from("0")
    expect(await contract.Count()).to.equal(expected);
  });
});
