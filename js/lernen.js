// Lernlogik: Lernstand (Leitner), Antwortvergleich, Ablenker, fällige Wörter
import * as db from './db.js';
import { uid } from './util.js';
import { nachAntwort } from './belohnung.js';

// ---------- Datum ----------
export function isoTag(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export const heute = () => isoTag(new Date());
export function plusTage(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoTag(d); }
export function tageBis(iso) { return Math.round((new Date(iso + 'T12:00:00') - new Date(heute() + 'T12:00:00')) / 86400000); }
export function datumLang(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }); }

// ---------- Leitner ----------
export const INTERVALLE = [0, 1, 2, 4, 8, 16];   // Tage je Kasten 0–5
export const KASTEN_NAMEN = ['neu', 'Kasten 1', 'Kasten 2', 'Kasten 3', 'Kasten 4', 'Kasten 5'];
const lsKey = (p, v, r) => `${p}|${v}|${r}`;

export async function lernstandMap(profilId) {
  const alle = await db.byIndex('lernstand', 'profilId', profilId);
  return new Map(alle.map((l) => [l.key, l]));
}
export const holeLs = (map, profilId, vokabelId, richtung) => map.get(lsKey(profilId, vokabelId, richtung));

/** ergebnis: 'richtig' | 'fast' | 'falsch'. Gibt { punkte, neueAbzeichen } zurück. */
export async function bewerte(profilId, vokabelId, richtung, ergebnis, { modus = 'abfrage', antwort = '', zaehlen = true } = {}) {
  const key = lsKey(profilId, vokabelId, richtung);
  const ls = (await db.get('lernstand', key)) || { key, profilId, vokabelId, richtung, box: 0, richtig: 0, falsch: 0, serieRichtig: 0 };
  const korrekt = ergebnis !== 'falsch';
  if (korrekt) {
    ls.box = Math.min(5, ls.box + 1);
    ls.richtig++; ls.serieRichtig++;
    ls.faelligAm = plusTage(heute(), INTERVALLE[ls.box]);
  } else {
    ls.box = 1; ls.falsch++; ls.serieRichtig = 0;
    ls.faelligAm = heute();          // heute noch einmal
  }
  ls.zuletzt = new Date().toISOString();
  await db.batch([
    { store: 'lernstand', op: 'put', value: ls },
    { store: 'ereignisse', op: 'put', value: { id: uid('e'), profilId, zeitpunkt: ls.zuletzt, modus, vokabelId, richtung, korrekt, ergebnis, antwort } }
  ]);
  return zaehlen ? nachAntwort(profilId, ergebnis, modus) : { punkte: 0, neueAbzeichen: [] };
}

// Für Aufgaben ohne Vokabel-Lernstand (Satzbau, Formen, freie Sätze)
export async function protokolliere(profilId, modus, korrekt, { aufgabeId = null, vokabelId = null, antwort = '' } = {}) {
  await db.put('ereignisse', { id: uid('e'), profilId, zeitpunkt: new Date().toISOString(), modus, aufgabeId, vokabelId, korrekt, ergebnis: korrekt ? 'richtig' : 'falsch', antwort });
  return nachAntwort(profilId, korrekt ? 'richtig' : 'falsch', modus);
}

