const hre = require("hardhat");

const deploy = async () => {
  const [deployer] = await ethers.getSigners();

  // We get the contract to deploy
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy();

  console.log(`Token deployed to: ${token.address}`);
};

deploy();
