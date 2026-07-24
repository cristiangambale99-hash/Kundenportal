const { createSessionCookie } = require("../../lib/adminAuth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    res.status(500).json({ error: "ADMIN_PASSWORD ist serverseitig nicht gesetzt." });
    return;
  }

  if (password !== expected) {
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }

  res.setHeader("Set-Cookie", createSessionCookie());
  res.status(200).json({ ok: true });
};
