const hh = require("hardhat");

const deploy = async () => {
  const [deployer] = await hh.ethers.getSigners();

  // We get the contract to deploy
  const Token = await hh.ethers.getContractFactory("Token");
  const token = await Token.deploy();

  console.log(`Token deployed to: ${token.address}`);
};

deploy();
