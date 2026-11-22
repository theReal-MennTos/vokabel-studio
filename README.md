# Vokabel-Studio

Vokabel-Lern-App für Schülerinnen und Schüler am Gymnasium (NRW), Englisch und Latein.
Web-App (PWA) für iPhone und iPad, alle Daten bleiben lokal auf dem Gerät. Keine KI-Anbindung, keine API-Schlüssel.

**App öffnen:** https://therealmenntos.github.io/vokabel-studio/

## So kommen die Vokabeln in die App

1. In der App „Vokabelseite einlesen“ → Buch und Unit wählen → **Text kopieren**.
2. In ChatGPT oder Gemini (Gratis-Version) einfügen, **Foto der Vokabelseite** anhängen, abschicken.
3. Antwort kopieren → in der App einfügen → **Prüfen** → in der Kontrollansicht vergleichen → **Übernehmen**.

## Auf dem iPhone/iPad installieren

Safari → Seite öffnen → Teilen ⬆︎ → **Zum Home-Bildschirm**.
Wichtig: Safari und die Home-Bildschirm-App haben getrennte Speicher. Am besten nur die Home-Bildschirm-App benutzen und regelmäßig eine **Sicherung** erstellen.

## Stand

| Stufe | Inhalt | Status |
|---|---|---|
| 1 | Profile, Import mit Prüfung und Kontrollansicht, Bibliothek, Lernkarten-Ansicht, Backup, Gerätetest | ✅ |
| 2 | Lernmodi: Abfrage beide Richtungen, Multiple Choice, Satzbau, Latein-Formen, Vorlesen/Mikrofon | geplant |
| 3 | Wiederholungsplan, Termin der Vokabelarbeit, Abschlusstest, PDF | geplant |
| 4 | Punkte, Serien, Abzeichen, Eltern-Ansicht | geplant |

## Technik

Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt. Speicherung in IndexedDB, Offline über Service Worker.

- `docs/01-datenmodell.md` – Datenmodell
- `schema/import-schema-v1.json` – JSON-Schema der Chatbot-Antwort
- `prompt/import-prompt.md` – Prompt-Vorlage und Fehlertoleranz
- `demo/` – selbst geschriebene Beispiel-Units (keine Schulbuchinhalte)

Lokal starten: `python -m http.server 8765` und http://localhost:8765 öffnen.

## Urheberrecht

Dieses Repository enthält **keine** Inhalte aus Schulbüchern. Abgeschriebene Vokabellisten bleiben nur lokal auf dem Gerät der Nutzer.
Lehrwerkstitel werden nur zur Zuordnung genannt; die Marken gehören den jeweiligen Verlagen.
