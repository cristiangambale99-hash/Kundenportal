/**
 * Einfaches Rate-Limiting pro IP-Adresse, ohne zusätzliche Infrastruktur —
 * nutzt einfach die "meldungen"-Tabelle, die wir sowieso schon haben.
 *
 * Regel: max. 5 Meldungen pro IP-Adresse innerhalb von 60 Minuten.
 * Das reicht, um Bot-Spam abzufangen, ohne echte Kunden zu behindern
 * (ein Kunde meldet realistischerweise nicht 6x pro Stunde etwas).
 */

const LIMIT = 5;
const WINDOW_MINUTES = 60;

async function checkRateLimit(supabase, ip) {
  if (!ip) return { allowed: true }; // kann in seltenen Fällen fehlen, dann nicht blockieren

  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("meldungen")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if (error) {
    // Rate-Limit-Check darf im Zweifel nie eine echte Meldung blockieren
    return { allowed: true };
  }

  return { allowed: (count || 0) < LIMIT, count: count || 0 };
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

module.exports = { checkRateLimit, getClientIp, LIMIT, WINDOW_MINUTES };
