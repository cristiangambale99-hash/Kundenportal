/**
 * GET /api/admin/stats
 * Einfache Kennzahlen für den Admin-Bereich - bewusst schlank gehalten
 * (Zähler/Tabellen, keine grafischen Charts), aber alles auf echten Daten.
 */

const { getSupabase } = require("../../lib/supabase");
const { requireAdmin } = require("../../lib/adminAuth");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabase = getSupabase();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: meldungen, error } = await supabase
    .from("meldungen")
    .select("kategorie, status, created_at")
    .gte("created_at", since30d);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const proKategorie = {};
  const proTag = {};
  let offen = 0;

  for (const m of meldungen) {
    proKategorie[m.kategorie] = (proKategorie[m.kategorie] || 0) + 1;
    const tag = m.created_at.slice(0, 10);
    proTag[tag] = (proTag[tag] || 0) + 1;
    if (!m.status || m.status === "neu") offen++;
  }

  const { count: fehlversucheCount } = await supabase
    .from("fehlversuche")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since30d);

  res.status(200).json({
    zeitraum_tage: 30,
    total: meldungen.length,
    offen,
    pro_kategorie: proKategorie,
    pro_tag: proTag,
    fehlgeschlagene_versuche: fehlversucheCount || 0,
  });
};
