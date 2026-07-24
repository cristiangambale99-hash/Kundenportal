const { Resend } = require("resend");

const KATEGORIE_LABEL = {
  verschiebung: "Terminverschiebung",
  absage: "Absage",
  reklamation: "Reklamation",
  schaden: "Schadenmeldung",
  zusatz: "Zusatzauftrag-Anfrage",
};

// "Was passiert jetzt" - wird in die Kundenbestätigung eingebaut, damit klar ist,
// womit der Kunde rechnen kann (Frist, nächster Schritt).
const NAECHSTE_SCHRITTE = {
  verschiebung: "Wir prüfen Ihren Wunschtermin und melden uns per E-Mail, sobald er bestätigt ist.",
  absage: "Die Absage ist hiermit bestätigt.",
  reklamation: "Wir melden uns innert 2 Arbeitstagen mit einer Rückmeldung zu Ihrer Reklamation.",
  schaden: "Wir melden uns innert 2 Arbeitstagen mit einer ersten Einschätzung.",
  zusatz: "Wir melden uns mit einer Offerte bzw. einem Terminvorschlag.",
};

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY ist nicht gesetzt.");
  return new Resend(apiKey);
}

/** Interne Mail ans Putzfrauenservice-Team - läuft für JEDE Meldung. */
async function sendeTeamMail(meldung) {
  const resend = resendClient();
  const label = KATEGORIE_LABEL[meldung.kategorie] || meldung.kategorie;

  const html = `
    <h2>${label} über das Kundenportal</h2>
    <p><strong>Name:</strong> ${meldung.name || "-"}</p>
    <p><strong>Objekt-/Kundennummer:</strong> ${meldung.objekt_id || "-"}</p>
    <p><strong>E-Mail:</strong> ${meldung.email || "-"}</p>
    <p><strong>Kategorie:</strong> ${label}</p>
    <pre style="white-space:pre-wrap; font-family:inherit;">${meldung.details || ""}</pre>
    <p style="margin-top:16px;"><a href="https://kundenportal-two.vercel.app/admin.html">Im Admin-Bereich öffnen</a></p>
  `;

  return resend.emails.send({
    from: "Kundenportal <kundenportal@clean-service.ch>",
    to: "putzfrauenservice@clean-service.ch",
    subject: `[Kundenportal] ${label} – ${meldung.name || meldung.objekt_id || "Kunde"}`,
    html,
  });
}

/**
 * Bestätigung an den KUNDEN selbst.
 * Wird direkt beim Absenden verschickt für Kategorien, die keine inhaltliche
 * Prüfung durch das Team brauchen (aktuell: Absage). Für die anderen
 * Kategorien (Verschiebung, Reklamation, Schaden, Zusatzauftrag) schickt das
 * Team die inhaltliche Rückmeldung später selbst aus dem Admin-Bereich -
 * hier geht trotzdem eine kurze Eingangsbestätigung raus, damit der Kunde
 * weiss, dass seine Meldung angekommen ist.
 */
async function sendeKundenBestaetigung(meldung) {
  if (!meldung.email) return { skipped: true, reason: "keine E-Mail-Adresse angegeben" };

  const resend = resendClient();
  const label = KATEGORIE_LABEL[meldung.kategorie] || meldung.kategorie;
  const naechsterSchritt = NAECHSTE_SCHRITTE[meldung.kategorie] || "";

  const html = `
    <p>Guten Tag ${meldung.name || ""}</p>
    <p>Wir haben Ihre Meldung <strong>„${label}"</strong> erhalten.</p>
    <p>${naechsterSchritt}</p>
    <p style="color:#767676; font-size:13px; margin-top:24px;">
      Clean Service Scaramuzzo AG · Industriestrasse 5 · 8307 Effretikon · 0844 355 355
    </p>
  `;

  return resend.emails.send({
    from: "Clean Service Scaramuzzo AG <kundenportal@clean-service.ch>",
    to: meldung.email,
    subject: `Ihre ${label} bei Clean Service Scaramuzzo AG`,
    html,
  });
}

/**
 * Individuelle Rückmeldung vom Admin-Bereich aus (Terminverschiebung
 * akzeptieren/ablehnen, Reklamation beantworten etc.) - ersetzt das manuelle
 * Verfassen einer separaten Mail.
 */
async function sendeAdminAntwort({ email, name, betreff, nachricht }) {
  if (!email) throw new Error("Keine E-Mail-Adresse für diese Meldung hinterlegt.");

  const resend = resendClient();
  const html = `
    <p>Guten Tag ${name || ""}</p>
    <p style="white-space:pre-wrap;">${nachricht}</p>
    <p style="color:#767676; font-size:13px; margin-top:24px;">
      Clean Service Scaramuzzo AG · Industriestrasse 5 · 8307 Effretikon · 0844 355 355
    </p>
  `;

  return resend.emails.send({
    from: "Clean Service Scaramuzzo AG <kundenportal@clean-service.ch>",
    to: email,
    subject: betreff || "Rückmeldung zu Ihrer Meldung",
    html,
  });
}

module.exports = { sendeTeamMail, sendeKundenBestaetigung, sendeAdminAntwort, KATEGORIE_LABEL };
