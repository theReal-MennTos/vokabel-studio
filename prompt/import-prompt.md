# Import-Prompt (Vorlage)

Die App setzt die Platzhalter `{{…}}` aus der Auswahl des Schülers ein (Fach, Lehrwerk, Band, Unit) und zeigt den fertigen Text mit einem großen „Prompt kopieren“-Knopf. Der fachspezifische Block wird je nach Fach eingefügt.

Ablauf für den Schüler:
1. Prompt kopieren → ChatGPT oder Gemini öffnen → einfügen.
2. Foto der Vokabelseite anhängen (1 Seite pro Nachricht ist am zuverlässigsten).
3. Antwort komplett kopieren → in Vokabel-Studio einfügen → „Prüfen“.
4. Für die nächste Seite: im selben Chat nur das neue Foto schicken mit „Nächste Seite, gleiche Regeln“.

---

## Prompt-Text

```text
Du hilfst mir, eine Vokabelseite aus meinem Schulbuch für meine Lern-App aufzubereiten.
Im Anhang ist ein Foto der Seite.

BUCH: {{LEHRWERK_TITEL}}, Band {{BAND}} ({{VERLAG}}{{AUSGABE}})
FACH: {{FACH_NAME}}
UNIT: {{UNIT_NUMMER}} {{UNIT_TITEL}}

AUFGABE
1. Schreib JEDE Vokabel auf dem Foto genau so ab, wie sie im Buch steht – in derselben Reihenfolge. Lass keine aus und erfinde keine dazu.
2. Ordne jede Vokabel dem Part zu, unter dem sie im Buch steht (z. B. "A", "B", "Lead-in", "Station"). Wenn kein Part erkennbar ist, nimm "{{PART_STANDARD}}".
3. Übernimm Lautschrift/Formen, deutsche Bedeutungen und Beispielsätze aus dem Buch (quelle "buch").
4. Ergänze zu jeder Vokabel, wenn sinnvoll: gegenteile, synonyme, wortfamilie (verwandte Wörter), stolpersteine (typische Fehler, falsche Freunde, Aussprache, Schreibung) und eine kurze merkhilfe. Lass Felder weg, wenn dir nichts Sinnvolles einfällt. Nichts erfinden, was nicht stimmt.
5. Schreib 6 bis 10 neue, einfache Lernsätze, die nur Vokabeln dieser Seite und sehr einfache Grundwörter benutzen (Niveau Klasse {{KLASSE}}). Gib bei "woerter" die benutzten Vokabeln genau so an, wie sie in "wort" stehen.
6. Schreib 4 bis 6 Satzbau-Aufgaben: ein deutscher Satz, die Musterlösung in der Fremdsprache, ggf. weitere richtige Lösungen ("alternativen") und 2 bis 3 falsche Zusatzwörter ("ablenker"), die typische Fehler abbilden.
7. Wenn du etwas nicht sicher lesen kannst, setze bei der Vokabel "unsicher": true und erkläre kurz in "unsicher_grund". Allgemeine Probleme (z. B. "unterer Rand abgeschnitten") schreibst du in "hinweise".

{{FACH_BLOCK}}

ANTWORTFORMAT – SEHR WICHTIG
- Antworte NUR mit einem einzigen JSON-Codeblock. Kein Text davor oder danach.
- Benutze nur gerade Anführungszeichen ", keine Kommentare, kein Komma nach dem letzten Element.
- Feldnamen genau wie im Muster, alles klein geschrieben.
- Erlaubte Werte für "wortart": nomen, verb, adjektiv, adverb, praeposition, konjunktion, pronomen, zahlwort, interjektion, wendung, sonstiges.
- Erlaubte Werte für "quelle": buch, ki.

MUSTER (Aufbau – Inhalte sind nur Beispiele):
{
  "schema": "vokabel-studio-import/1",
  "inhaltstyp": "vokabelliste",
  "fach": "{{FACH_CODE}}",
  "lehrwerk": { "titel": "{{LEHRWERK_TITEL}}", "band": "{{BAND}}" },
  "unit": { "nummer": "{{UNIT_NUMMER}}", "titel": "{{UNIT_TITEL}}" },
  "seiten": ["Seitenzahl vom Foto"],
  "parts": [
    {
      "kennung": "A",
      "vokabeln": [
{{MUSTER_VOKABEL}}
      ]
    }
  ],
  "lernsaetze": [
    { "fremd": "…", "deutsch": "…", "woerter": ["…"], "part": "A" }
  ],
  "satzbau": [
    { "deutsch": "…", "loesung": "…", "alternativen": [], "ablenker": ["…", "…"], "woerter": ["…"], "part": "A" }
  ],
  "hinweise": []
}
```

---

## Fach-Block Englisch (`{{FACH_BLOCK}}`)

