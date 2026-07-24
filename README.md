# Kundenportal — testbarer Prototyp

Formular im Browser → Vercel-Funktion → speichert in Supabase → schickt
E-Mail via Resend → postet (wenn Zuordnung vorhanden) eine Nachricht in den
passenden Beekeeper-Gruppenchat → Admin-Bereich zur Bearbeitung/Antwort.

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

**Admin-Passwort**
Ein selbstgewähltes, sicheres Passwort für den Admin-Bereich (siehe Schritt 6).

## 2. Projekt deployen

```bash
npm install
npx vercel          # einmalig einloggen/verknüpfen
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_KEY
npx vercel env add RESEND_API_KEY
npx vercel env add BEEKEEPER_TENANT_URL
npx vercel env add BEEKEEPER_API_TOKEN
npx vercel env add ADMIN_PASSWORD
npx vercel env add TURNSTILE_SECRET_KEY
npx vercel --prod
```

(Alternativ: Projekt bei vercel.com importieren und die Umgebungsvariablen
dort im Dashboard unter Settings > Environment Variables eintragen.)

## 3. Testen

1. Deployte URL öffnen, "Absage" wählen.
2. Name, Objekt-/Kundennummer, E-Mail und Datum ausfüllen, absenden.
3. Erwartetes Verhalten:
   - Browser zeigt die Bestätigungsseite mit "was passiert jetzt"-Hinweis
   - In der Browser-Konsole (F12) siehst du die Rückmeldung, z.B.
     `{ id: 1, team_mail: "sent", kunden_mail: "sent", beekeeper: "no_mapping" }`
   - In Supabase, Tabelle `meldungen`, erscheint ein neuer Eintrag
   - Bei putzfrauenservice@clean-service.ch UND bei der eingegebenen
     Kunden-Mailadresse kommt je eine E-Mail an (bei Absage)
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

## 5. Sicherheit & Missbrauchsschutz

**Captcha (Cloudflare Turnstile)**
1. Auf https://dash.cloudflare.com/?to=/:account/turnstile ein neues Widget anlegen,
   Domain = eure Vercel-URL (bzw. später eure eigene Domain)
2. Den **Site Key** in `public/index.html` eintragen, ersetze
   `TURNSTILE_SITE_KEY_HIER_EINTRAGEN` mit dem echten Wert
3. Den **Secret Key** als `TURNSTILE_SECRET_KEY` bei Vercel eintragen
4. Ohne diesen Schritt läuft das Portal trotzdem (Captcha wird dann übersprungen,
   mit Warnung im Server-Log) — für den produktiven Einsatz aber nachholen

**Objektnummer-Validierung**
Läuft automatisch über die Tabelle `objekt_beekeeper_mapping` — die wird ja
sowieso wöchentlich per `match_objekte_zu_beekeeper.py` aus der Aduna-Excel-Liste
befüllt. Eine Objekt-/Kundennummer, die dort nicht vorkommt, wird jetzt beim
Absenden abgelehnt. Wichtig: Ohne diesen wöchentlichen Import ist die Tabelle
leer, und **jede** Nummer würde abgelehnt — also vor dem produktiven Einsatz
einmal laufen lassen.

**Rate-Limiting**
Läuft automatisch mit, max. 5 Meldungen pro Stunde pro IP-Adresse. Kein
zusätzliches Setup nötig, nutzt die bestehende `meldungen`-Tabelle.

## 6. Admin-Bereich, Kundenbestätigung & Analytics

**Admin-Login einrichten**
- In Vercel die Env-Variable `ADMIN_PASSWORD` setzen (ein selbstgewähltes,
  sicheres Passwort — das ist aktuell EIN gemeinsames Passwort fürs Team, kein
  Login pro Person)
- Danach unter `/admin.html` erreichbar (auch verlinkt ganz unten im Footer
  des Kundenportals, als kleiner, kaum sichtbarer Link)

**Was der Admin-Bereich zeigt**
- Alle Meldungen, filterbar nach Kategorie/Status
- Bei Terminverschiebung: Akzeptieren/Ablehnen-Buttons, die automatisch eine
  passende E-Mail an den Kunden schicken
- Bei Reklamation/Schadenmeldung/Zusatzauftrag: Freitextfeld für eine kurze
  Antwort, die direkt als Mail rausgeht — kein separates Mailprogramm nötig
- Statistik-Kacheln: Meldungen (30 Tage), offen, pro Kategorie, fehlgeschlagene
  Versuche (Captcha/Rate-Limit/unbekannte Objektnummer)

**Kundenbestätigung**
- Absagen: automatische Bestätigungsmail direkt beim Absenden
- Alle anderen Kategorien: Bestätigung/Antwort kommt aus dem Admin-Bereich,
  sobald jemand vom Team reagiert

## 7. Was hier bewusst vereinfacht ist

- **Admin-Login** ist ein einzelnes gemeinsames Passwort, kein Login pro
  Mitarbeiter:in mit eigenem Konto
- **Analytics** sind einfache Zähler/Tabellen, keine grafischen Charts oder
  Trend-Verläufe
- **Accessibility**: Skip-Link, Tastaturfokus, Label-Verknüpfung und
  Screenreader-Sprachumschaltung sind eingebaut; eine vollständige Prüfung
  mit echten Screenreadern/Kontrast-Tools habe ich nicht durchgeführt

## 8. Was hier bewusst noch NICHT drin ist

- Aduna-Anbindung (wartet auf Thomas' Rückmeldung zur Feldstruktur)
- Foto-Upload-Speicherung für Reklamation/Schadenmeldung (Feld existiert im
  Formular, wird aber im Request aktuell nicht mitgeschickt — das braucht
  noch einen Upload-Endpoint mit Supabase Storage)

## Offener Punkt zur Beekeeper-API

Die Endpunkt-Pfade in `lib/beekeeper.js` (`/api/2/groups`,
`/api/2/chats/{id}/messages`) stammen aus öffentlicher Doku und
Community-Beispielen, nicht aus eurem eigenen Entwicklerportal. Beim Live-Test
kam ein 404 zurück — wartet aktuell auf Antwort vom Beekeeper-Support.
