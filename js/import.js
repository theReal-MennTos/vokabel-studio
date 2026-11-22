// Import: Chatbot-Antwort lesen, reparieren, prüfen, zusammenführen, speichern.
import * as db from './db.js';
import { uid, normWort } from './util.js';
import { WORTARTEN, fach as getFach } from './faecher.js';

export const SCHEMA_ID = 'vokabel-studio-import/1';

// ---------- 1. Text → JSON ----------

export function parseAntwort(text) {
  const fehler = [], warnungen = [];
  let t = String(text || '').trim();
  if (!t) return { fehler: ['Das Feld ist leer. Füge die komplette Antwort des Chatbots ein.'], warnungen };

  // Codeblock-Rahmen und Text drumherum entfernen
  const start = t.indexOf('{');
  const ende = t.lastIndexOf('}');
  if (start === -1) {
    return { fehler: ['In der Antwort ist kein JSON zu finden (es fehlt die geschweifte Klammer „{“). Hat der Chatbot vielleicht nur Text geschrieben? Schreib ihm: „Bitte antworte nur mit dem JSON-Codeblock.“'], warnungen };
  }
  if (start > 0 || ende < t.length - 1) {
    const vorher = t.slice(0, start).replace(/```(json)?/gi, '').trim();
    const nachher = ende > -1 ? t.slice(ende + 1).replace(/```/g, '').trim() : '';
    if (vorher || nachher) warnungen.push('Vor oder nach dem JSON stand noch Text. Den habe ich weggelassen.');
  }
  t = ende > start ? t.slice(start, ende + 1) : t.slice(start);

  const versuche = [
    (s) => s,
    (s) => s.replace(/,\s*([}\]])/g, '$1'),                                 // Komma vor } oder ]
    (s) => s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")   // schräge Anführungszeichen
  ];
  let letzterFehler;
  for (let i = 0; i < versuche.length; i++) {
    try {
      const data = JSON.parse(versuche[i](t));
      if (i === 1) warnungen.push('Überflüssige Kommas am Listenende habe ich entfernt.');
      if (i === 2) warnungen.push('Schräge Anführungszeichen habe ich in gerade umgewandelt. Bitte prüfe die Beispielsätze.');
      return { data, fehler, warnungen };
    } catch (e) { if (i === 0) letzterFehler = e; }
  }

  // Abgeschnitten?
  if (klammerBilanz(t) > 0) {
    fehler.push('Die Antwort ist unvollständig – sie hört mitten im JSON auf. Das passiert, wenn der Chatbot zu viel auf einmal schreiben muss. Schreib ihm: „Deine Antwort wurde abgeschnitten. Bitte schick das JSON vollständig noch einmal.“ Oder fotografiere weniger Vokabeln auf einmal (z. B. eine halbe Seite).');
    return { fehler, warnungen };
  }
  fehler.push('Die Antwort ist kein gültiges JSON. ' + fundstelle(t, letzterFehler) +
    ' Am einfachsten: Tippe unten auf „Korrektur-Text kopieren“ und schick ihn dem Chatbot.');
  return { fehler, warnungen };
}

function klammerBilanz(s) {
  let n = 0, inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    else if (!inStr && (c === '{' || c === '[')) n++;
    else if (!inStr && (c === '}' || c === ']')) n--;
  }
  return n + (inStr ? 1 : 0);
}

function fundstelle(t, e) {
  const m = /position (\d+)/i.exec(e?.message || '');
  if (!m) return 'Meist fehlt ein Komma oder ein Anführungszeichen.';
  const pos = +m[1];
  const zeile = t.slice(0, pos).split('\n').length;
  const ausschnitt = t.slice(Math.max(0, pos - 30), pos + 30).replace(/\s+/g, ' ');
  return `Der Fehler steckt ungefähr in Zeile ${zeile}: „…${ausschnitt}…“. Meist fehlt dort ein Komma oder ein Anführungszeichen.`;
}

// ---------- 2. Prüfen und vereinheitlichen ----------

