/**
 * POST /api/melde
 *
 * Nimmt eine Meldung aus dem Kundenportal entgegen (Terminverschiebung, Absage,
 * Reklamation, Schadenmeldung, Zusatzauftrag) und:
 *   0. prüft Captcha, Rate-Limit und ob die Objekt-/Kundennummer echt existiert
 *   1. speichert sie in Supabase (Tabelle "meldungen", Status "neu")
 *   2. schickt IMMER eine interne E-Mail an putzfrauenservice@clean-service.ch
 *   3. schickt bei Absagen SOFORT eine Bestätigung an den Kunden selbst
 *      (Terminverschiebung/Reklamation/Schaden/Zusatzauftrag werden stattdessen
 *      im Admin-Bereich bearbeitet, siehe /api/admin/reply)
 *   4. schickt ZUSÄTZLICH eine Beekeeper-Nachricht in den passenden
 *      Gruppenchat, falls für die Objekt-/Kundennummer eine Zuordnung existiert
 *
 * Schritt 4 ist "best effort": schlägt Beekeeper fehl oder gibt es (noch) keine
 * Zuordnung, wird die Anfrage trotzdem als Erfolg beantwortet — die E-Mail ist
 * und bleibt der verlässliche Kanal.
 */

const { getSupabase } = require("../lib/supabase");
const { sendeTeamMail, sendeKundenBestaetigung } = require("../lib/email");
const { sendGroupMessage } = require("../lib/beekeeper");
const { verifyTurnstile } = require("../lib/captcha");
const { checkRateLimit, getClientIp } = require("../lib/rateLimit");
const { logFehlversuch } = require("../lib/monitoring");

const ERLAUBTE_KATEGORIEN = ["verschiebung", "absage", "reklamation", "schaden", "zusatz"];

// Kategorien, bei denen der Kunde die Bestätigung SOFORT automatisch erhält.
// Die anderen laufen über den Admin-Bereich (Team entscheidet/antwortet erst inhaltlich).
const SOFORT_BESTAETIGEN = ["absage"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { kategorie, name, objekt_id, email, details, captcha_token } = req.body || {};
  const ip = getClientIp(req);
  const supabase = getSupabase();

  if (!kategorie || !ERLAUBTE_KATEGORIEN.includes(kategorie)) {
    await logFehlversuch(supabase, { kategorie, grund: "ungueltige_kategorie", ip });
    res.status(400).json({ error: `Ungültige oder fehlende Kategorie. Erlaubt: ${ERLAUBTE_KATEGORIEN.join(", ")}` });
    return;
  }
  if (!name || !objekt_id || !email) {
    await logFehlversuch(supabase, { kategorie, grund: "pflichtfeld_fehlt", ip });
    res.status(400).json({ error: "Name, Objekt-/Kundennummer und E-Mail-Adresse sind erforderlich." });
    return;
  }

  // 0a) Captcha prüfen
  const captcha = await verifyTurnstile(captcha_token, ip);
  if (!captcha.success) {
    await logFehlversuch(supabase, { kategorie, grund: "captcha_fehlgeschlagen", ip });
    res.status(400).json({ error: "Captcha-Prüfung fehlgeschlagen. Bitte Seite neu laden und erneut versuchen." });
    return;
  }

  // 0b) Rate-Limit prüfen (max. 5 Meldungen/Stunde pro IP)
  const rate = await checkRateLimit(supabase, ip);
  if (!rate.allowed) {
    await logFehlversuch(supabase, { kategorie, grund: "rate_limit", ip });
    res.status(429).json({ error: "Zu viele Meldungen von dieser Verbindung in kurzer Zeit. Bitte später erneut versuchen oder direkt anrufen: 0844 355 355." });
    return;
  }

  // 0c) Objekt-/Kundennummer gegen echte Daten prüfen
  // (Tabelle wird wöchentlich aus dem Aduna-Export befüllt, siehe match_objekte_zu_beekeeper.py)
  const { data: objekt, error: objektError } = await supabase
    .from("objekt_beekeeper_mapping")
    .select("objekt_id")
    .eq("objekt_id", objekt_id)
    .maybeSingle();

  if (objektError) {
    // Wenn die Prüfung selbst technisch scheitert, lieber durchlassen als
    // echte Kunden zu blockieren - aber im Log sichtbar machen.
    console.error("Objektnummer-Prüfung fehlgeschlagen:", objektError.message);
  } else if (!objekt) {
    await logFehlversuch(supabase, { kategorie, grund: "unbekannte_objektnummer", ip });
    res.status(400).json({
      error: "Diese Objekt-/Kundennummer ist uns nicht bekannt. Bitte prüfen Sie die Angabe oder kontaktieren Sie uns direkt: 0844 355 355.",
    });
    return;
  }

  const meldung = { kategorie, name, objekt_id, email, details: details || "", ip, status: "neu" };

  // 1) In Supabase speichern
  const { data: inserted, error: dbError } = await supabase
    .from("meldungen")
    .insert(meldung)
    .select()
    .single();

  if (dbError) {
    await logFehlversuch(supabase, { kategorie, grund: "db_fehler", ip });
    res.status(500).json({ error: `Speichern fehlgeschlagen: ${dbError.message}` });
    return;
  }

  const ergebnis = { id: inserted.id, team_mail: "pending", kunden_mail: "pending", beekeeper: "pending" };

  // 2) Interne E-Mail ans Team (verlässlicher Kanal, muss durchgehen)
  try {
    await sendeTeamMail(meldung);
    ergebnis.team_mail = "sent";
  } catch (err) {
    ergebnis.team_mail = "error";
    ergebnis.team_mail_detail = err.message;
    // Hier bewusst NICHT abbrechen — die Meldung ist ja schon gespeichert.
  }

  // 3) Sofort-Bestätigung an den Kunden (aktuell nur Absage; andere Kategorien
  //    laufen über den Admin-Bereich, siehe Kommentar oben)
  if (SOFORT_BESTAETIGEN.includes(kategorie)) {
    try {
      await sendeKundenBestaetigung(meldung);
      ergebnis.kunden_mail = "sent";
    } catch (err) {
      ergebnis.kunden_mail = "error";
      ergebnis.kunden_mail_detail = err.message;
    }
  } else {
    ergebnis.kunden_mail = "wird_im_admin_bereich_beantwortet";
  }

  // 4) Beekeeper-Nachricht (best effort, abhängig von der Zuordnungstabelle)
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
