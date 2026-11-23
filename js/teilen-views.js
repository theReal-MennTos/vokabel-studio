// Vokabeln teilen (Paket erstellen) und Paket laden – ohne Profile und Lernstand
import * as db from './db.js';
import { lehrwerkName, fach as getFach } from './faecher.js';
import { esc, $, $$, toast, plural } from './util.js';
import { speichereDatei } from './backup.js';
import * as P from './pakete.js';

let wartendesPaket = null;   // aus „Sicherung laden“ weitergereicht
export function paketVormerken(obj) { wartendesPaket = obj; }

// ================= Teilen =================
export async function teilenView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const [units, lehrwerke, voks] = await Promise.all([db.all('units'), db.all('lehrwerke'), db.all('vokabeln')]);
  const n = new Map();
  voks.forEach((v) => n.set(v.unitId, (n.get(v.unitId) || 0) + 1));
  const lw = new Map(lehrwerke.map((l) => [l.id, l]));
  const gruppen = new Map();
  units.filter((u) => n.get(u.id))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }))
    .forEach((u) => { if (!gruppen.has(u.lehrwerkId)) gruppen.set(u.lehrwerkId, []); gruppen.get(u.lehrwerkId).push(u); });
  const html = `
    <div class="msg info small">Ein <strong>Vokabelpaket</strong> enthält nur die eingelesenen Vokabeln mit Lernsätzen und Satzbau-Aufgaben – <strong>keine</strong> Profile, keinen Lernfortschritt und keinen KI-Schlüssel. So können Geschwister, Freunde oder ein zweites Gerät die Vokabeln nutzen, ohne sie selbst einzulesen.</div>
    ${gruppen.size ? [...gruppen].map(([lwId, us]) => `
      <div class="card" style="padding:6px 14px">
        <div class="check-head" style="margin:6px 0"><span class="grow muted small">${esc(lehrwerkName(lw.get(lwId) || {}))}</span>
          <button class="btn secondary" data-alle="${esc(lwId)}" style="min-height:40px;padding:4px 12px;font-size:15px">alle</button></div>
        ${us.map((u) => `<label class="switch" style="display:flex;min-height:48px">
          <input type="checkbox" class="t-unit" data-lw="${esc(lwId)}" value="${esc(u.id)}">
          <span class="grow">${getFach(lw.get(lwId)?.fachId)?.formenTyp === 'latein' ? 'Lektion' : 'Unit'} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span>
          <span class="badge">${n.get(u.id)}</span></label>`).join('')}
      </div>`).join('') : '<div class="card empty"><p>Noch keine Vokabeln zum Teilen.</p></div>'}
    <div class="card" id="t-summe" style="position:sticky;bottom:calc(8px + env(safe-area-inset-bottom))"></div>
    <p class="muted small">Hinweis: Abgeschriebene Schulbuch-Vokabeln bitte nur privat weitergeben (Familie, Freunde), nicht öffentlich ins Internet stellen.</p>`;
  return {
    title: 'Vokabeln teilen', back: 'backup', html,
    bind(root) {
      const aktualisiere = () => {
        const ids = $$('.t-unit:checked', root).map((c) => c.value);
        const summe = ids.reduce((s, id) => s + (n.get(id) || 0), 0);
        $('#t-summe', root).innerHTML = `<button class="btn block" id="t-los" ${ids.length ? '' : 'disabled'}>📦 ${ids.length ? `Paket mit ${plural(ids.length, 'Unit', 'Units')} (${summe} Vokabeln) teilen` : 'Units auswählen'}</button>`;
        $('#t-los', root).onclick = async () => {
          const paket = await P.erstellePaket(ids);
          const r = await speichereDatei(P.paketDateiname(paket), JSON.stringify(paket));
          if (r !== 'abgebrochen') toast(r === 'geteilt' ? 'Paket geteilt ✓' : 'Paket gespeichert ✓');
        };
      };
      $$('.t-unit', root).forEach((c) => c.onchange = aktualisiere);
      $$('[data-alle]', root).forEach((b) => b.onclick = () => {
        const boxen = $$(`.t-unit[data-lw="${b.dataset.alle}"]`, root);
        const alleAn = boxen.every((x) => x.checked);
        boxen.forEach((x) => { x.checked = !alleAn; });
        aktualisiere();
      });
      aktualisiere();
    }
  };
}