// ---------- Antwortvergleich ----------
const STRIP_ART = /^(der|die|das|ein|eine|einen|einem|einer)\s+/;
export function normAntwort(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC')   // Längenzeichen weg, Umlaute bleiben
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')   // „Moebel“ = „Möbel“
    .replace(/[’‘`´]/g, "'")
    .replace(/[.,!?;:"„“”‚…–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Erzeugt alle akzeptierten Schreibweisen einer Lösung
export function varianten(text) {
  const out = new Set();
  const basis = String(text || '').replace(/…/g, ' ').trim();
  const formen = new Set([
    basis,
    basis.replace(/\([^)]*\)/g, ' '),          // Klammerinhalt weg: "(to) climb" → "climb"
    basis.replace(/[()]/g, '')                 // Klammern weg: "Beamte(r)" → "Beamter"
  ]);
  for (const f of formen) {
    for (const g of [f, f.replace(/\b(sb|sth|jn|jm|jmdn|jmdm|etw)\b\.?(\s*\/\s*(sb|sth)\.?)?/gi, ' ')]) {
      for (const h of slashVarianten(g)) {
        let n = normAntwort(h);
        if (!n) continue;
        out.add(n);
        out.add(n.replace(/^to /, ''));
        out.add(n.replace(STRIP_ART, ''));
        out.add(n.replace(/^sich /, ''));
      }
    }
  }
  out.delete('');
  return out;
}

function slashVarianten(s) {
  // "Astronaut/in" → Astronaut, Astronautin; "Zimmerer/Zimmerin" → beide
  let liste = [''];
  for (const tok of s.split(/(\s+)/)) {
    let opts;
    const m = /^(.+?)\/(in|innen)$/i.exec(tok);
    if (m) opts = [m[1], m[1] + m[2]];
    else if (/\S\/\S/.test(tok)) opts = tok.split('/');
    else opts = [tok];
    liste = liste.flatMap((a) => opts.map((o) => a + o)).slice(0, 24);
  }
  return liste;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** loesungen: Array von Strings. Ergebnis 'richtig' | 'fast' | 'falsch' */
export function pruefeAntwort(eingabe, loesungen) {
  const e = normAntwort(eingabe);
  const e2 = e.replace(/^to /, '').replace(STRIP_ART, '').replace(/^sich /, '');
  if (!e) return { ergebnis: 'falsch' };
  let bestes = null;
  for (const l of loesungen) {
    for (const v of varianten(l)) {
      if (v === e || v === e2) return { ergebnis: 'richtig', treffer: l };
      const d = Math.min(levenshtein(v, e), levenshtein(v, e2));
      const grenze = v.length >= 10 ? 2 : v.length >= 5 ? 1 : 0;
      if (d <= grenze && (!bestes || d < bestes.d)) bestes = { d, l };
    }
  }
  return bestes ? { ergebnis: 'fast', treffer: bestes.l } : { ergebnis: 'falsch' };
}

// Frage/Lösung je Richtung. fd = Fremdsprache → Deutsch, df = Deutsch → Fremdsprache
export function frage(v, richtung) { return richtung === 'fd' ? v.wort : v.bedeutungen.join('; '); }
export function loesungen(v, richtung) { return richtung === 'fd' ? v.bedeutungen : [v.wort]; }

// ---------- Ablenker für Multiple Choice ----------
export function ablenker(v, richtung, pool, n = 3) {
  const text = (x) => (richtung === 'fd' ? x.bedeutungen[0] : x.wort);
  const ziel = text(v).toLowerCase();
  const kandidaten = mische(pool.filter((x) => x.id !== v.id && text(x) && text(x).toLowerCase() !== ziel));
  kandidaten.sort((a, b) => (b.wortart === v.wortart) - (a.wortart === v.wortart));
  const out = [], gesehen = new Set([ziel]);
  for (const k of kandidaten) {
    const t = text(k);
    if (gesehen.has(t.toLowerCase())) continue;
    gesehen.add(t.toLowerCase()); out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

export function mische(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Vokabeln laden ----------
export async function vokabelnFuerUnits(unitIds) {
  const listen = await Promise.all(unitIds.map((id) => db.byIndex('vokabeln', 'unitId', id)));
  return listen.flat();
}

export function richtungen(profil, uebersteuern) {
  const r = uebersteuern || profil?.einstellungen?.abfrageRichtung || 'beide';
  return r === 'fremd-deutsch' || r === 'fd' ? ['fd'] : r === 'deutsch-fremd' || r === 'df' ? ['df'] : ['fd', 'df'];
}

/** Fällige und neue Paare (Vokabel × Richtung). */
export async function faelligePaare(profil, { unitIds = null, richtungOverride = null, limitNeu = null } = {}) {
  const ids = unitIds || (await db.all('units')).map((u) => u.id);
  const voks = await vokabelnFuerUnits(ids);
  const map = await lernstandMap(profil.id);
  const h = heute();
  const faellig = [], neu = [];
  for (const v of voks) {
    for (const r of richtungen(profil, richtungOverride)) {
      const ls = holeLs(map, profil.id, v.id, r);
      if (!ls) neu.push({ v, richtung: r, box: 0 });
      else if ((ls.faelligAm || h) <= h) faellig.push({ v, richtung: r, box: ls.box });
    }
  }
  faellig.sort((a, b) => a.box - b.box);
  const lim = limitNeu ?? (profil.einstellungen?.tagesziel || 20);
  return { faellig, neu: neu.slice(0, lim), neuGesamt: neu.length, alle: voks };
}

/** Übersicht je Profil: wie viele Vokabeln in welchem Kasten (Richtung fd zählt). */
export async function kastenStatistik(profilId, unitIds = null) {
  const voks = unitIds ? await vokabelnFuerUnits(unitIds) : await db.all('vokabeln');
  const map = await lernstandMap(profilId);
  const zaehl = [0, 0, 0, 0, 0, 0];
  for (const v of voks) {
    const ls = holeLs(map, profilId, v.id, 'fd');
    zaehl[ls ? ls.box : 0]++;
  }
  return { zaehl, gesamt: voks.length, sicher: zaehl[4] + zaehl[5] };
}
