# Kundenportal — testbarer Prototyp (Absage → E-Mail + Beekeeper)

Das ist eine echte, deploybare Version: Formular im Browser → Vercel-Funktion
→ speichert in Supabase → schickt E-Mail via Resend → postet (wenn Zuordnung
vorhanden) eine Nachricht in den passenden Beekeeper-Gruppenchat.

## 1. Voraussetzungen einrichten

**Supabase**
1. Projekt anlegen (oder bestehendes vom Stellenportal mitnutzen, eigenes
   Projekt ist aber sauberer für den Anfang).
2. SQL-Editor öffnen, Inhalt von `supabase_schema.sql` ausführen.
3. Für den ersten Test die Tabelle `objekt_beekeeper_mapping` manuell mit
   1-2 Testzeilen befüllen (siehe Schritt 4), damit du auch den
   Beekeeper-Pfad testen kannst, nicht nur `no_mapping`.

**Resend**
1. Konto/Domain wie beim Stellenportal (kundenportal@clean-service.ch als
   Absender verifizieren, oder eine andere verifizierte Absenderadresse in
   `lib/email.js` eintragen).
2. API-Key erstellen.

**Beekeeper**
1. Bot-Konto mit Admin-Rechten im Beekeeper Dashboard erstellen, Token holen.
2. Tenant-URL notieren (die Adresse, unter der ihr Beekeeper im Browser
   erreicht).

## 2. Projekt deployen

```bash
npm install
npx vercel          # einmalig einloggen/verknüpfen
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_KEY
npx vercel env add RESEND_API_KEY
npx vercel env add BEEKEEPER_TENANT_URL
npx vercel env add BEEKEEPER_API_TOKEN
npx vercel --prod
```

(Alternativ: Projekt bei vercel.com importieren und die Umgebungsvariablen
dort im Dashboard unter Settings > Environment Variables eintragen.)

## 3. Testen

1. Deployte URL öffnen, "Absage" wählen.
2. Name, Objekt-/Kundennummer und Datum ausfüllen, absenden.
3. Erwartetes Verhalten:
   - Browser zeigt die Bestätigungsseite
   - In der Browser-Konsole (F12) siehst du die Rückmeldung, z.B.
     `{ id: 1, email: "sent", beekeeper: "no_mapping" }`
   - In Supabase, Tabelle `meldungen`, erscheint ein neuer Eintrag
   - Bei putzfrauenservice@clean-service.ch (bzw. deiner Testadresse) kommt
     die E-Mail an
4. Für den Beekeeper-Test: in `objekt_beekeeper_mapping` eine Zeile mit der
   von dir eingegebenen Objekt-/Kundennummer und einer echten
   `beekeeper_chat_id` (Gruppenchat-ID) anlegen, Status `matched` setzen,
   dann nochmal absenden — jetzt sollte `beekeeper: "sent"` erscheinen und
   die Nachricht im entsprechenden Gruppenchat auftauchen.

## 4. Woher bekomme ich eine echte Beekeeper-Gruppenchat-ID zum Testen?

Am einfachsten: `python match_objekte_zu_beekeeper.py Objekt_Liste.xlsx`
aus dem separaten `beekeeper-integration`-Paket einmal laufen lassen (siehe
vorheriger Austausch) — das befüllt `objekt_beekeeper_mapping` automatisch
für alle Objekte aus eurer Aduna-Excel-Liste.

## 5. Was hier bewusst noch NICHT drin ist

- Aduna-Anbindung (wartet auf Thomas' Rückmeldung zur Feldstruktur)
- Foto-Upload-Speicherung für Reklamation/Schadenmeldung (Feld existiert im
  Formular, wird aber im Request aktuell nicht mitgeschickt — das braucht
  noch einen Upload-Endpoint mit Supabase Storage)
- Captcha / Rate-Limiting / Objektnummer-Validierung gegen echte Daten
- Admin-Login

## Offener Punkt zur Beekeeper-API

Wie beim letzten Mal erwähnt: Die Endpunkt-Pfade in `lib/beekeeper.js`
(`/api/2/groups`, `/api/2/chats/{id}/messages`) stammen aus öffentlicher Doku
und Community-Beispielen, nicht aus eurem eigenen Entwicklerportal. Bei einem
404 beim ersten Testlauf: Thomas Odermatt oder der Beekeeper-Support können
den exakten Pfad in wenigen Minuten bestätigen.
