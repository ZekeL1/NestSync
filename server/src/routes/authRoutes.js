const express = require("express");
const { loginWithAuth } = require("../services/loginService");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, email, password } = req.body || {};
  const principal = username || email;
  const result = await loginWithAuth(principal, password);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json(result.data);
});

module.exports = router;
