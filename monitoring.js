/**
 * Einfacher Admin-Schutz mit EINEM gemeinsamen Passwort (kein Multi-User-Login
 * mit einzelnen Konten - das wäre der nächste Ausbauschritt, falls ihr das
 * später mit mehreren Zugängen pro Person wollt).
 *
 * Funktionsweise: Passwort eingeben -> Server setzt ein signiertes,
 * HttpOnly-Cookie -> jede weitere Admin-Anfrage prüft dieses Cookie.
 */

const crypto = require("crypto");

const COOKIE_NAME = "admin_session";
const SESSION_HOURS = 12;

function sign(value) {
  const secret = process.env.ADMIN_PASSWORD || "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function createSessionCookie() {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = `${expires}`;
  const signature = sign(payload);
  const value = `${payload}.${signature}`;
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`;
}

function isValidSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;

  const value = match.split("=")[1];
  const [expires, signature] = value.split(".");
  if (!expires || !signature) return false;
  if (sign(expires) !== signature) return false;
  if (Date.now() > Number(expires)) return false;
  return true;
}

/** Für API-Routen: gibt bei fehlender/ungültiger Session direkt eine 401-Antwort zurück. */
function requireAdmin(req, res) {
  if (!isValidSession(req)) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return false;
  }
  return true;
}

module.exports = { createSessionCookie, isValidSession, requireAdmin, COOKIE_NAME };