// ================= Paket laden =================
export async function paketLadenView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const paket = wartendesPaket;
  let html;
  if (!paket) {
    html = `
      <div class="msg info small">Lade ein Vokabelpaket, das dir jemand geschickt hat (z. B. per WhatsApp, Mail oder AirDrop). Deine Profile und dein Lernfortschritt bleiben unverändert.</div>
      <label class="btn block" for="p-datei">📂 Paket-Datei auswählen</label>
      <input id="p-datei" type="file" accept=".json,application/json" hidden>
      <div id="p-info"></div>`;
  } else {
    const liste = await P.vorschau(paket);
    const faecherProfil = ctx.profil.fachIds || [];
    html = `
      <div class="msg ok small">Paket vom ${esc(new Date(paket.erstelltAm).toLocaleDateString('de-DE'))} mit ${plural(liste.length, 'Unit', 'Units')} und ${liste.reduce((s, u) => s + u.vokabeln, 0)} Vokabeln.</div>
      ${liste.map((u) => `
        <div class="card">
          <div class="muted small">${esc(u.lehrwerk)}${u.lehrwerkNeu ? ' <span class="badge">Buch wird angelegt</span>' : ''}</div>
          <strong>Unit ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</strong> <span class="badge">${u.vokabeln}</span>
          ${u.vorhanden
            ? `<p class="small" style="margin:6px 0">Diese Unit hast du schon. ${u.neueVok ? `<strong>${plural(u.neueVok, 'Vokabel ist', 'Vokabeln sind')} neu.</strong>` : 'Keine neuen Vokabeln.'}</p>
               <select class="p-modus" data-u="${esc(u.unitId)}">
                 <option value="ergaenzen">Nur Neues ergänzen</option>
                 <option value="aktualisieren">Ergänzen und vorhandene Vokabeln aktualisieren</option>
                 <option value="ueberspringen">Überspringen</option>
               </select>`
            : `<label class="switch" style="margin-top:6px"><input type="checkbox" class="p-neu" data-u="${esc(u.unitId)}" checked> übernehmen</label>`}
          ${faecherProfil.length && !faecherProfil.includes(u.fachId) ? `<p class="small" style="color:var(--warn)">Hinweis: Das Fach ${esc(getFach(u.fachId)?.name || u.fachId)} ist in deinem Profil nicht ausgewählt. Unter Profil bearbeiten kannst du es ergänzen.</p>` : ''}
        </div>`).join('')}
      <button class="btn block" id="p-los">✓ Vokabeln übernehmen</button>
      <button class="btn secondary block" id="p-abbruch" style="margin-top:10px">Abbrechen</button>`;
  }
  return {
    title: 'Vokabelpaket laden', back: 'bibliothek', html,
    bind(root) {
      const datei = $('#p-datei', root);
      if (datei) datei.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        let obj;
        try { obj = JSON.parse(await f.text()); } catch { $('#p-info', root).innerHTML = '<div class="msg err">Die Datei ist beschädigt oder keine JSON-Datei.</div>'; return; }
        if (obj?.format === 'vokabel-studio-backup') { $('#p-info', root).innerHTML = '<div class="msg warn">Das ist eine komplette Sicherung (mit Profilen). Die lädst du unter <a href="#/backup">Sicherung</a>.</div>'; return; }
        const err = P.pruefePaket(obj);
        if (err) { $('#p-info', root).innerHTML = `<div class="msg err">${esc(err)}</div>`; return; }
        wartendesPaket = obj; ctx.rerender();
      };
      const los = $('#p-los', root);
      if (los) los.onclick = async () => {
        const ent = {};
        $$('.p-modus', root).forEach((s) => { ent[s.dataset.u] = s.value; });
        $$('.p-neu', root).forEach((c) => { ent[c.dataset.u] = c.checked ? 'ergaenzen' : 'ueberspringen'; });
        los.disabled = true; los.textContent = 'Übernehme …';
        try {
          const st = await P.importiere(paket, ent);
          wartendesPaket = null;
          toast(`✓ ${plural(st.units, 'Unit', 'Units')}: ${st.neueVok} neue Vokabeln${st.aktualisiert ? `, ${st.aktualisiert} aktualisiert` : ''}`, 4000);
          ctx.go('bibliothek');
        } catch (e) { toast('Hat nicht geklappt: ' + e.message); los.disabled = false; los.textContent = '✓ Vokabeln übernehmen'; }
      };
      const ab = $('#p-abbruch', root);
      if (ab) ab.onclick = () => { wartendesPaket = null; ctx.go('bibliothek'); };
    }
  };
}
