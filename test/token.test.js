const { expect } = require("chai");

describe("Token", () => {
  let contract;

  beforeEach(async () => {
    const Token = await ethers.getContractFactory("Token");
    contract = await Token.deploy();
    await contract.deployed();
  });

  it("Should return total supply once deployed", async () => {
    const expected = ethers.BigNumber.from("10000000000000000000000000");
    expect(await contract.totalSupply()).to.equal(expected);
  });

  it("Should have holder count as 2", async () => {
    const expected = ethers.BigNumber.from("2");
    expect(await contract.Count()).to.equal(expected);
  });

  it("Should set holders allocations on deploy", async () => {
    const expected = ethers.BigNumber.from("6500000000000000000000000");
    expect(
      await contract.balanceOf("0x0364eAA7C884cb5495013804275120ab023619A5")
    ).to.equal(expected);
  });

  it("Should transfer 100 tokens from owner", async () => {
    const [owner, addr1] = await ethers.getSigners();
    await contract.connect(owner).transfer(addr1.address, 100);

    const expected = ethers.BigNumber.from("100");
    expect(await contract.balanceOf(addr1.address)).to.equal(expected);
  });
});
