# Vokabel-Studio – Datenmodell (Entwurf v1)

Stand: 22.11.2026 · Status: zur Freigabe, noch keine Oberfläche gebaut

## 1. Grundsätze

- **Speicherung:** IndexedDB im Browser, eine Datenbank `vokabel-studio`. Kein Server, keine KI-Anbindung.
- **Zwei Ebenen:**
  - **Inhalte** (Fach, Lehrwerk, Unit, Part, Vokabel, Sätze, Aufgaben) – gemeinsam für alle Profile auf dem Gerät.
  - **Lerndaten** (Lernstand, Ergebnisse, Termine, Punkte) – immer an ein Profil gebunden (`profilId`).
- **IDs:** zufällige Kurz-IDs (z. B. `v_8f3k2m`), damit Export/Import zwischen Geräten ohne Kollisionen funktioniert.
- **Versionierung:** Jede Datei/Exportdatei trägt `schemaVersion`. Migrationen laufen beim App-Start.
- **Erweiterbar:** Fächer kommen aus einer Fach-Registry (Code `englisch`, `latein`, später z. B. `franzoesisch`). Fachspezifische Felder stecken im Objekt `formen`, nicht in eigenen Tabellen.

## 2. Inhalte

```ts
Fach {
  id: "englisch" | "latein" | string   // Code = ID
  name: string                         // "Englisch"
  fremdsprache: { code: "en-GB", name: "Englisch" }
  vorlesen: {
    stimmeSprache: "en-GB" | "it-IT" | ...   // Latein → "it-IT"
    hinweis?: string   // Latein: "Für Latein wird eine italienische Stimme genutzt."
  }
  spracheingabe: { fremd: "en-GB" | null, deutsch: "de-DE" }  // Latein: fremd = null (kein Erkenner)
  formenTyp: "englisch" | "latein"     // steuert Formen-Felder und Formen-Training
}

Lehrwerk {
  id, fachId
  titel: string        // "English G Access G9"
  verlag: string       // "Cornelsen"
  band: string         // "1", "3"
  klasse?: number      // 5, 7
  ausgabe?: string     // "Ausgabe NRW"
}

Unit {
  id, lehrwerkId
  nummer: string       // "2"
  titel: string        // "Welcome to Snowdonia"
  importIds: string[]  // aus welchen Importen (Fotos) zusammengeführt
  erstelltAm, geaendertAm
}

Part {
  id, unitId
  kennung: string      // "A", "B", "Lead-in", "Station 1", "Lektion 3"
  titel?: string
  reihenfolge: number
}

Vokabel {
  id, unitId, partId
  wort: string                 // "mountain" / "amīcus"
  lautschrift?: string         // IPA, nur Englisch
  wortart: Wortart
  bedeutungen: string[]        // ["Berg"]; erste = Hauptbedeutung für Abfrage
  formen?: Formen              // siehe unten
  erklaerung?: string          // englische Umschreibung aus dem Buch
  andereSprachen: { sprache: "fr" | "la" | ..., wort: string, bedeutung?: string }[]  // (F)/(L)-Verweise
  beispiele: Beispielsatz[]
  gegenteile: string[]
  synonyme: string[]
  wortfamilie: string[]        // Wortverwandtschaften
  stolpersteine: string[]      // "false friend: map ≠ Mappe"
  merkhilfe?: string
  seite?: string
  reihenfolge: number
  pruefen: boolean             // vom Chatbot als unsicher markiert → in Kontrollansicht hervorheben
  pruefgrund?: string
}

Wortart = "nomen" | "verb" | "adjektiv" | "adverb" | "praeposition" | "konjunktion"
        | "pronomen" | "zahlwort" | "interjektion" | "wendung" | "sonstiges"

Formen {
  // Englisch
  plural?: string              // nur unregelmäßig: "sheep"
  simple_past?: string         // nur unregelmäßig: "hurt"
  past_participle?: string
  steigerung?: string          // nur unregelmäßig: "good – better – best"
  // Latein
  genitiv?: string             // "amīcī"
  genus?: "m" | "f" | "n" | "m/f"
  deklination?: "a" | "o" | "kons" | "e" | "u" | "i" | "gemischt"
  adjektiv_endungen?: string   // "-a, -um" / "Gen. -is"
  stammformen?: string[]       // wie im Buch: ["vocāre", "vocō", "vocāvī", "vocātum"]
  konjugation?: "a" | "e" | "i" | "kons" | "kons-i" | "unregelmaessig"
  rektion?: string             // "m. Akk." / "m. Dat."
}

Beispielsatz {
  fremd: string
  deutsch: string
  quelle: "buch" | "ki"        // Buch = abgeschrieben, KI = vom Chatbot neu formuliert
}

Lernsatz {                     // einfache neue Übungssätze
  id, unitId, partId?
  fremd: string
  deutsch: string
  vokabelIds: string[]         // werden beim Import über das Wort zugeordnet
}

SatzbauAufgabe {
  id, unitId, partId?
  deutsch: string              // Vorgabe: "Der Weg zum Gipfel ist steil."
  loesung: string              // Musterlösung
  alternativen: string[]       // weitere richtige Lösungen
  ablenker: string[]           // zusätzliche falsche Bausteine
  vokabelIds: string[]
  // Bausteine erzeugt die App selbst aus loesung (+ ablenker) und mischt sie.
}

ImportProtokoll {
  id, zeitpunkt
  rohtext: string              // eingefügte Chatbot-Antwort (zur Nachvollziehbarkeit)
  unitId?
  ergebnis: "uebernommen" | "verworfen"
  meldungen: { stufe: "fehler" | "warnung", text: string, pfad?: string }[]
}
```

