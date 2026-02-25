const db = require("../db/pool");

async function findUserByUsername(username) {
  const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
  return rows[0] || null;
}

async function findUserByEmail(email) {
  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0] || null;
}

module.exports = {
  findUserByUsername,
  findUserByEmail
};
