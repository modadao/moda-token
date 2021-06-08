const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("deployments.db");

const sql = "CREATE TABLE transfer (address INT PRIMARY KEY NOT NULL, tx TEXT);";

db.run(sql);
db.close();