const WORTART_MAP = {
  noun: 'nomen', substantiv: 'nomen', n: 'nomen', nomen: 'nomen', name: 'nomen',
  verb: 'verb', v: 'verb', 'phrasal verb': 'verb',
  adjective: 'adjektiv', adj: 'adjektiv', adjektiv: 'adjektiv',
  adverb: 'adverb', adv: 'adverb',
  preposition: 'praeposition', 'präposition': 'praeposition', prep: 'praeposition', praeposition: 'praeposition',
  conjunction: 'konjunktion', konjunktion: 'konjunktion', konj: 'konjunktion',
  pronoun: 'pronomen', pronomen: 'pronomen',
  numeral: 'zahlwort', number: 'zahlwort', zahlwort: 'zahlwort', numerale: 'zahlwort',
  interjection: 'interjektion', interjektion: 'interjektion', ausruf: 'interjektion',
  phrase: 'wendung', expression: 'wendung', idiom: 'wendung', redewendung: 'wendung', ausdruck: 'wendung', wendung: 'wendung',
  other: 'sonstiges', sonstiges: 'sonstiges'
};
const GENUS_MAP = { m: 'm', 'm.': 'm', maskulin: 'm', masculinum: 'm', f: 'f', 'f.': 'f', feminin: 'f', femininum: 'f', n: 'n', 'n.': 'n', neutrum: 'n', 'm/f': 'm/f', 'm./f.': 'm/f' };
const VOK_FELDER = new Set(['wort', 'lautschrift', 'wortart', 'bedeutungen', 'formen', 'erklaerung', 'andere_sprachen', 'beispiele', 'gegenteile', 'synonyme', 'wortfamilie', 'stolpersteine', 'merkhilfe', 'unsicher', 'unsicher_grund']);
const TOP_FELDER = new Set(['schema', 'inhaltstyp', 'fach', 'lehrwerk', 'unit', 'seiten', 'parts', 'lernsaetze', 'satzbau', 'hinweise']);

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
function liste(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? Object.values(x).join(' – ') : str(x))).filter(Boolean);
  return [str(v)].filter(Boolean);
}
function bedeutungsListe(v) {
  // nur an ; trennen – Kommas kommen in Bedeutungen vor („so tun, als ob“)
  if (typeof v === 'string') return v.split(/\s*;\s*/).map(str).filter(Boolean);
  return liste(v);
}

/**
 * @param data  geparstes JSON
 * @param ctx   { fachId, unitNummer }
 * @returns { fehler, warnungen, daten }  fehler = Import nicht möglich
 */
