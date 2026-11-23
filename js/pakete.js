// Vokabelpakete: nur Inhalte (Bücher, Units, Vokabeln, Sätze, Aufgaben) – ohne Profile, Lernstand, KI-Schlüssel.
// Beim Laden werden vorhandene Units des Empfängers ergänzt statt überschrieben; dessen Lernstand bleibt erhalten.
import * as db from './db.js';
import { uid, normWort } from './util.js';
import { lehrwerkName } from './faecher.js';

export const FORMAT = 'vokabel-studio-paket';
export const VERSION = 1;

export async function erstellePaket(unitIds) {
  const units = (await Promise.all(unitIds.map((id) => db.get('units', id)))).filter(Boolean);
  const lwIds = [...new Set(units.map((u) => u.lehrwerkId))];
  const lehrwerke = (await Promise.all(lwIds.map((id) => db.get('lehrwerke', id)))).filter(Boolean);
  const holen = async (store) => (await Promise.all(units.map((u) => db.byIndex(store, 'unitId', u.id)))).flat();
  const [parts, vokabeln, lernsaetze, satzbau, material] = await Promise.all(['parts', 'vokabeln', 'lernsaetze', 'satzbau', 'material'].map(holen));
  // Interna, die beim Empfänger keinen Sinn ergeben, entfernen
  const sauber = (x) => { const { importId, ...rest } = x; return rest; };
  return {
    format: FORMAT, schemaVersion: VERSION, erstelltAm: new Date().toISOString(),
    uebersicht: units.map((u) => ({
      lehrwerk: lehrwerkName(lehrwerke.find((l) => l.id === u.lehrwerkId) || {}), nummer: u.nummer, titel: u.titel,
      vokabeln: vokabeln.filter((v) => v.unitId === u.id).length
    })),
    inhalte: {
      lehrwerke: lehrwerke.map(sauber),
      units: units.map((u) => { const { importIds, ...rest } = u; return { ...rest, importIds: [] }; }),
      parts: parts.map(sauber), vokabeln: vokabeln.map(sauber), lernsaetze: lernsaetze.map(sauber),
      satzbau: satzbau.map(sauber), material: material.map(sauber)
    }
  };
}

