const Token = artifacts.require("Token");
const Grants = artifacts.require("Grants");

module.exports = async function (deployer) {
  await deployer.deploy(Token);
  const token = await Token.deployed();

  console.log(token.address);

  // 0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B == account[1]
  await deployer.deploy(Grants, token.address, "0x34ac70849AF62a97036b73BcF5A49e17B29Ba19B");
};