```text
REGELN ENGLISCH
- "wort": genau wie im Buch, also auch "(to) climb", "(to) make fun of sb./sth.", "Me neither.".
- Englische Umschreibungen aus dem Buch (z. B. "someone who plays an instrument") gehören in "erklaerung".
- Verweise mit (F) oder (L) im Buch gehören in "andere_sprachen": { "sprache": "fr" oder "la", "wort": "…", "bedeutung": "…" (nur wenn im Buch eine deutsche Bedeutung in Klammern steht) }.
- Hinweise mit Ausrufezeichen im Buch (z. B. "stress: …", "hat keinen Plural") gehören in "stolpersteine". Betonung so schreiben: "Betonung auf der ersten Silbe: AS-tronaut."
- Gegensatzpaare mit ◄► im Buch gehören in "gegenteile".
- Im Buch steht bei Beispielsätzen meist nur Englisch: ergänze die deutsche Übersetzung, "quelle" bleibt "buch".
- Ist etwas am Seitenrand abgeschnitten, ergänze es nur, wenn es eindeutig ist, und setze "unsicher": true.
- "lautschrift": die Lautschrift aus dem Buch ohne Schrägstriche/Klammern. Wenn keine im Buch steht, Feld weglassen.
- "formen" nur bei Unregelmäßigem: "plural" (z. B. sheep → "sheep"), "simple_past" und "past_participle" bei unregelmäßigen Verben, "steigerung" bei unregelmäßigen Adjektiven.
- Britisches Englisch wie im Buch.
```

Muster-Vokabel Englisch (`{{MUSTER_VOKABEL}}`):

```text
        {
          "wort": "(to) pretend",
          "lautschrift": "prɪˈtend",
          "wortart": "verb",
          "bedeutungen": ["so tun, als ob"],
          "erklaerung": "",
          "andere_sprachen": [ { "sprache": "fr", "wort": "prétendre" }, { "sprache": "la", "wort": "praetendere" } ],
          "beispiele": [ { "fremd": "She pretended not to hear them.", "deutsch": "Sie tat so, als würde sie sie nicht hören.", "quelle": "buch" } ],
          "gegenteile": [],
          "wortfamilie": [],
          "stolpersteine": ["Satzbau: pretend TO do sth. / pretend NOT TO do sth."],
          "merkhilfe": "",
          "unsicher": false
        }
```

## Fach-Block Latein (`{{FACH_BLOCK}}`)

```text
REGELN LATEIN
- "wort": die Grundform wie im Buch, Längenzeichen (ā, ē, ī, ō, ū) genau übernehmen.
- Nomen: "formen" mit "genitiv" (ausgeschrieben, z. B. "amīcī"), "genus" (m, f, n oder m/f) und "deklination" (a, o, kons, e, u, i, gemischt).
- Verben: "formen" mit "stammformen" als Liste genau wie im Buch (z. B. ["vocāre", "vocō", "vocāvī", "vocātum"]) und "konjugation" (a, e, i, kons, kons-i, unregelmaessig). Wenn im Buch nur Infinitiv und 1. Person stehen, nur diese übernehmen.
- Adjektive: "adjektiv_endungen" wie im Buch (z. B. "-a, -um" oder "Gen. -is").
- Steht eine Rektion dabei (z. B. "m. Akk."), in "rektion".
- Kein Feld "lautschrift".
- Bei "wortfamilie" gern deutsche, englische oder französische Lehnwörter (z. B. amīcus → Amigo, amical).
```

Muster-Vokabel Latein (`{{MUSTER_VOKABEL}}`):

```text
        {
          "wort": "amīcus",
          "wortart": "nomen",
          "bedeutungen": ["Freund"],
          "formen": { "genitiv": "amīcī", "genus": "m", "deklination": "o" },
          "beispiele": [],
          "wortfamilie": ["amicable (engl.)", "Amigo"],
          "stolpersteine": [],
          "unsicher": false
        }
```

---

## Folge-Prompt für weitere Fotos (im selben Chat)

```text
Nächste Seite, gleiche Unit, gleiche Regeln und gleiches JSON-Format. Nur ein JSON-Codeblock.
```

## Korrektur-Prompt (bietet die App bei Fehlern an)

Die App setzt die konkreten Fehlermeldungen ein:

```text
Deine Antwort hat das Format nicht ganz eingehalten. Bitte korrigiere nur diese Punkte und schick das komplette JSON noch einmal als einen Codeblock:
{{FEHLERLISTE}}
```

---

## Fehlertoleranz der App beim Einfügen (vorab festgelegt)

| Problem in der Chatbot-Antwort | Was die App tut |
|---|---|
| Text vor/nach dem JSON, ```json-Rahmen | wird automatisch entfernt (Bereich von erster `{` bis letzter `}`) |
| typografische Anführungszeichen „ " ' | werden in gerade umgewandelt |
| Komma nach letztem Element | wird entfernt, Warnung |
| `nummer` als Zahl statt Text | wird umgewandelt, keine Meldung |
| unbekannte Wortart (z. B. „noun“) | Zuordnung über Liste (noun→nomen, phrase→wendung …), Warnung |
| fehlende Pflichtfelder | Fehler mit Klartext: „Bei Vokabel 7 (‚valley‘) fehlt die deutsche Bedeutung.“ Korrektur in der Kontrollansicht möglich |
| Latein-Nomen ohne Genitiv/Genus | Warnung, Vokabel in Kontrollansicht markiert |
| Wörter in `lernsaetze.woerter`, die nicht in der Liste stehen | Warnung, Satz wird trotzdem übernommen |
| Satzbau: Lösung nicht aus Bausteinen bildbar | entfällt, weil die App die Bausteine selbst aus der Lösung bildet |
| Antwort abgeschnitten (Gratis-Limit) | Fehler „Die Antwort ist unvollständig. Schreib dem Chatbot: ‚Bitte schick das JSON vollständig noch einmal.‘“ |
