// Erzeugt den Prompt für ChatGPT/Gemini. Ausführliche Doku: prompt/import-prompt.md
import { fach as getFach } from './faecher.js';

const BLOCK = {
  englisch: `REGELN ENGLISCH
- "wort": genau wie im Buch, also auch "(to) climb", "(to) make fun of sb./sth.", "Me neither.".
- "lautschrift": die Lautschrift aus dem Buch ohne eckige Klammern. Wenn keine im Buch steht, Feld weglassen.
- "formen" nur bei Unregelmäßigem: "plural" (z. B. sheep → "sheep"), "simple_past" und "past_participle" bei unregelmäßigen Verben, "steigerung" bei unregelmäßigen Adjektiven.
- Englische Umschreibungen aus dem Buch (z. B. "someone who plays an instrument") gehören in "erklaerung".
- Verweise mit (F) oder (L) im Buch gehören in "andere_sprachen": { "sprache": "fr" oder "la", "wort": "…", "bedeutung": "…" (nur wenn im Buch eine deutsche Bedeutung in Klammern steht) }.
- Hinweise mit Ausrufezeichen im Buch (z. B. "stress: …", "hat keinen Plural") gehören in "stolpersteine". Betonung so schreiben: "Betonung auf der ersten Silbe: AS-tronaut."
- Gegensatzpaare mit ◄► im Buch gehören in "gegenteile".
- Im Buch steht bei Beispielsätzen meist nur Englisch: ergänze die deutsche Übersetzung, "quelle" bleibt "buch".
- Ist etwas am Seitenrand abgeschnitten, ergänze es nur, wenn es eindeutig ist, und setze "unsicher": true.`,
  latein: `REGELN LATEIN
- "wort": die Grundform wie im Buch, Längenzeichen (ā, ē, ī, ō, ū) genau übernehmen.
- Nomen: "formen" mit "genitiv" (ausgeschrieben, z. B. "amīcī"), "genus" (m, f, n oder m/f) und "deklination" (a, o, kons, e, u, i, gemischt).
- Verben: "formen" mit "stammformen" als Liste genau wie im Buch (z. B. ["vocāre", "vocō", "vocāvī", "vocātum"]) und "konjugation" (a, e, i, kons, kons-i, unregelmaessig). Wenn im Buch nur Infinitiv und 1. Person stehen, nur diese übernehmen.
- Adjektive: "adjektiv_endungen" wie im Buch (z. B. "-a, -um" oder "Gen. -is").
- Steht eine Rektion dabei (z. B. "m. Akk."), in "rektion".
- Kein Feld "lautschrift".
- Verweise auf Fremd- und Lehnwörter aus dem Buch gehören in "wortfamilie" (z. B. "Amigo", "amicable (engl.)").
- Ist etwas abgeschnitten, ergänze es nur, wenn es eindeutig ist, und setze "unsicher": true.`
};

const MUSTER = {
  englisch: `        {
          "wort": "(to) pretend",
          "lautschrift": "prɪˈtend",
          "wortart": "verb",
          "bedeutungen": ["so tun, als ob"],
          "andere_sprachen": [ { "sprache": "fr", "wort": "prétendre" }, { "sprache": "la", "wort": "praetendere" } ],
          "beispiele": [ { "fremd": "She pretended not to hear them.", "deutsch": "Sie tat so, als würde sie sie nicht hören.", "quelle": "buch" } ],
          "gegenteile": [],
          "stolpersteine": ["Satzbau: pretend TO do sth. / pretend NOT TO do sth."],
          "unsicher": false
        }`,
  latein: `        {
          "wort": "amīcus",
          "wortart": "nomen",
          "bedeutungen": ["Freund"],
          "formen": { "genitiv": "amīcī", "genus": "m", "deklination": "o" },
          "beispiele": [],
          "wortfamilie": ["Amigo", "amicable (engl.)"],
          "unsicher": false
        }`
};

export function erzeugePrompt({ fachId, lehrwerk, unitNummer, unitTitel }) {
  const f = getFach(fachId);
  const lw = lehrwerk || {};
  const klasse = lw.klasse || '5–7';
  const unitWort = f.formenTyp === 'latein' ? 'LEKTION' : 'UNIT';
  return `Du hilfst mir, eine Vokabelseite aus meinem Schulbuch für meine Lern-App aufzubereiten.
Im Anhang ist ein Foto der Seite.

BUCH: ${lw.titel || '?'}${lw.band ? ', Band ' + lw.band : ''}${lw.verlag ? ' (' + lw.verlag + (lw.ausgabe ? ', ' + lw.ausgabe : '') + ')' : ''}
FACH: ${f.name}
${unitWort}: ${unitNummer}${unitTitel ? ' „' + unitTitel + '“' : ''}

AUFGABE
1. Schreib JEDE Vokabel auf dem Foto genau so ab, wie sie im Buch steht – in derselben Reihenfolge. Lass keine aus und erfinde keine dazu. Vokabeln einer anderen Unit/Lektion auf dem Foto lässt du weg.
2. Ordne jede Vokabel dem Part zu, unter dem sie im Buch steht (z. B. "A", "B", "Lead-in", "Station"). Wenn kein Part erkennbar ist, nimm "A".
3. Übernimm Lautschrift/Formen, deutsche Bedeutungen und Beispielsätze aus dem Buch (quelle "buch").
4. Ergänze zu jeder Vokabel, wenn sinnvoll: gegenteile, synonyme, wortfamilie (verwandte Wörter), stolpersteine (typische Fehler, falsche Freunde, Aussprache, Schreibung) und eine kurze merkhilfe. Lass Felder weg, wenn dir nichts Sinnvolles einfällt. Nichts erfinden, was nicht stimmt.
5. Schreib 6 bis 10 neue, einfache Lernsätze, die nur Vokabeln dieser Seite und sehr einfache Grundwörter benutzen (Niveau Klasse ${klasse}). Gib bei "woerter" die benutzten Vokabeln genau so an, wie sie in "wort" stehen.
6. Schreib 4 bis 6 Satzbau-Aufgaben: ein deutscher Satz, die Musterlösung in der Fremdsprache, ggf. weitere richtige Lösungen ("alternativen") und 2 bis 3 falsche Zusatzwörter ("ablenker"), die typische Fehler abbilden.
7. Wenn du etwas nicht sicher lesen kannst, setze bei der Vokabel "unsicher": true und erkläre kurz in "unsicher_grund". Allgemeine Probleme (z. B. "unterer Rand abgeschnitten") schreibst du in "hinweise".

${BLOCK[f.formenTyp]}

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
  "fach": "${f.id}",
  "lehrwerk": { "titel": "${lw.titel || ''}", "band": "${lw.band || ''}" },
  "unit": { "nummer": "${unitNummer}", "titel": "${unitTitel || ''}" },
  "seiten": ["Seitenzahl vom Foto"],
  "parts": [
    {
      "kennung": "A",
      "vokabeln": [
${MUSTER[f.formenTyp]}
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
}`;
}

export const FOLGE_PROMPT = 'Nächste Seite, gleiche Unit, gleiche Regeln und gleiches JSON-Format. Nur ein JSON-Codeblock.';

export function korrekturPrompt(fehler) {
  return `Deine Antwort hat das Format nicht ganz eingehalten. Bitte korrigiere diese Punkte und schick das komplette JSON noch einmal als einen einzigen Codeblock, ohne Text davor oder danach:
${fehler.map((f) => '- ' + f).join('\n')}`;
}