export function pruefe(data, ctx) {
  const fehler = [], warnungen = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { fehler: ['Die Antwort hat nicht den erwarteten Aufbau (ganz außen muss { … } stehen).'], warnungen };
  }
  if (data.schema && data.schema !== SCHEMA_ID) warnungen.push(`Unbekannte Schema-Angabe „${data.schema}“ – ich versuche es trotzdem.`);
  if (data.inhaltstyp && data.inhaltstyp !== 'vokabelliste') {
    fehler.push(`Inhaltstyp „${data.inhaltstyp}“ kann diese Version noch nicht verarbeiten. Bitte nur Vokabellisten.`);
  }
  const unbekannt = Object.keys(data).filter((k) => !TOP_FELDER.has(k));
  if (unbekannt.length) warnungen.push(`Diese Angaben kenne ich nicht und lasse sie weg: ${unbekannt.join(', ')}.`);

  const fachAntwort = str(data.fach).toLowerCase();
  if (fachAntwort && ctx.fachId && fachAntwort !== ctx.fachId) {
    warnungen.push(`Der Chatbot hat als Fach „${data.fach}“ angegeben, du hast „${getFach(ctx.fachId)?.name}“ gewählt. Ich nehme deine Auswahl.`);
  }
  const unitAntwort = str(data.unit?.nummer);
  if (unitAntwort && ctx.unitNummer && normWort(unitAntwort) !== normWort(ctx.unitNummer)) {
    warnungen.push(`Auf dem Foto steht Unit/Lektion „${unitAntwort}“, du hast „${ctx.unitNummer}“ gewählt. Stimmt das?`);
  }
  const latein = getFach(ctx.fachId)?.formenTyp === 'latein';

  // Parts – notfalls aus flacher Vokabelliste
  let parts = data.parts;
  if (!Array.isArray(parts) && Array.isArray(data.vokabeln)) {
    parts = [{ kennung: 'A', vokabeln: data.vokabeln }];
    warnungen.push('Der Chatbot hat keine Parts angegeben. Ich habe alles in Part „A“ gesteckt – du kannst das in der Kontrollansicht ändern.');
  }
  if (!Array.isArray(parts) || !parts.length) {
    fehler.push('In der Antwort sind keine Vokabeln enthalten (die Liste „parts“ fehlt oder ist leer).');
    return { fehler, warnungen };
  }

  const vokUnbekannt = new Set();
  let anzahl = 0;
  const outParts = parts.map((p, pi) => {
    const kennung = str(p?.kennung) || str(p?.part) || str(p?.name) || 'A';
    const voks = Array.isArray(p?.vokabeln) ? p.vokabeln : [];
    if (!voks.length) warnungen.push(`Part ${kennung} enthält keine Vokabeln.`);
    return {
      kennung, titel: str(p?.titel),
      vokabeln: voks.map((v, vi) => {
        anzahl++;
        Object.keys(v || {}).forEach((k) => { if (!VOK_FELDER.has(k)) vokUnbekannt.add(k); });
        return normVokabel(v || {}, `Part ${kennung}, Vokabel ${vi + 1}`, latein, warnungen);
      })
    };
  });
  if (!anzahl) fehler.push('Es wurde keine einzige Vokabel gefunden.');
  if (vokUnbekannt.size) warnungen.push(`Bei Vokabeln kamen unbekannte Angaben vor, die ich weglasse: ${[...vokUnbekannt].join(', ')}.`);

  const fehlend = outParts.flatMap((p) => p.vokabeln).filter((v) => v._probleme.some((x) => x.stufe === 'fehler'));
  if (fehlend.length) {
    warnungen.push(`${fehlend.length} Vokabel(n) sind unvollständig (rot markiert). Ergänze sie in der Kontrollansicht oder nimm sie raus.`);
  }

  // Lernsätze
  const lernsaetze = (Array.isArray(data.lernsaetze) ? data.lernsaetze : []).map((s) => ({
    fremd: str(s?.fremd ?? s?.englisch ?? s?.latein), deutsch: str(s?.deutsch), woerter: liste(s?.woerter), part: str(s?.part)
  })).filter((s) => {
    if (s.fremd && s.deutsch) return true;
    warnungen.push('Ein Lernsatz ohne Fremdsprache oder Deutsch wurde weggelassen.');
    return false;
  });

  // Satzbau
  const satzbau = (Array.isArray(data.satzbau) ? data.satzbau : []).map((s) => ({
    deutsch: str(s?.deutsch), loesung: str(s?.loesung ?? s?.lösung), alternativen: liste(s?.alternativen),
    ablenker: liste(s?.ablenker), woerter: liste(s?.woerter), part: str(s?.part)
  })).filter((s) => {
    if (s.deutsch && s.loesung) return true;
    warnungen.push('Eine Satzbau-Aufgabe ohne deutschen Satz oder ohne Lösung wurde weggelassen.');
    return false;
  });

  // Wörter in Sätzen, die nicht auf der Liste stehen
  const bekannt = new Set(outParts.flatMap((p) => p.vokabeln.map((v) => normWort(v.wort))));
  const fremdeWoerter = new Set();
  [...lernsaetze, ...satzbau].forEach((s) => s.woerter.forEach((w) => { if (!bekannt.has(normWort(w))) fremdeWoerter.add(w); }));
  if (fremdeWoerter.size) {
    warnungen.push(`In Lernsätzen/Satzbau werden Wörter genannt, die nicht in der Vokabelliste stehen (z. B. aus früheren Units): ${[...fremdeWoerter].slice(0, 6).join(', ')}${fremdeWoerter.size > 6 ? ' …' : ''}. Die Sätze werden trotzdem übernommen.`);
  }

  const hinweise = liste(data.hinweise);
  return {
    fehler, warnungen,
    daten: {
      fach: ctx.fachId, lehrwerkAntwort: data.lehrwerk || null, unitAntwort: data.unit || null,
      seiten: liste(data.seiten), parts: outParts, lernsaetze, satzbau, hinweise
    }
  };
}

