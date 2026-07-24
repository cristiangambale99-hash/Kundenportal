/**
 * POST /api/melde
 *
 * Nimmt eine Meldung aus dem Kundenportal entgegen (Terminverschiebung, Absage,
 * Reklamation, Schadenmeldung, Zusatzauftrag) und:
 *   1. speichert sie in Supabase (Tabelle "meldungen")
 *   2. schickt IMMER eine E-Mail an putzfrauenservice@clean-service.ch
 *   3. schickt ZUSÄTZLICH eine Beekeeper-Nachricht in den passenden
 *      Gruppenchat, falls für die Objekt-/Kundennummer eine Zuordnung existiert
 *
 * Schritt 3 ist "best effort": schlägt Beekeeper fehl oder gibt es (noch) keine
 * Zuordnung, wird die Anfrage trotzdem als Erfolg beantwortet — die E-Mail ist
 * und bleibt der verlässliche Kanal.
 */

const { getSupabase } = require("../lib/supabase");
const { sendeTeamMail } = require("../lib/email");
const { sendGroupMessage } = require("../lib/beekeeper");

const ERLAUBTE_KATEGORIEN = ["verschiebung", "absage", "reklamation", "schaden", "zusatz"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { kategorie, name, objekt_id, details } = req.body || {};

  if (!kategorie || !ERLAUBTE_KATEGORIEN.includes(kategorie)) {
    res.status(400).json({ error: `Ungültige oder fehlende Kategorie. Erlaubt: ${ERLAUBTE_KATEGORIEN.join(", ")}` });
    return;
  }
  if (!name || !objekt_id) {
    res.status(400).json({ error: "Name und Objekt-/Kundennummer sind erforderlich." });
    return;
  }

  const meldung = { kategorie, name, objekt_id, details: details || "" };
  const supabase = getSupabase();

  // 1) In Supabase speichern
  const { data: inserted, error: dbError } = await supabase
    .from("meldungen")
    .insert(meldung)
    .select()
    .single();

  if (dbError) {
    res.status(500).json({ error: `Speichern fehlgeschlagen: ${dbError.message}` });
    return;
  }

  const ergebnis = { id: inserted.id, email: "pending", beekeeper: "pending" };

  // 2) E-Mail ans Team (verlässlicher Kanal, muss durchgehen)
  try {
    await sendeTeamMail(meldung);
    ergebnis.email = "sent";
  } catch (err) {
    ergebnis.email = "error";
    ergebnis.email_detail = err.message;
    // Hier bewusst NICHT abbrechen — die Meldung ist ja schon gespeichert.
  }

  // 3) Beekeeper-Nachricht (best effort, abhängig von der Zuordnungstabelle)
  try {
    const { data: mapping } = await supabase
      .from("objekt_beekeeper_mapping")
      .select("beekeeper_chat_id, status")
      .eq("objekt_id", objekt_id)
      .single();

    if (mapping && mapping.status === "matched" && mapping.beekeeper_chat_id) {
      const label = { verschiebung: "🔄 Terminverschiebung", absage: "❌ Absage", reklamation: "⚠️ Reklamation", schaden: "🔧 Schadenmeldung", zusatz: "✨ Zusatzauftrag-Anfrage" }[kategorie];
      const text = `${label} — ${name} (Objekt ${objekt_id})${details ? `\n${details}` : ""}\n\nÜber das Kundenportal gemeldet.`;
      await sendGroupMessage(mapping.beekeeper_chat_id, text);
      ergebnis.beekeeper = "sent";
    } else {
      ergebnis.beekeeper = "no_mapping";
    }
  } catch (err) {
    ergebnis.beekeeper = "error";
    ergebnis.beekeeper_detail = err.message;
  }

  res.status(200).json(ergebnis);
};
