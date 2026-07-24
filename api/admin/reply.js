/**
 * POST /api/admin/reply
 * Body: { id, action: "akzeptieren" | "ablehnen" | "erledigt" | "nachricht", nachricht? }
 *
 * Aktualisiert den Status einer Meldung und schickt bei Bedarf eine E-Mail an
 * den Kunden - ohne dass jemand im Team dafür ein separates Mailprogramm
 * öffnen muss.
 */

const { getSupabase } = require("../../lib/supabase");
const { requireAdmin } = require("../../lib/adminAuth");
const { sendeAdminAntwort, KATEGORIE_LABEL } = require("../../lib/email");

const STANDARD_TEXTE = {
  akzeptieren: "Ihr Wunschtermin wurde bestätigt.",
  ablehnen: "Leider können wir Ihren Wunschtermin nicht wie gewünscht anbieten. Wir melden uns mit einem Alternativvorschlag.",
  erledigt: "Ihre Meldung wurde bearbeitet und ist damit abgeschlossen.",
};

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { id, action, nachricht } = req.body || {};
  if (!id || !action) {
    res.status(400).json({ error: "id und action sind erforderlich." });
    return;
  }

  const supabase = getSupabase();
  const { data: meldung, error: fetchError } = await supabase
    .from("meldungen")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !meldung) {
    res.status(404).json({ error: "Meldung nicht gefunden." });
    return;
  }

  const neuerStatus = action === "nachricht" ? meldung.status : action;
  const text = nachricht || STANDARD_TEXTE[action] || "";
  const label = KATEGORIE_LABEL[meldung.kategorie] || meldung.kategorie;

  let mailStatus = "skipped";
  let mailError = null;
  if (text) {
    try {
      await sendeAdminAntwort({
        email: meldung.email,
        name: meldung.name,
        betreff: `Rückmeldung zu Ihrer ${label}`,
        nachricht: text,
      });
      mailStatus = "sent";
    } catch (err) {
      mailStatus = "error";
      mailError = err.message;
      // Eine fehlgeschlagene Mail soll den Bearbeitungsstatus nicht blockieren -
      // wir aktualisieren trotzdem und melden den Mail-Fehler im Response.
    }
  }

  const { error: updateError } = await supabase
    .from("meldungen")
    .update({ status: neuerStatus, admin_note: text || meldung.admin_note })
    .eq("id", id);

  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  res.status(200).json({ ok: true, mail: mailStatus, mail_error: mailError });
};