function normVokabel(v, ort, latein, warnungen) {
  const probleme = [];
  const wort = str(v.wort);
  const name = wort ? `${ort} („${wort}“)` : ort;
  if (!wort) probleme.push({ stufe: 'fehler', text: 'Das Wort selbst fehlt.' });

  let wortart = str(v.wortart).toLowerCase();
  if (wortart && !WORTARTEN.includes(wortart)) {
    const m = WORTART_MAP[wortart.replace(/\.$/, '')];
    wortart = m || 'sonstiges';
    if (!m) probleme.push({ stufe: 'warnung', text: `Unbekannte Wortart „${v.wortart}“ – auf „Sonstiges“ gesetzt.` });
  }
  if (!wortart) wortart = 'sonstiges';

  const bedeutungen = bedeutungsListe(v.bedeutungen ?? v.bedeutung ?? v.deutsch);
  if (!bedeutungen.length) probleme.push({ stufe: 'fehler', text: 'Die deutsche Bedeutung fehlt.' });

  const formen = normFormen(v.formen);
  if (latein) {
    if (wortart === 'nomen' && (!formen.genitiv || !formen.genus)) probleme.push({ stufe: 'warnung', text: 'Bei Nomen sollten Genitiv und Genus angegeben sein.' });
    if (wortart === 'verb' && !(formen.stammformen?.length)) probleme.push({ stufe: 'warnung', text: 'Bei Verben fehlen die Stammformen.' });
  }

  const beispiele = (Array.isArray(v.beispiele) ? v.beispiele : v.beispiele ? [v.beispiele] : []).map((b) => {
    if (typeof b === 'string') return { fremd: b, deutsch: '', quelle: 'buch' };
    const q = str(b?.quelle).toLowerCase();
    return { fremd: str(b?.fremd ?? b?.englisch ?? b?.latein), deutsch: str(b?.deutsch), quelle: q === 'ki' ? 'ki' : 'buch' };
  }).filter((b) => b.fremd);

  const andere = (Array.isArray(v.andere_sprachen) ? v.andere_sprachen : []).map((a) => ({
    sprache: str(a?.sprache).toLowerCase().slice(0, 2), wort: str(a?.wort), bedeutung: str(a?.bedeutung)
  })).filter((a) => a.wort && a.sprache);

  const unsicher = v.unsicher === true || v.unsicher === 'true';
  if (unsicher) probleme.push({ stufe: 'unsicher', text: str(v.unsicher_grund) || 'Der Chatbot war beim Lesen unsicher.' });
  void name; void warnungen;

  return {
    _tmp: uid('t'), _probleme: probleme, _uebernehmen: true, _doppeltVon: null, _aktion: 'neu',
    wort, lautschrift: str(v.lautschrift).replace(/^[\/\[]|[\/\]]$/g, ''), wortart, bedeutungen, formen,
    erklaerung: str(v.erklaerung), andereSprachen: andere, beispiele,
    gegenteile: liste(v.gegenteile), synonyme: liste(v.synonyme), wortfamilie: liste(v.wortfamilie),
    stolpersteine: liste(v.stolpersteine), merkhilfe: str(v.merkhilfe),
    pruefen: unsicher, pruefgrund: unsicher ? (str(v.unsicher_grund) || 'unsicher gelesen') : ''
  };
}

function normFormen(f) {
  if (!f || typeof f !== 'object') return {};
  const out = {};
  for (const k of ['plural', 'simple_past', 'past_participle', 'steigerung', 'genitiv', 'adjektiv_endungen', 'rektion']) {
    if (str(f[k])) out[k] = str(f[k]);
  }
  if (f.genus) out.genus = GENUS_MAP[str(f.genus).toLowerCase()] || str(f.genus);
  if (f.deklination) out.deklination = str(f.deklination).toLowerCase().replace(/[-.]?dekl.*$/, '');
  if (f.konjugation) out.konjugation = str(f.konjugation).toLowerCase().replace(/[-.]?konj.*$/, '');
  if (f.stammformen) out.stammformen = typeof f.stammformen === 'string' ? f.stammformen.split(/\s*,\s*/).filter(Boolean) : liste(f.stammformen);
  return out;
}

// Für die Korrektur-Nachricht an den Chatbot
export function vokabelProblemListe(daten) {
  const out = [];
  // aktueller Stand (nach Korrekturen in der Kontrollansicht)
  daten?.parts?.forEach((p) => p.vokabeln.forEach((v, i) => {
    if (!v._uebernehmen) return;
    const ort = `Part ${p.kennung}, Vokabel ${i + 1}${v.wort ? ` („${v.wort}“)` : ''}`;
    if (!v.wort) out.push(`${ort}: Das Wort selbst fehlt.`);
    if (!v.bedeutungen.length) out.push(`${ort}: Die deutsche Bedeutung fehlt.`);
  }));
  return out;
}

// ---------- 3. Mit vorhandener Unit abgleichen ----------

export async function findeUnit(lehrwerkId, nummer) {
  const units = await db.byIndex('units', 'lehrwerkId', lehrwerkId);
  return units.find((u) => normWort(u.nummer) === normWort(nummer)) || null;
}

export async function markiereDoppelte(daten, unit) {
  if (!unit) return 0;
  const vorhanden = await db.byIndex('vokabeln', 'unitId', unit.id);
  const map = new Map(vorhanden.map((v) => [normWort(v.wort), v]));
  let n = 0;
  const gesehen = new Set();
  for (const p of daten.parts) {
    for (const v of p.vokabeln) {
      const k = normWort(v.wort);
      const alt = map.get(k);
      if (alt) { v._doppeltVon = alt.id; v._aktion = 'ueberspringen'; v._uebernehmen = false; n++; }
      else if (gesehen.has(k)) { v._aktion = 'ueberspringen'; v._uebernehmen = false; v._probleme.push({ stufe: 'warnung', text: 'Steht in dieser Antwort doppelt.' }); n++; }
      gesehen.add(k);
    }
  }
  return n;
}

