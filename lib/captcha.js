/**
 * Verifiziert ein Cloudflare-Turnstile-Captcha-Token serverseitig.
 *
 * Warum Turnstile: kostenlos, DSGVO-freundlicher als reCAPTCHA (kein Google-
 * Tracking), und für Endnutzer meist unsichtbar (kein "Wähle alle Ampeln aus").
 *
 * Setup (einmalig, ca. 5 Minuten):
 *   1. https://dash.cloudflare.com/?to=/:account/turnstile → "Add site"
 *   2. Domain eintragen (die Vercel-URL bzw. später eure eigene Domain)
 *   3. Site Key → ins Frontend (public/index.html)
 *      Secret Key → als TURNSTILE_SECRET_KEY in Vercel Environment Variables
 */

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Falls Turnstile noch nicht eingerichtet ist, nicht blockieren -
    // aber deutlich im Log markieren, damit es nicht unbemerkt bleibt.
    console.warn("TURNSTILE_SECRET_KEY fehlt - Captcha-Prüfung wird übersprungen.");
    return { success: true, skipped: true };
  }
  if (!token) {
    return { success: false, error: "Kein Captcha-Token übermittelt." };
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);
  if (ip) params.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: params,
  });
  const data = await resp.json();
  return { success: !!data.success, raw: data };
}

module.exports = { verifyTurnstile };
