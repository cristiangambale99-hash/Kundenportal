const { Resend } = require("resend");

const KATEGORIE_LABEL = {
  verschiebung: "Terminverschiebung",
  absage: "Absage",
  reklamation: "Reklamation",
  schaden: "Schadenmeldung",
  zusatz: "Zusatzauftrag-Anfrage",
};

async function sendeTeamMail(meldung) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY ist nicht gesetzt.");

  const resend = new Resend(apiKey);
  const label = KATEGORIE_LABEL[meldung.kategorie] || meldung.kategorie;

  const html = `
    <h2>${label} über das Kundenportal</h2>
    <p><strong>Name:</strong> ${meldung.name || "-"}</p>
    <p><strong>Objekt-/Kundennummer:</strong> ${meldung.objekt_id || "-"}</p>
    <p><strong>Kategorie:</strong> ${label}</p>
    <pre style="white-space:pre-wrap; font-family:inherit;">${meldung.details || ""}</pre>
  `;

  return resend.emails.send({
    from: "Kundenportal <kundenportal@clean-service.ch>",
    to: "putzfrauenservice@clean-service.ch",
    subject: `[Kundenportal] ${label} – ${meldung.name || meldung.objekt_id || "Kunde"}`,
    html,
  });
}

module.exports = { sendeTeamMail };