// ---------- 4. Speichern ----------

export async function speichere(daten, { lehrwerkId, unitNummer, unitTitel, rohtext }) {
  const jetzt = new Date().toISOString();
  const ops = [];
  let unit = await findeUnit(lehrwerkId, unitNummer);
  if (!unit) {
    unit = { id: uid('u'), lehrwerkId, nummer: str(unitNummer), titel: str(unitTitel), importIds: [], erstelltAm: jetzt, geaendertAm: jetzt };
  } else if (unitTitel && !unit.titel) unit.titel = unitTitel;

  const importId = uid('i');
  unit.importIds = [...(unit.importIds || []), importId];
  unit.geaendertAm = jetzt;
  ops.push({ store: 'units', op: 'put', value: unit });

  const parts = await db.byIndex('parts', 'unitId', unit.id);
  const vorhandeneVok = await db.byIndex('vokabeln', 'unitId', unit.id);
  let reihenfolge = vorhandeneVok.reduce((m, v) => Math.max(m, v.reihenfolge || 0), 0);
  const partMap = new Map(parts.map((p) => [p.kennung.toLowerCase(), p]));
  let partReihe = parts.reduce((m, p) => Math.max(m, p.reihenfolge || 0), 0);

  const holePart = (kennung) => {
    const k = (kennung || 'A').trim();
    let p = partMap.get(k.toLowerCase());
    if (!p) {
      p = { id: uid('p'), unitId: unit.id, kennung: k, titel: '', reihenfolge: ++partReihe };
      partMap.set(k.toLowerCase(), p);
      ops.push({ store: 'parts', op: 'put', value: p });
    }
    return p;
  };

  const alleWoerter = new Map(vorhandeneVok.map((v) => [normWort(v.wort), v.id]));
  let neu = 0, ersetzt = 0;
  for (const p of daten.parts) {
    const part = holePart(p.kennung);
    if (p.titel && !part.titel) { part.titel = p.titel; ops.push({ store: 'parts', op: 'put', value: part }); }
    for (const v of p.vokabeln) {
      if (!v._uebernehmen) continue;
      const ersetzen = v._doppeltVon && v._aktion === 'ersetzen';
      const alt = ersetzen ? vorhandeneVok.find((x) => x.id === v._doppeltVon) : null;
      const rec = {
        id: alt ? alt.id : uid('v'), unitId: unit.id, partId: part.id,
        wort: v.wort, lautschrift: v.lautschrift, wortart: v.wortart, bedeutungen: v.bedeutungen, formen: v.formen,
        erklaerung: v.erklaerung, andereSprachen: v.andereSprachen, beispiele: v.beispiele,
        gegenteile: v.gegenteile, synonyme: v.synonyme, wortfamilie: v.wortfamilie, stolpersteine: v.stolpersteine,
        merkhilfe: v.merkhilfe, seite: daten.seiten.join(', '), reihenfolge: alt ? alt.reihenfolge : ++reihenfolge,
        pruefen: v.pruefen, pruefgrund: v.pruefgrund, importId
      };
      alt ? ersetzt++ : neu++;
      alleWoerter.set(normWort(rec.wort), rec.id);
      ops.push({ store: 'vokabeln', op: 'put', value: rec });
    }
  }

  const zuIds = (woerter) => woerter.map((w) => alleWoerter.get(normWort(w))).filter(Boolean);
  const partId = (k) => (k ? partMap.get(k.toLowerCase())?.id || null : null);
  for (const s of daten.lernsaetze) {
    ops.push({ store: 'lernsaetze', op: 'put', value: { id: uid('s'), unitId: unit.id, partId: partId(s.part), fremd: s.fremd, deutsch: s.deutsch, vokabelIds: zuIds(s.woerter), importId } });
  }
  for (const s of daten.satzbau) {
    ops.push({ store: 'satzbau', op: 'put', value: { id: uid('b'), unitId: unit.id, partId: partId(s.part), deutsch: s.deutsch, loesung: s.loesung, alternativen: s.alternativen, ablenker: s.ablenker, vokabelIds: zuIds(s.woerter), importId } });
  }
  ops.push({ store: 'importe', op: 'put', value: { id: importId, zeitpunkt: jetzt, unitId: unit.id, rohtext: rohtext || '', ergebnis: 'uebernommen', hinweise: daten.hinweise, anzahl: neu + ersetzt } });

  await db.batch(ops);
  return { unitId: unit.id, neu, ersetzt, saetze: daten.lernsaetze.length, satzbau: daten.satzbau.length };
}