export function paketDateiname(paket) {
  const u = paket.uebersicht || [];
  const teil = u.length === 1 ? `unit-${u[0].nummer}` : `${u.length}-units`;
  const lw = (u[0]?.lehrwerk || 'vokabeln').toLowerCase().replace(/[^a-z0-9äöü]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `vokabelpaket-${lw}-${teil}.json`;
}

export function pruefePaket(obj) {
  if (!obj || obj.format !== FORMAT) return 'Das ist kein Vokabelpaket.';
  if (obj.schemaVersion > VERSION) return 'Dieses Paket stammt aus einer neueren App-Version. Bitte die App aktualisieren.';
  if (!Array.isArray(obj.inhalte?.units) || !obj.inhalte.units.length) return 'Das Paket enthält keine Units.';
  return null;
}

// Passendes Lehrwerk beim Empfänger finden (gleiche ID, sonst gleicher Titel + Band + Fach)
async function lehrwerkFuer(paketLw) {
  const direkt = await db.get('lehrwerke', paketLw.id);
  if (direkt) return { id: direkt.id, neu: false };
  const alle = await db.all('lehrwerke');
  const gleich = alle.find((l) => l.fachId === paketLw.fachId && normWort(l.titel) === normWort(paketLw.titel) && String(l.band || '') === String(paketLw.band || ''));
  return gleich ? { id: gleich.id, neu: false } : { id: paketLw.id, neu: true };
}

/** Vorschau: je Unit, ob sie neu ist oder schon existiert, und wie viele Vokabeln neu dazukommen. */
export async function vorschau(paket) {
  const I = paket.inhalte;
  const out = [];
  for (const u of I.units) {
    const plw = I.lehrwerke.find((l) => l.id === u.lehrwerkId) || { id: u.lehrwerkId, titel: '?', fachId: 'englisch' };
    const lw = await lehrwerkFuer(plw);
    const vorhanden = lw.neu ? null : (await db.byIndex('units', 'lehrwerkId', lw.id)).find((x) => normWort(x.nummer) === normWort(u.nummer));
    const pv = I.vokabeln.filter((v) => v.unitId === u.id);
    let neueVok = pv.length;
    if (vorhanden) {
      const da = new Set((await db.byIndex('vokabeln', 'unitId', vorhanden.id)).map((v) => normWort(v.wort)));
      neueVok = pv.filter((v) => !da.has(normWort(v.wort))).length;
    }
    out.push({ unitId: u.id, lehrwerk: lehrwerkName(plw), fachId: plw.fachId, nummer: u.nummer, titel: u.titel, vokabeln: pv.length, vorhanden: !!vorhanden, neueVok, lehrwerkNeu: lw.neu });
  }
  return out;
}

/**
 * entscheidungen: { [paketUnitId]: 'ergaenzen' | 'aktualisieren' | 'ueberspringen' }
 *  ergaenzen     – nur fehlende Vokabeln/Sätze hinzufügen
 *  aktualisieren – zusätzlich vorhandene Vokabeln mit dem Paketinhalt überschreiben (Lernstand bleibt, IDs bleiben)
 */
export async function importiere(paket, entscheidungen = {}) {
  const I = paket.inhalte;
  const ops = [];
  const statistik = { units: 0, neueVok: 0, aktualisiert: 0, saetze: 0 };
  const jetzt = new Date().toISOString();

  for (const pu of I.units) {
    const modus = entscheidungen[pu.id] || 'ergaenzen';
    if (modus === 'ueberspringen') continue;
    const plw = I.lehrwerke.find((l) => l.id === pu.lehrwerkId) || { id: pu.lehrwerkId, titel: 'Unbekanntes Buch', fachId: 'englisch', band: '' };
    const lw = await lehrwerkFuer(plw);
    if (lw.neu) ops.push({ store: 'lehrwerke', op: 'put', value: { ...plw, vorinstalliert: false } });

    let unit = lw.neu ? null : (await db.byIndex('units', 'lehrwerkId', lw.id)).find((x) => normWort(x.nummer) === normWort(pu.nummer));
    const vorhandeneParts = unit ? await db.byIndex('parts', 'unitId', unit.id) : [];
    const vorhandeneVok = unit ? await db.byIndex('vokabeln', 'unitId', unit.id) : [];
    const vorhandeneSaetze = unit ? await db.byIndex('lernsaetze', 'unitId', unit.id) : [];
    const vorhandeneSb = unit ? await db.byIndex('satzbau', 'unitId', unit.id) : [];
    if (!unit) {
      // ID nur übernehmen, wenn sie beim Empfänger frei ist
      const idFrei = !(await db.get('units', pu.id));
      unit = { ...pu, id: idFrei ? pu.id : uid('u'), lehrwerkId: lw.id, importIds: [], erstelltAm: jetzt, geaendertAm: jetzt };
    } else {
      unit = { ...unit, titel: unit.titel || pu.titel, geaendertAm: jetzt };
    }
    ops.push({ store: 'units', op: 'put', value: unit });
    statistik.units++;

    // Parts zuordnen
    const partMap = new Map();   // paketPartId → lokale Part-ID
    let reihe = vorhandeneParts.reduce((m, p) => Math.max(m, p.reihenfolge || 0), 0);
    for (const pp of I.parts.filter((p) => p.unitId === pu.id)) {
      const da = vorhandeneParts.find((p) => p.kennung.toLowerCase() === pp.kennung.toLowerCase());
      if (da) partMap.set(pp.id, da.id);
      else {
        const neu = { ...pp, id: uid('p'), unitId: unit.id, reihenfolge: ++reihe };
        partMap.set(pp.id, neu.id);
        ops.push({ store: 'parts', op: 'put', value: neu });
      }
    }

    // Vokabeln
    const vokMap = new Map();   // paketVokId → lokale Vok-ID
    const nachWort = new Map(vorhandeneVok.map((v) => [normWort(v.wort), v]));
    let vReihe = vorhandeneVok.reduce((m, v) => Math.max(m, v.reihenfolge || 0), 0);
    for (const pv of I.vokabeln.filter((v) => v.unitId === pu.id)) {
      const da = nachWort.get(normWort(pv.wort));
      if (da) {
        vokMap.set(pv.id, da.id);
        if (modus === 'aktualisieren') {
          ops.push({ store: 'vokabeln', op: 'put', value: { ...pv, id: da.id, unitId: unit.id, partId: partMap.get(pv.partId) || da.partId, reihenfolge: da.reihenfolge } });
          statistik.aktualisiert++;
        }
      } else {
        const neu = { ...pv, id: uid('v'), unitId: unit.id, partId: partMap.get(pv.partId) || [...partMap.values()][0], reihenfolge: ++vReihe };
        vokMap.set(pv.id, neu.id);
        nachWort.set(normWort(neu.wort), neu);
        ops.push({ store: 'vokabeln', op: 'put', value: neu });
        statistik.neueVok++;
      }
    }

    // Lernsätze und Satzbau (nur, was es noch nicht gibt)
    const schonSatz = new Set(vorhandeneSaetze.map((s) => normWort(s.fremd)));
    for (const ps of I.lernsaetze.filter((s) => s.unitId === pu.id)) {
      if (schonSatz.has(normWort(ps.fremd))) continue;
      ops.push({ store: 'lernsaetze', op: 'put', value: { ...ps, id: uid('s'), unitId: unit.id, partId: partMap.get(ps.partId) || null, vokabelIds: (ps.vokabelIds || []).map((x) => vokMap.get(x)).filter(Boolean) } });
      statistik.saetze++;
    }
    const schonSb = new Set(vorhandeneSb.map((s) => normWort(s.loesung)));
    for (const ps of I.satzbau.filter((s) => s.unitId === pu.id)) {
      if (schonSb.has(normWort(ps.loesung))) continue;
      ops.push({ store: 'satzbau', op: 'put', value: { ...ps, id: uid('b'), unitId: unit.id, partId: partMap.get(ps.partId) || null, vokabelIds: (ps.vokabelIds || []).map((x) => vokMap.get(x)).filter(Boolean) } });
      statistik.saetze++;
    }
    for (const pm of (I.material || []).filter((m) => m.unitId === pu.id)) {
      ops.push({ store: 'material', op: 'put', value: { ...pm, id: uid('m'), unitId: unit.id, vokabelIds: (pm.vokabelIds || []).map((x) => vokMap.get(x)).filter(Boolean) } });
    }
  }
  await db.batch(ops);
  return statistik;
}
