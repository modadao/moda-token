const hh = require("hardhat");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const deploy = async () => {
  const db = new sqlite3.Database("deployments.db", sqlite3.OPEN_CREATE);
  const [deployer] = await hh.ethers.getSigners();

  // We get the contract to deploy
  const Token = await hh.ethers.getContractFactory("Token");
  const token = await Token.deploy();

  console.log(`Token deployed to: ${token.address}`);

  const rawdata = fs.readFileSync("emanate.json");
  const accounts = JSON.parse(rawdata);

  for (const account of accounts) {
    const sql = `SELECT tx FROM transfer WHERE Address = ?`;
    const result = await db.query(sql, [account.address]);

    console.log(result.rows);

    // db.serialize(() => {
    //   db.get(sql, [account.address], (err, row) => {
    //     if (err) {
    //       console.error(err.message);
    //     }
    //     // console.log(row.id + "\t" + row.name);
    //     console.log(row.id);
    //   });
    // });

    // const tx = await token.mint(account.address, accounts.amount);
    // console.log(account);
  }

  db.close();
};

deploy();