### Vorbereitet für später (nicht in v1 gebaut)

```ts
Material {
  id, unitId, partId?
  typ: "lueckentext" | "arbeitsblatt" | "handliste"
  titel: string
  inhalt: object               // typabhängig, eigenes Teilschema je Typ
  vokabelIds: string[]
}
```

Das Import-Schema hat dafür bereits das Feld `inhaltstyp` (v1 akzeptiert nur `"vokabelliste"`). Handgeschriebene Listen laufen später über denselben Prompt-Weg mit `inhaltstyp: "handliste"` und landen ebenfalls als `Vokabel` – nur ohne Lehrwerk-Bindung (eigenes Pseudo-Lehrwerk „Eigene Listen“).

## 3. Profile und Lerndaten

```ts
Profil {
  id, name, avatar: string     // Emoji
  fachIds: string[]            // welche Fächer das Kind hat
  lehrwerkIds: string[]
  einstellungen: {
    abfrageRichtung: "fremd-deutsch" | "deutsch-fremd" | "beide"
    vorlesenAutomatisch: boolean
    sprechtempo: number        // 0.7–1.1
    tagesziel: number          // Karten pro Tag
  }
  erstelltAm
}

ElternEinstellungen {          // gerätweit, ein Datensatz
  pin?: string                 // gehasht; schützt Eltern-Ansicht und Löschen
}

Lernstand {                    // je Profil × Vokabel × Richtung
  profilId, vokabelId
  richtung: "fd" | "df"        // fremd→deutsch / deutsch→fremd
  box: 0..5                    // Leitner-Kasten
  faelligAm: Datum
  richtig: number, falsch: number
  serieRichtig: number
  zuletzt?: Datum
}
// Intervalle Box 0–5: 0, 1, 2, 4, 8, 16 Tage. Falsch → zurück in Box 1.
// Leitner statt SM-2, weil es für Kinder sichtbar und erklärbar ist ("Kasten 3 von 5").

UebungsEreignis {              // Rohprotokoll, Grundlage für Eltern-Ansicht und Statistik
  id, profilId, zeitpunkt
  modus: "karten" | "abfrage" | "mc" | "satzbau" | "formen" | "test" | "sprechen"
  vokabelId?, aufgabeId?
  richtung?: "fd" | "df"
  korrekt: boolean
  antwort?: string
  dauerMs?: number
}

Pruefungstermin {
  id, profilId
  titel: string                // "Vokabeltest Unit 2"
  datum: Datum
  unitIds: string[], partIds?: string[]
  plan: Lerntag[]              // von der App erzeugt, bei Bedarf neu berechnet
}

Lerntag {
  datum: Datum
  aufgaben: { art: "neu" | "wiederholen" | "test", vokabelIds: string[], erledigt: boolean }[]
}

TestErgebnis {
  id, profilId, unitId, zeitpunkt
  prozent: number
  einschaetzung: "sehr gut" | "gut" | "noch üben" | "dranbleiben"
  fragen: { vokabelId, richtung, korrekt, antwort }[]
  schwacheVokabelIds: string[]
}

Belohnung {                    // je Profil ein Datensatz
  profilId
  punkte: number
  serie: { aktuell: number, rekord: number, letzterLerntag?: Datum }
  abzeichen: { id: string, erhaltenAm: Datum }[]
}
```

## 4. Backup-Format (Export/Import)

```json
{
  "format": "vokabel-studio-backup",
  "schemaVersion": 1,
  "exportiertAm": "2026-11-22T18:00:00Z",
  "umfang": "alles | profil | inhalte",
  "inhalte": { "faecher": [], "lehrwerke": [], "units": [], "parts": [], "vokabeln": [], "lernsaetze": [], "satzbau": [] },
  "profile": [],
  "lerndaten": { "lernstand": [], "ereignisse": [], "termine": [], "tests": [], "belohnungen": [] }
}
```

Beim Einspielen: Inhalte werden über die ID zusammengeführt (neuere `geaendertAm` gewinnt), Profile wahlweise ersetzt oder zusätzlich angelegt.

## 5. Zusammenführen mehrerer Fotos

- Ein Import gehört zu einer Unit, erkannt über `fach + lehrwerk.titel + lehrwerk.band + unit.nummer`.
- Existiert die Unit schon, wird angehängt: gleiche `part.kennung` → Vokabeln an den Part anhängen.
- Doppelte Vokabeln (gleiches Wort, normalisiert ohne Groß-/Kleinschreibung, Längenzeichen und „to “) werden in der Kontrollansicht angezeigt: „überspringen“ oder „ersetzen“.
- Lernsätze und Satzbau-Aufgaben werden angehängt.

## 6. Abfrage-Regeln (für spätere Stufen festgehalten)

- Antwortvergleich tolerant: Groß-/Kleinschreibung, Satzzeichen, Längenzeichen (ā = a), „to “ vor Verben, Artikel im Deutschen („der Berg“ = „Berg“).
- Mehrere Bedeutungen: jede Bedeutung aus `bedeutungen` zählt als richtig.
- Tippfehler-Toleranz: 1 Zeichen Abstand bei Wörtern ab 6 Buchstaben → „fast richtig“, zählt als richtig mit Hinweis.
- Multiple-Choice-Ablenker: aus derselben Unit, bevorzugt gleiche Wortart; bei zu wenigen Wörtern aus anderen Units desselben Lehrwerks.
