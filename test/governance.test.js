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
    await members.accept(addr1.address);

    const Governance = await ethers.getContractFactory("Governance");
    contract = await Governance.deploy(token.address, foundation, members.address);
    await contract.deployed();
  })

  // it("Should have 0 proposals when deployed", async () => {
  //   const expected = ethers.BigNumber.from("0")
  //   expect(await contract.Count()).to.equal(expected);
  // });

  // it("Should not allow non members to add proposal", async () => {
  //   expect(await contract.Count()).to.equal(expected);
  // });
});
