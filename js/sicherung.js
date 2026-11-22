// Sicherung: Teilen/Download, Ordner-Ablage (File System Access API) mit Auto-Sicherung, Erinnerung.
// Cloud-Dienste (OneDrive, Dropbox, Google Drive, iCloud) laufen über die Dateien-App bzw. einen synchronisierten Ordner –
// keine direkte Anmeldung, keine API-Schlüssel.
import * as db from './db.js';
import { erstelleBackup, backupDateiname, speichereDatei } from './backup.js';

export const ORDNER_MOEGLICH = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const BEHALTEN = 10;   // so viele Sicherungen bleiben im Ordner

export async function letzteSicherung() { return db.getMeta('letztesBackup'); }
async function merke(art) {
  const jetzt = new Date().toISOString();
  await db.setMeta('letztesBackup', jetzt);
  await db.setMeta('letztesBackupArt', art);
}

// ---------- Teilen / Herunterladen ----------
export async function sichereAlsDatei() {
  const data = await erstelleBackup();
  const r = await speichereDatei(backupDateiname(), JSON.stringify(data));
  if (r !== 'abgebrochen') await merke(r);
  return r;
}

// ---------- Ordner-Ablage ----------
export async function ordner() { return ORDNER_MOEGLICH ? db.getMeta('sicherungsOrdner') : null; }

export async function waehleOrdner() {
  const handle = await window.showDirectoryPicker({ id: 'vokabel-studio', mode: 'readwrite', startIn: 'documents' });
  await db.setMeta('sicherungsOrdner', handle);
  return handle;
}

export async function entferneOrdner() { await db.del('meta', 'sicherungsOrdner'); await db.setMeta('autoSicherung', false); }

async function erlaubnis(handle, fragen) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return fragen ? (await handle.requestPermission(opts)) === 'granted' : false;
}

/** Schreibt die Sicherung in den gewählten Ordner. fragen=false → nur wenn Erlaubnis schon besteht (Auto-Sicherung). */
export async function sichereInOrdner({ fragen = true } = {}) {
  const handle = await ordner();
  if (!handle) return { ok: false, grund: 'Kein Ordner gewählt.' };
  if (!(await erlaubnis(handle, fragen))) return { ok: false, grund: 'Kein Schreibzugriff auf den Ordner.' };
  const name = backupDateiname();
  const datei = await handle.getFileHandle(name, { create: true });
  const w = await datei.createWritable();
  await w.write(JSON.stringify(await erstelleBackup()));
  await w.close();
  await merke('ordner');
  await aufraeumen(handle);
  return { ok: true, name, ordner: handle.name };
}

async function aufraeumen(handle) {
  const namen = [];
  for await (const [name, h] of handle.entries()) if (h.kind === 'file' && /^vokabel-studio-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) namen.push(name);
  namen.sort().reverse();
  for (const n of namen.slice(BEHALTEN)) { try { await handle.removeEntry(n); } catch { /* egal */ } }
}

export async function sicherungenImOrdner() {
  const handle = await ordner();
  if (!handle || !(await erlaubnis(handle, true))) return [];
  const out = [];
  for await (const [name, h] of handle.entries()) {
    if (h.kind === 'file' && /^vokabel-studio-backup-.*\.json$/.test(name)) out.push({ name, handle: h });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

// ---------- Automatik & Erinnerung ----------
export async function autoSicherung() {
  if (!(await db.getMeta('autoSicherung', false))) return null;
  const letzte = await letzteSicherung();
  if (letzte && Date.now() - new Date(letzte).getTime() < 20 * 3600 * 1000) return null;   // höchstens 1× täglich
  try { return await sichereInOrdner({ fragen: false }); } catch { return null; }
}

export async function erinnerungFaellig() {
  const tage = await db.getMeta('erinnerungTage', 7);
  if (!tage) return null;
  const voks = await db.all('vokabeln');
  if (!voks.length) return null;
  const letzte = await letzteSicherung();
  const seit = letzte ? Math.floor((Date.now() - new Date(letzte).getTime()) / 86400000) : null;
  if (seit === null || seit >= tage) return { seit };
  return null;
}
