// Latein: regelmäßige Deklination (a, o, kons) und Präsens-Konjugation (a, e, i, kons, kons-i, esse).
// Bewusst nur regelmäßige Fälle – unbekannte Wörter liefern null, dann gibt es nur Stammformen/Genitiv-Fragen.
const ohne = (s) => String(s || '').normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');

export const KASUS = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ', 'Ablativ'];
export const PERSONEN = ['1. Person Singular', '2. Person Singular', '3. Person Singular', '1. Person Plural', '2. Person Plural', '3. Person Plural'];

function ganzerGenitiv(v) {
  const f = v.formen || {};
  let g = (f.genitiv || '').trim();
  if (!g) return '';
  if (!g.startsWith('-')) return g.split(/[,\s]/)[0];
  // abgekürzt ("-ī", "-is"): nur ableitbar, wenn Endung passt
  const w = v.wort;
  if (f.deklination === 'a' && /a$/.test(ohne(w))) return w.slice(0, -1) + 'ae';
  if (f.deklination === 'o' && /(us|um)$/.test(ohne(w))) return w.slice(0, -2) + 'ī';
  return '';
}

/** Gibt { sg: [5 Formen], pl: [5 Formen] } (Reihenfolge KASUS) oder null. */
export function dekliniere(v) {
  if (v.wortart !== 'nomen') return null;
  const f = v.formen || {};
  const dekl = f.deklination;
  const gen = ganzerGenitiv(v);
  const w = v.wort.split(/[,\s]/)[0];
  const neutrum = f.genus === 'n';
  if (dekl === 'a' && /a$/.test(ohne(w))) {
    const s = w.slice(0, -1);
    return { sg: [w, s + 'ae', s + 'ae', s + 'am', s + 'ā'], pl: [s + 'ae', s + 'ārum', s + 'īs', s + 'ās', s + 'īs'] };
  }
  if (dekl === 'o' && gen && /i$/.test(ohne(gen))) {
    const s = gen.slice(0, -1);
    if (neutrum) return { sg: [w, s + 'ī', s + 'ō', w, s + 'ō'], pl: [s + 'a', s + 'ōrum', s + 'īs', s + 'a', s + 'īs'] };
    return { sg: [w, s + 'ī', s + 'ō', s + 'um', s + 'ō'], pl: [s + 'ī', s + 'ōrum', s + 'īs', s + 'ōs', s + 'īs'] };
  }
  if (dekl === 'kons' && gen && /is$/.test(ohne(gen))) {
    const s = gen.slice(0, -2);
    if (neutrum) return { sg: [w, s + 'is', s + 'ī', w, s + 'e'], pl: [s + 'a', s + 'um', s + 'ibus', s + 'a', s + 'ibus'] };
    return { sg: [w, s + 'is', s + 'ī', s + 'em', s + 'e'], pl: [s + 'ēs', s + 'um', s + 'ibus', s + 'ēs', s + 'ibus'] };
  }
  return null;
}

function infinitivUndErste(v) {
  const sf = v.formen?.stammformen || [];
  const alle = [v.wort, ...sf];
  const inf = alle.find((x) => /re$/.test(ohne(x)) || ohne(x) === 'esse');
  const erste = alle.find((x) => /o$/.test(ohne(x)) || ohne(x) === 'sum');
  return { inf, erste };
}

/** Präsens Aktiv Indikativ, 6 Formen, oder null. */
export function konjugiere(v) {
  if (v.wortart !== 'verb') return null;
  const { inf, erste } = infinitivUndErste(v);
  const k = v.formen?.konjugation;
  if (ohne(inf) === 'esse') return ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'];
  if (!inf) return null;
  const i = ohne(inf);
  if (k === 'a' && /are$/.test(i)) { const s = inf.slice(0, -3); return ['ō', 'ās', 'at', 'āmus', 'ātis', 'ant'].map((e) => s + e); }
  if (k === 'e' && /ere$/.test(i)) { const s = inf.slice(0, -3); return ['eō', 'ēs', 'et', 'ēmus', 'ētis', 'ent'].map((e) => s + e); }
  if (k === 'i' && /ire$/.test(i)) { const s = inf.slice(0, -3); return ['iō', 'īs', 'it', 'īmus', 'ītis', 'iunt'].map((e) => s + e); }
  if (k === 'kons' && erste && /o$/.test(ohne(erste))) { const s = erste.slice(0, -1); return ['ō', 'is', 'it', 'imus', 'itis', 'unt'].map((e) => s + e); }
  if (k === 'kons-i' && erste && /io$/.test(ohne(erste))) { const s = erste.slice(0, -2); return ['iō', 'is', 'it', 'imus', 'itis', 'iunt'].map((e) => s + e); }
  return null;
}

/** Erzeugt Übungsaufgaben für eine Vokabel. Jede: { art, frage, loesungen[], hinweis? } */
export function formenAufgaben(v) {
  const out = [];
  const f = v.formen || {};
  if (v.wortart === 'nomen' && f.genitiv) {
    out.push({ art: 'genitiv', frage: `Genitiv Singular von ${v.wort}`, loesungen: [ganzerGenitiv(v) || f.genitiv], genus: f.genus });
  }
  if (v.wortart === 'verb' && (f.stammformen?.length || 0) >= 3) {
    const { inf } = infinitivUndErste(v);
    const rest = f.stammformen.filter((x) => x !== inf);
    out.push({ art: 'stammformen', frage: `Stammformen von ${inf || v.wort}`, felder: rest, loesungen: [rest.join(', ')] });
  }
  const d = dekliniere(v);
  if (d) {
    for (let n = 0; n < 2; n++) {
      const num = Math.random() < 0.5 ? 'sg' : 'pl';
      const k = 1 + Math.floor(Math.random() * 4);   // ohne Nominativ Singular
      out.push({ art: 'deklination', frage: `${KASUS[k]} ${num === 'sg' ? 'Singular' : 'Plural'} von ${v.wort}`, loesungen: [d[num][k]], tabelle: d });
    }
  }
  const k = konjugiere(v);
  if (k) {
    for (let n = 0; n < 2; n++) {
      const p = 1 + Math.floor(Math.random() * 5);
      out.push({ art: 'konjugation', frage: `${PERSONEN[p]} Präsens von ${infinitivUndErste(v).inf}`, loesungen: [k[p]], tabelle: k });
    }
  }
  return out;
}

export function tabelleHtml(aufgabe, esc) {
  if (aufgabe.art === 'deklination') {
    const t = aufgabe.tabelle;
    return `<table class="formtab"><tr><th></th><th>Singular</th><th>Plural</th></tr>${KASUS.map((k, i) => `<tr><th>${k}</th><td>${esc(t.sg[i])}</td><td>${esc(t.pl[i])}</td></tr>`).join('')}</table>`;
  }
  if (aufgabe.art === 'konjugation') {
    const t = aufgabe.tabelle;
    return `<table class="formtab">${PERSONEN.map((p, i) => `<tr><th>${p}</th><td>${esc(t[i])}</td></tr>`).join('')}</table>`;
  }
  return '';
}
