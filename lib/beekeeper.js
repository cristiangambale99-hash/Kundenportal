/**
 * Kleiner Beekeeper-API-Client (Node/Vercel-Version).
 *
 * WICHTIG - bitte vor dem produktiven Einsatz kurz prüfen:
 * Die Endpunkt-Pfade unten sind nach bestem Wissen aus öffentlich zugänglicher
 * Beekeeper-Doku und Community-/Pipedream-Beispielen zusammengestellt. Ich hatte
 * keinen Zugriff auf euer eigenes Beekeeper-Entwicklerportal mit eurem Tenant.
 * Falls ein Aufruf mit 404 zurückkommt: Thomas Odermatt bzw. der Beekeeper-Support
 * bestätigen den exakten Pfad in ein paar Minuten. Auth-Header, Fehlerbehandlung
 * und die restliche Logik sind davon unabhängig und einsatzbereit.
 *
 * Benötigte Umgebungsvariablen:
 *   BEEKEEPER_TENANT_URL   z.B. "https://cleanservice.ch.beekeeper.io"
 *   BEEKEEPER_API_TOKEN    Bot-Token mit Admin-Rechten (Beekeeper Dashboard)
 */

const TENANT_URL = (process.env.BEEKEEPER_TENANT_URL || "").replace(/\/$/, "");
const API_TOKEN = process.env.BEEKEEPER_API_TOKEN || "";

const GROUPS_PATH = "/api/2/groups";
const MESSAGE_PATH = (chatId) => `/api/2/chats/${chatId}/messages`;

function headers() {
  if (!API_TOKEN) {
    throw new Error(
      "BEEKEEPER_API_TOKEN ist nicht gesetzt. Bot-Token im Beekeeper Dashboard " +
        "unter Einstellungen > Integrationen/Bots erstellen."
    );
  }
  return {
    Authorization: `Token ${API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/** Holt alle Gruppenchats (Name + ID) aus Beekeeper, für den wöchentlichen Abgleich. */
async function listGroups(limit = 200) {
  if (!TENANT_URL) throw new Error("BEEKEEPER_TENANT_URL ist nicht gesetzt.");

  const groups = [];
  let offset = 0;

  while (true) {
    const url = `${TENANT_URL}${GROUPS_PATH}?limit=${limit}&offset=${offset}`;
    const resp = await fetch(url, { headers: headers() });
    if (!resp.ok) {
      throw new Error(`Beekeeper list_groups fehlgeschlagen: ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json();
    const items = Array.isArray(data) ? data : data.data || data.results || [];
    if (!items.length) break;
    groups.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return groups;
}

/** Sendet eine vorformulierte Nachricht in einen bestehenden Gruppenchat. */
async function sendGroupMessage(chatId, body) {
  if (!TENANT_URL) throw new Error("BEEKEEPER_TENANT_URL ist nicht gesetzt.");

  const url = `${TENANT_URL}${MESSAGE_PATH(chatId)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ body }),
  });
  if (!resp.ok) {
    throw new Error(`Beekeeper send_group_message fehlgeschlagen: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

module.exports = { listGroups, sendGroupMessage };
