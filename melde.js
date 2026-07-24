/**
 * GET /api/admin/customers
 *
 * Gruppiert alle Meldungen pro Kunde (Objekt-/Kundennummer) und berechnet
 * eine Ampel-Einschätzung — soll früh zeigen, welche Kunden möglicherweise
 * unzufrieden sind bzw. kündigungsgefährdet sein könnten, BEVOR es zur
 * Kündigung kommt.
 *
 * Ampel-Logik (Faustregel, bei Bedarf anpassbar):
 *   ROT   - mind. 3 Reklamationen/Schadenmeldungen in den letzten 90 Tagen,
 *           ODER eine Absage in den letzten 30 Tagen
 *   GELB  - 1-2 Reklamationen/Schadenmeldungen in den letzten 90 Tagen,
 *           ODER 2+ Terminverschiebungen in den letzten 90 Tagen
 *   GRÜN  - alles andere (unauffällig)
 */

const { getSupabase } = require("../../lib/supabase");
const { requireAdmin } = require("../../lib/adminAuth");

function berechneAmpel(meldungenDesKunden) {
  const jetzt = Date.now();
  const tage = (m) => (jetzt - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24);

  const reklamationenSchaeden90 = meldungenDesKunden.filter(
    (m) => (m.kategorie === "reklamation" || m.kategorie === "schaden") && tage(m) <= 90
  ).length;
  const absagen30 = meldungenDesKunden.filter((m) => m.kategorie === "absage" && tage(m) <= 30).length;
  const verschiebungen90 = meldungenDesKunden.filter((m) => m.kategorie === "verschiebung" && tage(m) <= 90).length;

  if (reklamationenSchaeden90 >= 3 || absagen30 >= 1) return "rot";
  if (reklamationenSchaeden90 >= 1 || verschiebungen90 >= 2) return "gelb";
  return "gruen";
}

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabase = getSupabase();
  const { data: meldungen, error } = await supabase
    .from("meldungen")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const proKunde = {};
  for (const m of meldungen) {
    if (!proKunde[m.objekt_id]) {
      proKunde[m.objekt_id] = { objekt_id: m.objekt_id, name: m.name, email: m.email, meldungen: [] };
    }
    proKunde[m.objekt_id].meldungen.push(m);
    // neuesten Namen/E-Mail übernehmen, falls sich mal was geändert hat
    if (new Date(m.created_at) > new Date(proKunde[m.objekt_id].meldungen[0].created_at)) {
      proKunde[m.objekt_id].name = m.name;
      proKunde[m.objekt_id].email = m.email;
    }
  }

  const kunden = Object.values(proKunde).map((k) => {
    const zaehler = { verschiebung: 0, absage: 0, reklamation: 0, schaden: 0, zusatz: 0 };
    let offen = 0;
    for (const m of k.meldungen) {
      zaehler[m.kategorie] = (zaehler[m.kategorie] || 0) + 1;
      if (!m.status || m.status === "neu") offen++;
    }
    return {
      objekt_id: k.objekt_id,
      name: k.name,
      email: k.email,
      total: k.meldungen.length,
      offen,
      zaehler,
      letzte_meldung: k.meldungen[0].created_at,
      ampel: berechneAmpel(k.meldungen),
      meldungen: k.meldungen,
    };
  });

  // Auffälligste Kunden (rot vor gelb vor grün) zuerst, dann nach letzter Aktivität
  const ampelRang = { rot: 0, gelb: 1, gruen: 2 };
  kunden.sort((a, b) => {
    if (ampelRang[a.ampel] !== ampelRang[b.ampel]) return ampelRang[a.ampel] - ampelRang[b.ampel];
    return new Date(b.letzte_meldung) - new Date(a.letzte_meldung);
  });

  res.status(200).json({ kunden });
};
