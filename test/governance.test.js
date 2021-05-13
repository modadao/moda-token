const { expect } = require("chai");

describe("Governance", () => {
  let contract;

  beforeEach(async() => {
    const foundation = "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B";

    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    await token.deployed();

    const Grants = await ethers.getContractFactory("Grants");
    const grants = await Grants.deploy(token.address, foundation);
    await grants.deployed();

    const Members = await ethers.getContractFactory("Members");
    const members = await Members.deploy(token.address);
    await members.deployed();

    const [owner, addr1] = await ethers.getSigners();

    // Transfer tokens and accept as a member
    await token.connect(foundation).transfer(addr1.address, 100);
    await members.connect(addr1).accept();

    const Governance = await ethers.getContractFactory("Governance");
    contract = await Governance.deploy(token.address, foundation, members.address);
    await contract.deployed();
  })

  it.skip("Should have 0 proposals when deployed", async () => {
    // const expected = ethers.BigNumber.from("0");
    const actual = await contract.proposals();

    // console.log(actual);
    // expect(await contract.Count()).to.equal(expected);
  });

  it("Should allow members to add proposal", async () => {
    const [owner, addr1] = await ethers.getSigners();
    await contract.connect(addr1).addProposal("Unit test");

  });
});
