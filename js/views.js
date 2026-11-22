// Ansichten (außer Import): Profile, Start, Bibliothek, Unit, Vokabel, Backup, Einstellungen
import * as db from './db.js';
import { FAECHER, WORTARTEN, WORTART_NAMEN, SPRACH_NAMEN, SPRACH_LANG, fach as getFach, lehrwerkName } from './faecher.js';
import { esc, uid, toast, $, $$, datum, plural, isStandalone, isIOS } from './util.js';
import { sprich, ttsVerfuegbar } from './speech.js';
import * as backup from './backup.js';
import { pruefe, speichere } from './import.js';
import { APP_VERSION } from './config.js';

const AVATARE = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐧', '🐨', '🐵', '🦖', '🐬', '🚀', '⚽', '🎸', '🌟'];

function brauchtProfil(ctx) {
  if (!ctx.profil) { ctx.go('profile'); return true; }
  return false;
}

// Vorlese-Knöpfe: <button class="speak" data-say="…" data-lang="en-GB">
export function bindSprechen(root, ctx) {
  $$('[data-say]', root).forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = await sprich(b.dataset.say, b.dataset.lang, { rate: ctx.profil?.einstellungen?.sprechtempo || 0.9 });
      if (!r.ok) toast(r.grund);
    };
  });
}
const speakBtn = (text, lang, klein = false, label = 'Vorlesen') =>
  ttsVerfuegbar() ? `<button class="speak${klein ? ' small' : ''}" data-say="${esc(text)}" data-lang="${esc(lang)}" aria-label="${esc(label)}">🔊</button>` : '';

// ---------- Start / Profile ----------

export async function startView(_p, ctx) {
  ctx.go(ctx.profil ? 'home' : 'profile');
  return null;
}

export async function profileView(_p, ctx) {
  const profile = (await db.all('profile')).sort((a, b) => a.name.localeCompare(b.name));
  const html = `
    ${profile.length ? '<p class="muted">Wer lernt jetzt?</p>' : `
      <div class="card"><h2 style="margin-top:0">Willkommen bei Vokabel-Studio! 👋</h2>
      <p>Hier lernst du die Vokabeln aus deinem Schulbuch. Leg zuerst ein Profil an – jedes Kind auf diesem Gerät bekommt sein eigenes.</p></div>`}
    <div class="profile-grid">
      ${profile.map((p) => `
        <button class="tile profile-tile" data-profil="${esc(p.id)}">
          <span class="tile-icon">${esc(p.avatar)}</span>
          <span class="tile-title">${esc(p.name)}</span>
        </button>`).join('')}
      <a class="tile profile-tile" href="#/profil-neu">
        <span class="tile-icon">➕</span><span class="tile-title">Neues Profil</span>
      </a>
    </div>
    ${profile.length ? `<h3>Profile bearbeiten</h3><div class="card" style="padding:0"><ul class="list">
      ${profile.map((p) => `<li><a class="list-item" href="#/profil/${esc(p.id)}"><span>${esc(p.avatar)}</span><span class="grow">${esc(p.name)}</span><span class="chev">›</span></a></li>`).join('')}
    </ul></div>` : ''}`;
  return {
    title: 'Profil wählen', hideProfile: true, html,
    bind(root) {
      $$('[data-profil]', root).forEach((b) => b.onclick = () => { ctx.setzeAktivesProfil(b.dataset.profil); ctx.go('home'); });
    }
  };
}

export async function profilFormView({ id }, ctx) {
  const p = id ? await db.get('profile', id) : null;
  if (id && !p) { ctx.go('profile'); return null; }
  const d = p || { name: '', avatar: AVATARE[Math.floor(Math.random() * AVATARE.length)], fachIds: ['englisch'] };
  const html = `
    <label for="pf-name">Wie heißt du?</label>
    <input id="pf-name" type="text" maxlength="30" autocomplete="off" value="${esc(d.name)}" placeholder="Vorname">
    <label>Dein Bild</label>
    <div class="emoji-pick" id="pf-avatar">
      ${AVATARE.map((a) => `<button type="button" class="${a === d.avatar ? 'on' : ''}" data-a="${a}" aria-label="Bild ${a}">${a}</button>`).join('')}
    </div>
    <label>Deine Fächer</label>
    <div class="btn-row" id="pf-faecher">
      ${FAECHER.map((f) => `<label class="btn secondary switch"><input type="checkbox" value="${f.id}" ${d.fachIds?.includes(f.id) ? 'checked' : ''}> ${f.icon} ${esc(f.name)}</label>`).join('')}
    </div>
    <div class="btn-row"><button class="btn" id="pf-save">${p ? 'Speichern' : 'Profil anlegen'}</button></div>
    ${p ? '<div class="btn-row"><button class="btn danger" id="pf-del">Profil löschen</button></div>' : ''}`;
  return {
    title: p ? 'Profil bearbeiten' : 'Neues Profil', back: 'profile', hideProfile: true, html,
    bind(root) {
      let avatar = d.avatar;
      $$('#pf-avatar button', root).forEach((b) => b.onclick = () => {
        avatar = b.dataset.a;
        $$('#pf-avatar button', root).forEach((x) => x.classList.toggle('on', x === b));
      });
      $('#pf-save', root).onclick = async () => {
        const name = $('#pf-name', root).value.trim();
        if (!name) { toast('Bitte einen Namen eingeben.'); $('#pf-name', root).focus(); return; }
        const fachIds = $$('#pf-faecher input:checked', root).map((i) => i.value);
        if (!fachIds.length) { toast('Wähle mindestens ein Fach.'); return; }
        const rec = p ? { ...p, name, avatar, fachIds } : {
          id: uid('pr'), name, avatar, fachIds, lehrwerkIds: [], erstelltAm: new Date().toISOString(),
          einstellungen: { abfrageRichtung: 'beide', vorlesenAutomatisch: false, sprechtempo: 0.9, tagesziel: 20 }
        };
        await db.put('profile', rec);
        if (!p) {
          await db.put('belohnungen', { profilId: rec.id, punkte: 0, serie: { aktuell: 0, rekord: 0 }, abzeichen: [] });
          ctx.setzeAktivesProfil(rec.id);
        }
        toast(p ? 'Gespeichert.' : `Hallo ${name}! 🎉`);
        ctx.go(p ? 'profile' : 'home');
      };
      if (p) $('#pf-del', root).onclick = async () => {
        if (!confirm(`Profil „${p.name}“ mit allen Lernständen löschen? Die Vokabeln bleiben erhalten. Das kann man nicht rückgängig machen.`)) return;
        const ops = [{ store: 'profile', op: 'del', key: p.id }, { store: 'belohnungen', op: 'del', key: p.id }];
        for (const s of ['lernstand', 'ereignisse', 'termine', 'tests']) {
          for (const r of await db.byIndex(s, 'profilId', p.id)) ops.push({ store: s, op: 'del', key: r.key || r.id });
        }
        await db.batch(ops);
        if (ctx.profil?.id === p.id) ctx.setzeAktivesProfil(null);
        toast('Profil gelöscht.');
        ctx.go('profile');
      };
    }
  };
}

// ---------- Startseite ----------

export async function homeView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const [units, voks] = await Promise.all([db.all('units'), db.all('vokabeln')]);
  const lehrwerke = new Map((await db.all('lehrwerke')).map((l) => [l.id, l]));
  const zuletzt = units.sort((a, b) => (b.geaendertAm || '').localeCompare(a.geaendertAm || '')).slice(0, 3);
  const [{ faelligePaare, tageBis, heute: heuteIso }, { naechsterTermin }, { hole }] = await Promise.all([import('./lernen.js'), import('./plan-views.js'), import('./belohnung.js')]);
  const [fp, termin, bel] = await Promise.all([voks.length ? faelligePaare(ctx.profil) : { faellig: [] }, naechsterTermin(ctx.profil.id), hole(ctx.profil.id)]);
  const tb = termin ? tageBis(termin.datum) : 0;
  const heuteInfo = {
    faellig: fp.faellig.length, neu: fp.neuGesamt || 0, punkte: bel.punkte, serie: bel.serie.letzterLerntag ? bel.serie.aktuell : 0, termin,
    terminText: termin ? (tb === 0 ? 'ist heute!' : tb === 1 ? 'ist morgen' : `in ${tb} Tagen`) : '',
    terminOffen: termin?.plan?.find((d) => d.datum === heuteIso())?.aufgaben.some((a) => !a.erledigt)
  };
  const tile = (href, icon, title, sub, soon = false) => soon
    ? `<div class="tile soon" aria-disabled="true"><span class="tile-icon">${icon}</span><span class="tile-title">${title}</span><span class="tile-sub">${sub}</span></div>`
    : `<a class="tile" href="${href}"><span class="tile-icon">${icon}</span><span class="tile-title">${title}</span><span class="tile-sub">${sub}</span></a>`;
  const html = `
    <h2 style="margin-top:4px">Hallo ${esc(ctx.profil.name)}! ${esc(ctx.profil.avatar)}</h2>
    <p class="muted">${plural(units.length, 'Unit', 'Units')} · ${plural(voks.length, 'Vokabel', 'Vokabeln')} auf diesem Gerät</p>
    ${voks.length ? `<div class="card heute">
      <div class="check-head"><strong class="grow">Heute</strong>${heuteInfo.serie ? `<span class="badge warn">🔥 ${heuteInfo.serie}</span>` : ''}</div>
      <p style="margin:6px 0">${heuteInfo.faellig ? `<strong>${heuteInfo.faellig}</strong> Vokabeln sind fällig.` : heuteInfo.neu ? `Nichts fällig. <strong>${heuteInfo.neu}</strong> Vokabeln hast du noch nie geübt.` : 'Nichts fällig – super! 🎉'}</p>
      ${heuteInfo.termin ? `<p class="small" style="margin:6px 0">📝 <a href="#/termin/${esc(heuteInfo.termin.id)}">${esc(heuteInfo.termin.titel)}</a> ${heuteInfo.terminText}</p>` : ''}
      <a class="btn block" href="${heuteInfo.termin && heuteInfo.terminOffen ? '#/termin/' + esc(heuteInfo.termin.id) : heuteInfo.faellig ? '#/plan' : '#/lernen'}">${heuteInfo.termin && heuteInfo.terminOffen ? '📅 Heutige Aufgaben' : (heuteInfo.faellig ? '🔁 Wiederholen' : '🃏 Lernen')}</a>
    </div>` : ''}
    <div class="grid">
      ${tile('#/lernen', '🃏', 'Lernen', 'Karten, Abfrage, Satzbau, Test')}
      ${tile('#/plan', '📅', 'Lernplan', 'Fälliges & Vokabeltest-Termine')}
      ${tile('#/import', '📸', 'Vokabelseite einlesen', 'Foto → Chatbot → hier einfügen')}
      ${tile('#/bibliothek', '📚', 'Meine Bücher', 'Units und Vokabeln ansehen')}
      ${tile('#/erfolge', '🏆', 'Erfolge', `⭐ ${heuteInfo.punkte} Punkte · 🔥 ${heuteInfo.serie} Tage`)}
      ${tile('#/eltern', '👪', 'Eltern', 'Lernfortschritt ansehen')}
      ${tile('#/backup', '💾', 'Sicherung', 'Daten sichern und laden')}
      ${tile('#/einstellungen', '⚙️', 'Einstellungen', 'Vorlesen, iPhone-Test')}
    </div>
    ${zuletzt.length ? `<h3>Zuletzt bearbeitet</h3><div class="card" style="padding:0"><ul class="list">
      ${zuletzt.map((u) => `<li><a class="list-item" href="#/unit/${esc(u.id)}"><span class="grow">
        <span class="vok-wort">Unit ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span><br>
        <span class="vok-de">${esc(lehrwerke.get(u.lehrwerkId) ? lehrwerkName(lehrwerke.get(u.lehrwerkId)) : '')}</span></span><span class="chev">›</span></a></li>`).join('')}
    </ul></div>` : ''}
    ${isIOS() && !isStandalone() ? `<div class="msg info small">📱 Tipp: In Safari auf <strong>Teilen ⬆︎ › Zum Home-Bildschirm</strong> tippen. Dann startet Vokabel-Studio wie eine App.<br>
      Achtung: Safari und die Home-Bildschirm-App speichern getrennt. Lege die App am besten <strong>vor</strong> dem ersten Einlesen auf den Home-Bildschirm.</div>` : ''}`;
  return { title: 'Vokabel-Studio', html };
}

// ---------- Bibliothek ----------

async function zaehleUnits() {
  const [units, voks] = await Promise.all([db.all('units'), db.all('vokabeln')]);
  const vokProUnit = new Map();
  voks.forEach((v) => vokProUnit.set(v.unitId, (vokProUnit.get(v.unitId) || 0) + 1));
  return { units, vokProUnit };
}

export async function bibliothekView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const lehrwerke = await db.all('lehrwerke');
  const { units, vokProUnit } = await zaehleUnits();
  const faecher = FAECHER.filter((f) => !ctx.profil.fachIds?.length || ctx.profil.fachIds.includes(f.id));
  const html = `
    ${!units.length ? `<div class="card empty"><div class="big">📭</div>
      <p>Noch keine Vokabeln da.<br>Lies eine Seite aus deinem Buch ein – oder probier die App mit Beispiel-Units aus.</p>
      <div class="btn-row"><a class="btn" href="#/import">📸 Seite einlesen</a><button class="btn secondary" id="demo-laden">Beispiel-Units laden</button></div></div>` : ''}
    ${faecher.map((f) => {
      const lws = lehrwerke.filter((l) => l.fachId === f.id).sort((a, b) => lehrwerkName(a).localeCompare(lehrwerkName(b)));
      return `<h2>${f.icon} ${esc(f.name)}</h2>
        <div class="card" style="padding:0"><ul class="list">
        ${lws.map((l) => {
          const us = units.filter((u) => u.lehrwerkId === l.id);
          const nv = us.reduce((s, u) => s + (vokProUnit.get(u.id) || 0), 0);
          return `<li><a class="list-item" href="#/lehrwerk/${esc(l.id)}"><span class="grow">
            <span class="vok-wort">${esc(lehrwerkName(l))}</span><br>
            <span class="vok-de">${l.klasse ? 'Klasse ' + esc(l.klasse) + ' · ' : ''}${plural(us.length, 'Unit', 'Units')} · ${plural(nv, 'Vokabel', 'Vokabeln')}</span>
            </span><span class="chev">›</span></a></li>`;
        }).join('')}
        <li><a class="list-item" href="#/lehrwerk-neu/${f.id}"><span class="grow muted">➕ Anderes Buch hinzufügen</span></a></li>
        </ul></div>`;
    }).join('')}`;
  return {
    title: 'Meine Bücher', back: 'home', html,
    bind(root) {
      const b = $('#demo-laden', root);
      if (b) b.onclick = async () => {
        b.disabled = true; b.textContent = 'Lade …';
        try { const n = await ladeDemo(); toast(`${n} Beispiel-Vokabeln geladen.`); ctx.rerender(); }
        catch (e) { toast('Laden fehlgeschlagen: ' + e.message); b.disabled = false; }
      };
    }
  };
}

export async function ladeDemo() {
  const demos = [
    { datei: 'demo/demo-englisch.json', lw: { id: 'lw_demo_en', fachId: 'englisch', titel: 'Beispiel-Lehrwerk Englisch', verlag: '', band: '', klasse: 6 } },
    { datei: 'demo/demo-latein.json', lw: { id: 'lw_demo_la', fachId: 'latein', titel: 'Beispiel-Lehrwerk Latein', verlag: '', band: '', klasse: 7 } }
  ];
  let n = 0;
  for (const d of demos) {
    await db.put('lehrwerke', d.lw);
    const json = await (await fetch(d.datei)).json();
    const p = pruefe(json, { fachId: d.lw.fachId, unitNummer: json.unit.nummer });
    if (p.fehler.length) throw new Error(p.fehler[0]);
    const r = await speichere(p.daten, { lehrwerkId: d.lw.id, unitNummer: json.unit.nummer, unitTitel: json.unit.titel, rohtext: '(Beispiel)' });
    n += r.neu;
  }
  return n;
}

export async function lehrwerkView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const lw = await db.get('lehrwerke', id);
  if (!lw) { ctx.go('bibliothek'); return null; }
  const { vokProUnit } = await zaehleUnits();
  const units = (await db.byIndex('units', 'lehrwerkId', id))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));
  const f = getFach(lw.fachId);
  const html = `
    <p class="muted">${f.icon} ${esc(f.name)}${lw.verlag ? ' · ' + esc(lw.verlag) : ''}${lw.ausgabe ? ' · ' + esc(lw.ausgabe) : ''}${lw.klasse ? ' · Klasse ' + esc(lw.klasse) : ''}</p>
    <div class="btn-row"><a class="btn" href="#/import?lw=${esc(id)}">📸 Neue Seite einlesen</a></div>
    ${units.length ? `<div class="card" style="padding:0"><ul class="list">
      ${units.map((u) => `<li><a class="list-item" href="#/unit/${esc(u.id)}"><span class="grow">
        <span class="vok-wort">${f.formenTyp === 'latein' ? 'Lektion' : 'Unit'} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span><br>
        <span class="vok-de">${plural(vokProUnit.get(u.id) || 0, 'Vokabel', 'Vokabeln')}</span></span><span class="chev">›</span></a></li>`).join('')}
    </ul></div>` : '<div class="card empty"><p>In diesem Buch sind noch keine Units eingelesen.</p></div>'}
    ${!lw.vorinstalliert ? `<div class="btn-row"><a class="btn secondary" href="#/lehrwerk-neu/${esc(lw.fachId)}?id=${esc(id)}">Angaben ändern</a>
      ${!units.length ? '<button class="btn danger" id="lw-del">Buch entfernen</button>' : ''}</div>` : ''}`;
  return {
    title: lehrwerkName(lw), back: 'bibliothek', html,
    bind(root) {
      const d = $('#lw-del', root);
      if (d) d.onclick = async () => { if (confirm('Dieses Buch entfernen?')) { await db.del('lehrwerke', id); ctx.go('bibliothek'); } };
    }
  };
}

export async function lehrwerkFormView({ fachId, query }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const alt = query.id ? await db.get('lehrwerke', query.id) : null;
  const f = getFach(fachId);
  if (!f) { ctx.go('bibliothek'); return null; }
  const d = alt || { titel: '', verlag: '', band: '', klasse: '', ausgabe: '' };
  const html = `
    <p class="muted">${f.icon} ${esc(f.name)}</p>
    <label for="lw-titel">Titel des Buchs</label><input id="lw-titel" type="text" value="${esc(d.titel)}" placeholder="z. B. Green Line">
    <div class="field-row">
      <div><label for="lw-band">Band</label><input id="lw-band" type="text" value="${esc(d.band)}" placeholder="z. B. 2"></div>
      <div><label for="lw-klasse">Klasse</label><input id="lw-klasse" type="number" inputmode="numeric" min="5" max="13" value="${esc(d.klasse)}"></div>
    </div>
    <label for="lw-verlag">Verlag (freiwillig)</label><input id="lw-verlag" type="text" value="${esc(d.verlag)}">
    <label for="lw-ausgabe">Ausgabe (freiwillig)</label><input id="lw-ausgabe" type="text" value="${esc(d.ausgabe)}" placeholder="z. B. Ausgabe NRW">
    <div class="btn-row"><button class="btn" id="lw-save">Speichern</button></div>`;
  return {
    title: alt ? 'Buch bearbeiten' : 'Buch hinzufügen', back: alt ? `lehrwerk/${alt.id}` : 'bibliothek', html,
    bind(root) {
      $('#lw-save', root).onclick = async () => {
        const titel = $('#lw-titel', root).value.trim();
        if (!titel) { toast('Bitte einen Titel eingeben.'); return; }
        const rec = {
          ...(alt || { id: uid('lw'), fachId }), titel,
          band: $('#lw-band', root).value.trim(), klasse: +$('#lw-klasse', root).value || null,
          verlag: $('#lw-verlag', root).value.trim(), ausgabe: $('#lw-ausgabe', root).value.trim()
        };
        await db.put('lehrwerke', rec);
        ctx.go(`lehrwerk/${rec.id}`);
      };
    }
  };
}

// ---------- Unit ----------

async function unitDaten(unitId) {
  const unit = await db.get('units', unitId);
  if (!unit) return null;
  const [lw, parts, voks, saetze, satzbau] = await Promise.all([
    db.get('lehrwerke', unit.lehrwerkId), db.byIndex('parts', 'unitId', unitId), db.byIndex('vokabeln', 'unitId', unitId),
    db.byIndex('lernsaetze', 'unitId', unitId), db.byIndex('satzbau', 'unitId', unitId)
  ]);
  parts.sort((a, b) => a.reihenfolge - b.reihenfolge);
  const partRang = new Map(parts.map((p, i) => [p.id, i]));
  voks.sort((a, b) => (partRang.get(a.partId) - partRang.get(b.partId)) || (a.reihenfolge - b.reihenfolge));
  return { unit, lw, fach: getFach(lw?.fachId), parts, voks, saetze, satzbau };
}

export async function unitView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const d = await unitDaten(id);
  if (!d) { ctx.go('bibliothek'); return null; }
  const { unit, lw, fach, parts, voks, saetze, satzbau } = d;
  const lang = fach.vorlesen.stimmeSprache;
  const zuPruefen = voks.filter((v) => v.pruefen).length;
  const unitWort = fach.formenTyp === 'latein' ? 'Lektion' : 'Unit';
  const html = `
    <div class="card">
      <div class="muted small">${esc(lehrwerkName(lw))}</div>
      <h2 style="margin:4px 0">${unitWort} ${esc(unit.nummer)}${unit.titel ? ' – ' + esc(unit.titel) : ''}</h2>
      <div>${plural(voks.length, 'Vokabel', 'Vokabeln')} · ${plural(saetze.length, 'Lernsatz', 'Lernsätze')} · ${plural(satzbau.length, 'Satzbau-Aufgabe', 'Satzbau-Aufgaben')}</div>
      ${zuPruefen ? `<div class="msg warn small" style="margin-top:10px">⚠️ ${plural(zuPruefen, 'Vokabel', 'Vokabeln')} bitte mit dem Buch vergleichen (gelb markiert).</div>` : ''}
      ${fach.vorlesen.hinweis ? `<div class="hinweis-latein">🇮🇹 ${esc(fach.vorlesen.hinweis)}</div>` : ''}
    </div>
    <div class="btn-row">
      <a class="btn" href="#/lernen?unit=${esc(unit.id)}" ${voks.length ? '' : 'hidden'}>🎯 Lernen & Test</a>
      <a class="btn secondary" href="#/vokabel/${esc(voks[0]?.id || '')}" ${voks.length ? '' : 'hidden'}>📖 Durchblättern</a>
    </div>
    <div class="btn-row">
      <a class="btn secondary" href="#/termin-neu?unit=${esc(unit.id)}">📅 Test-Termin eintragen</a>
      <a class="btn secondary" href="#/import?lw=${esc(lw.id)}&unit=${esc(unit.id)}">📸 Weitere Seite einlesen</a>
    </div>
    ${parts.map((p) => {
      const pv = voks.filter((v) => v.partId === p.id);
      if (!pv.length) return '';
      return `<h3>Part ${esc(p.kennung)}${p.titel ? ' – ' + esc(p.titel) : ''} <span class="badge">${pv.length}</span></h3>
        <div class="card" style="padding:0"><ul class="list">
        ${pv.map((v) => `<li><a class="list-item" href="#/vokabel/${esc(v.id)}">
          <span class="grow"><span class="vok-wort">${esc(v.wort)}</span>
          ${v.lautschrift ? `<span class="vok-ipa">[${esc(v.lautschrift)}]</span>` : ''}
          ${v.pruefen ? '<span class="badge warn">prüfen</span>' : ''}<br>
          <span class="vok-de">${esc(v.bedeutungen.join('; '))}</span></span>
          ${speakBtn(v.wort.replace(/^\(to\)\s*/, 'to '), lang, true)}
          <span class="chev">›</span></a></li>`).join('')}
        </ul></div>`;
    }).join('')}
    ${saetze.length ? `<details class="card"><summary>Lernsätze (${saetze.length})</summary><ul class="list">
      ${saetze.map((s) => `<li class="list-item"><span class="grow"><span class="vok-wort">${esc(s.fremd)}</span><br><span class="vok-de">${esc(s.deutsch)}</span></span>${speakBtn(s.fremd, lang, true)}</li>`).join('')}
    </ul></details>` : ''}
    ${satzbau.length ? `<details class="card"><summary>Satzbau-Aufgaben (${satzbau.length})</summary><ul class="list">
      ${satzbau.map((s) => `<li class="list-item"><span class="grow">${esc(s.deutsch)}<br><span class="vok-de">→ ${esc(s.loesung)}</span></span></li>`).join('')}
    </ul></details>` : ''}
    <div class="btn-row" style="margin-top:28px">
      <button class="btn secondary" id="u-titel">Titel ändern</button>
      <button class="btn danger" id="u-del">${unitWort} löschen</button>
    </div>`;
  return {
    title: `${unitWort} ${unit.nummer}`, back: `lehrwerk/${lw.id}`, html,
    bind(root) {
      bindSprechen(root, ctx);
      $('#u-titel', root).onclick = async () => {
        const t = prompt('Neuer Titel:', unit.titel || '');
        if (t === null) return;
        await db.put('units', { ...unit, titel: t.trim(), geaendertAm: new Date().toISOString() });
        ctx.rerender();
      };
      $('#u-del', root).onclick = async () => {
        if (!confirm(`${unitWort} ${unit.nummer} mit ${voks.length} Vokabeln und allen Lernständen löschen? Das kann man nicht rückgängig machen.`)) return;
        await db.deleteUnit(unit.id);
        toast('Gelöscht.');
        ctx.go(`lehrwerk/${lw.id}`);
      };
    }
  };
}

// ---------- Lernkarte (Vokabel-Detail) ----------

export function formenHtml(v, fach) {
  const f = v.formen || {};
  const z = [];
  if (fach.formenTyp === 'latein') {
    if (f.genitiv) z.push(['Genitiv', f.genitiv]);
    if (f.genus) z.push(['Genus', { m: 'maskulin (m)', f: 'feminin (f)', n: 'neutrum (n)', 'm/f': 'maskulin/feminin' }[f.genus] || f.genus]);
    if (f.deklination) z.push(['Deklination', f.deklination + '-Deklination']);
    if (f.adjektiv_endungen) z.push(['Endungen', f.adjektiv_endungen]);
    if (f.stammformen?.length) z.push(['Stammformen', f.stammformen.join(', ')]);
    if (f.konjugation) z.push(['Konjugation', f.konjugation === 'unregelmaessig' ? 'unregelmäßig' : f.konjugation + '-Konjugation']);
    if (f.rektion) z.push(['Rektion', f.rektion]);
  } else {
    if (f.plural) z.push(['Plural', f.plural]);
    if (f.simple_past) z.push(['Simple past', f.simple_past]);
    if (f.past_participle) z.push(['Past participle', f.past_participle]);
    if (f.steigerung) z.push(['Steigerung', f.steigerung]);
  }
  if (!z.length) return '';
  return `<div class="info-block"><h4>Formen</h4><ul>${z.map(([k, w]) => `<li><strong>${esc(k)}:</strong> ${esc(w)}</li>`).join('')}</ul></div>`;
}

export function karteHtml(v, fach) {
  const lang = fach.vorlesen.stimmeSprache;
  const sprechWort = v.wort.replace(/^\(to\)\s*/, 'to ');
  const block = (titel, items) => items?.length ? `<div class="info-block"><h4>${titel}</h4><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  return `
    <div class="card flash">
      <div class="muted small">${esc(WORTART_NAMEN[v.wortart] || '')}</div>
      <div class="wort" lang="${fach.kurz}">${esc(v.wort)}</div>
      ${v.lautschrift ? `<div class="ipa">[${esc(v.lautschrift)}]</div>` : ''}
      <div style="margin:12px 0">${speakBtn(sprechWort, lang)}</div>
      ${fach.vorlesen.hinweis ? `<div class="hinweis-latein">🇮🇹 ${esc(fach.vorlesen.hinweis)}</div>` : ''}
      <div class="de">${esc(v.bedeutungen.join('; '))} ${speakBtn(v.bedeutungen.join(', '), 'de-DE', true, 'Deutsch vorlesen')}</div>
    </div>
    ${v.pruefen ? `<div class="msg warn">⚠️ Bitte mit dem Buch vergleichen: ${esc(v.pruefgrund || 'unsicher gelesen')}
      <div class="btn-row"><button class="btn soft" id="v-geprueft">✓ Stimmt so</button><a class="btn secondary" href="#/vokabel-bearbeiten/${esc(v.id)}">Korrigieren</a></div></div>` : ''}
    <div class="card">
      ${formenHtml(v, fach)}
      ${v.erklaerung ? `<div class="info-block"><h4>Erklärung</h4><p lang="${fach.kurz}">${esc(v.erklaerung)} ${speakBtn(v.erklaerung, lang, true)}</p></div>` : ''}
      ${v.beispiele?.length ? `<div class="info-block"><h4>Beispiele</h4>${v.beispiele.map((b) => `
        <div class="beispiel"><span class="fr" lang="${fach.kurz}">${esc(b.fremd)}</span> ${speakBtn(b.fremd, lang, true)}
        ${b.deutsch ? `<br><span class="muted">${esc(b.deutsch)}</span>` : ''}
        ${b.quelle === 'ki' ? ' <span class="badge small">neu formuliert</span>' : ''}</div>`).join('')}</div>` : ''}
      ${block('Gegenteil', v.gegenteile)}
      ${block('Ähnliche Wörter', v.synonyme)}
      ${block('Wortfamilie', v.wortfamilie)}
      ${v.andereSprachen?.length ? `<div class="info-block"><h4>In anderen Sprachen</h4><ul>${v.andereSprachen.map((a) =>
        `<li><span class="badge" title="${esc(SPRACH_LANG[a.sprache] || a.sprache)}">${esc(SPRACH_NAMEN[a.sprache] || a.sprache)}</span> ${esc(a.wort)}${a.bedeutung ? ` <span class="muted">(${esc(a.bedeutung)})</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${v.stolpersteine?.length ? `<div class="info-block"><h4>⚠️ Stolpersteine</h4><ul>${v.stolpersteine.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${v.merkhilfe ? `<div class="info-block"><h4>💡 Merkhilfe</h4><p>${esc(v.merkhilfe)}</p></div>` : ''}
    </div>`;
}

export async function vokabelView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const v = await db.get('vokabeln', id);
  if (!v) { ctx.go('bibliothek'); return null; }
  const d = await unitDaten(v.unitId);
  const i = d.voks.findIndex((x) => x.id === id);
  const prev = d.voks[i - 1], next = d.voks[i + 1];
  const part = d.parts.find((p) => p.id === v.partId);
  const html = `
    <p class="muted small" style="text-align:center">Part ${esc(part?.kennung || '?')} · Karte ${i + 1} von ${d.voks.length}</p>
    ${karteHtml(v, d.fach)}
    <div class="btn-row">
      ${prev ? `<a class="btn secondary" href="#/vokabel/${esc(prev.id)}">‹ Vorherige</a>` : ''}
      ${next ? `<a class="btn" href="#/vokabel/${esc(next.id)}">Nächste ›</a>` : `<a class="btn" href="#/unit/${esc(v.unitId)}">Fertig ✓</a>`}
    </div>
    <div class="btn-row"><a class="btn secondary" href="#/vokabel-bearbeiten/${esc(v.id)}">✏️ Bearbeiten</a></div>`;
  return {
    title: v.wort, back: `unit/${v.unitId}`, html,
    bind(root) {
      bindSprechen(root, ctx);
      const g = $('#v-geprueft', root);
      if (g) g.onclick = async () => { await db.put('vokabeln', { ...v, pruefen: false, pruefgrund: '' }); toast('Danke! Als geprüft markiert.'); ctx.rerender(); };
    }
  };
}

export async function vokabelFormView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const v = await db.get('vokabeln', id);
  if (!v) { ctx.go('bibliothek'); return null; }
  const d = await unitDaten(v.unitId);
  const latein = d.fach.formenTyp === 'latein';
  const f = v.formen || {};
  const inp = (key, label, val, ph = '') => `<div><label for="vf-${key}">${label}</label><input id="vf-${key}" type="text" value="${esc(val || '')}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></div>`;
  const ta = (key, label, arr) => `<label for="vf-${key}">${label} <span class="muted small">(eins pro Zeile)</span></label><textarea id="vf-${key}" style="min-height:90px;font-family:inherit;font-size:17px">${esc((arr || []).join('\n'))}</textarea>`;
  const html = `
    ${inp('wort', 'Wort', v.wort)}
    <div class="field-row">
      ${latein ? '' : inp('lautschrift', 'Lautschrift', v.lautschrift)}
      <div><label for="vf-wortart">Wortart</label><select id="vf-wortart">${WORTARTEN.map((w) => `<option value="${w}" ${w === v.wortart ? 'selected' : ''}>${WORTART_NAMEN[w]}</option>`).join('')}</select></div>
      <div><label for="vf-part">Part</label><select id="vf-part">${d.parts.map((p) => `<option value="${p.id}" ${p.id === v.partId ? 'selected' : ''}>${esc(p.kennung)}</option>`).join('')}</select></div>
    </div>
    ${inp('bedeutungen', 'Bedeutungen (mit ; trennen)', v.bedeutungen.join('; '))}
    <h3>Formen</h3>
    <div class="field-row">
      ${latein ? `
        ${inp('genitiv', 'Genitiv', f.genitiv)}
        <div><label for="vf-genus">Genus</label><select id="vf-genus"><option value=""></option>${['m', 'f', 'n', 'm/f'].map((g) => `<option ${g === f.genus ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        ${inp('deklination', 'Deklination', f.deklination, 'a, o, kons …')}
        ${inp('adjektiv_endungen', 'Adjektiv-Endungen', f.adjektiv_endungen, '-a, -um')}
        ${inp('stammformen', 'Stammformen (mit Komma)', (f.stammformen || []).join(', '))}
        ${inp('konjugation', 'Konjugation', f.konjugation, 'a, e, i, kons …')}
        ${inp('rektion', 'Rektion', f.rektion, 'm. Akk.')}` : `
        ${inp('plural', 'Plural (nur unregelmäßig)', f.plural)}
        ${inp('simple_past', 'Simple past', f.simple_past)}
        ${inp('past_participle', 'Past participle', f.past_participle)}
        ${inp('steigerung', 'Steigerung', f.steigerung)}`}
    </div>
    ${inp('erklaerung', 'Erklärung (Fremdsprache)', v.erklaerung)}
    ${ta('gegenteile', 'Gegenteile', v.gegenteile)}
    ${ta('synonyme', 'Ähnliche Wörter', v.synonyme)}
    ${ta('wortfamilie', 'Wortfamilie', v.wortfamilie)}
    ${ta('stolpersteine', 'Stolpersteine', v.stolpersteine)}
    ${inp('merkhilfe', 'Merkhilfe', v.merkhilfe)}
    <div class="btn-row"><button class="btn" id="vf-save">Speichern</button></div>
    <div class="btn-row"><button class="btn danger" id="vf-del">Vokabel löschen</button></div>`;
  return {
    title: 'Vokabel bearbeiten', back: `vokabel/${id}`, html,
    bind(root) {
      const val = (k) => ($(`#vf-${k}`, root)?.value || '').trim();
      const zeilen = (k) => val(k).split('\n').map((s) => s.trim()).filter(Boolean);
      $('#vf-save', root).onclick = async () => {
        const wort = val('wort');
        const bedeutungen = val('bedeutungen').split(';').map((s) => s.trim()).filter(Boolean);
        if (!wort || !bedeutungen.length) { toast('Wort und Bedeutung dürfen nicht leer sein.'); return; }
        const formen = {};
        const keys = latein ? ['genitiv', 'genus', 'deklination', 'adjektiv_endungen', 'konjugation', 'rektion'] : ['plural', 'simple_past', 'past_participle', 'steigerung'];
        keys.forEach((k) => { if (val(k)) formen[k] = val(k); });
        if (latein && val('stammformen')) formen.stammformen = val('stammformen').split(',').map((s) => s.trim()).filter(Boolean);
        await db.put('vokabeln', {
          ...v, wort, bedeutungen, formen, lautschrift: latein ? '' : val('lautschrift'), wortart: val('wortart'), partId: val('part'),
          erklaerung: val('erklaerung'), gegenteile: zeilen('gegenteile'), synonyme: zeilen('synonyme'),
          wortfamilie: zeilen('wortfamilie'), stolpersteine: zeilen('stolpersteine'), merkhilfe: val('merkhilfe'),
          pruefen: false, pruefgrund: ''
        });
        toast('Gespeichert.');
        ctx.go(`vokabel/${id}`);
      };
      $('#vf-del', root).onclick = async () => {
        if (!confirm(`„${v.wort}“ löschen?`)) return;
        const ops = [{ store: 'vokabeln', op: 'del', key: v.id }];
        for (const ls of await db.byIndex('lernstand', 'vokabelId', v.id)) ops.push({ store: 'lernstand', op: 'del', key: ls.key });
        await db.batch(ops);
        ctx.go(`unit/${v.unitId}`);
      };
    }
  };
}

// ---------- Backup ----------

export async function backupView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const letzte = await db.getMeta('letztesBackup');
  const html = `
    <div class="card">
      <h3 style="margin-top:0">💾 Sicherung erstellen</h3>
      <p>Alle Bücher, Vokabeln, Profile und Lernstände kommen in <strong>eine Datei</strong>. Speichere sie z. B. in „Dateien“ oder iCloud Drive.</p>
      <p class="muted small">Letzte Sicherung: ${letzte ? datum(letzte) : 'noch nie'}</p>
      <button class="btn block" id="bk-export">Sicherung erstellen</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0">📂 Sicherung laden</h3>
      <p>Lädt eine Sicherungsdatei – auch von einem anderen Gerät. Vorhandene Daten bleiben erhalten, gleiche Einträge werden aktualisiert.</p>
      <label class="btn secondary block" for="bk-file">Datei auswählen</label>
      <input id="bk-file" type="file" accept=".json,application/json" hidden>
      <div id="bk-info"></div>
    </div>
    <div class="msg info small">Warum ist das wichtig? Die Daten liegen nur auf diesem Gerät. Wird die App gelöscht oder der Safari-Verlauf geleert, sind sie weg. Außerdem haben Safari und die Home-Bildschirm-App getrennte Speicher – mit einer Sicherung kannst du umziehen.</div>
    <details class="card"><summary>Gefahrenzone</summary>
      <p>Löscht alle Daten auf diesem Gerät.</p>
      <button class="btn danger block" id="bk-wipe">Alles löschen</button>
    </details>`;
  return {
    title: 'Sicherung', back: 'home', html,
    bind(root) {
      $('#bk-export', root).onclick = async () => {
        const data = await backup.erstelleBackup();
        const r = await backup.speichereDatei(backup.backupDateiname(), JSON.stringify(data));
        if (r !== 'abgebrochen') { await db.setMeta('letztesBackup', new Date().toISOString()); toast('Sicherung erstellt.'); ctx.rerender(); }
      };
      $('#bk-file', root).onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const info = $('#bk-info', root);
        let obj;
        try { obj = JSON.parse(await file.text()); } catch { info.innerHTML = '<div class="msg err">Die Datei ist beschädigt oder keine JSON-Datei.</div>'; return; }
        const err = backup.pruefeBackup(obj);
        if (err) { info.innerHTML = `<div class="msg err">${esc(err)}${obj?.schema ? '<br>Das sieht nach einer Chatbot-Antwort aus – die gehört in „Vokabelseite einlesen“.' : ''}</div>`; return; }
        const z = backup.zusammenfassung(obj);
        info.innerHTML = `<div class="msg info">Sicherung vom ${esc(datum(z.datum))}: ${z.profile} Profile, ${z.units} Units, ${z.vokabeln} Vokabeln.</div>
          <button class="btn block" id="bk-go">Jetzt laden</button>`;
        $('#bk-go', root).onclick = async () => {
          const n = await backup.spieleEin(obj);
          toast(`${n} Einträge geladen.`);
          ctx.go('home');
        };
      };
      $('#bk-wipe', root).onclick = async () => {
        if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Erstelle vorher eine Sicherung!')) return;
        if (!confirm('Letzte Nachfrage: Alles unwiderruflich löschen?')) return;
        await db.clearStores([...db.INHALT_STORES, ...db.LERN_STORES, 'profile', 'importe', 'meta']);
        ctx.setzeAktivesProfil(null);
        location.hash = '#/';
        location.reload();
      };
    }
  };
}

// ---------- Einstellungen ----------

export async function einstellungenView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const e = ctx.profil.einstellungen || {};
  let speicher = '';
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      speicher = `${(est.usage / 1024 / 1024).toFixed(1)} MB belegt`;
    }
    if (navigator.storage?.persisted) speicher += (await navigator.storage.persisted()) ? ' · dauerhaft gespeichert ✓' : ' · nicht dauerhaft geschützt';
  } catch { /* egal */ }
  const html = `
    <div class="card">
      <h3 style="margin-top:0">Abfrage</h3>
      <label for="st-richtung">Richtung</label>
      <select id="st-richtung">
        <option value="beide" ${e.abfrageRichtung === 'beide' ? 'selected' : ''}>Beide Richtungen</option>
        <option value="fremd-deutsch" ${e.abfrageRichtung === 'fremd-deutsch' ? 'selected' : ''}>Fremdsprache → Deutsch</option>
        <option value="deutsch-fremd" ${e.abfrageRichtung === 'deutsch-fremd' ? 'selected' : ''}>Deutsch → Fremdsprache</option>
      </select>
      <label for="st-tempo">Vorlese-Tempo: <span id="st-tempo-w">${Math.round((e.sprechtempo || 0.9) * 100)} %</span></label>
      <input id="st-tempo" type="range" min="0.6" max="1.1" step="0.05" value="${e.sprechtempo || 0.9}" style="width:100%;height:44px">
      <label class="switch" style="margin-top:10px"><input type="checkbox" id="st-auto" ${e.vorlesenAutomatisch ? 'checked' : ''}> Fremdwörter beim Abfragen automatisch vorlesen</label>
      <label for="st-ziel">Neue Vokabeln pro Tag</label>
      <select id="st-ziel">${[5, 10, 15, 20, 30].map((n) => `<option ${n === (e.tagesziel || 20) ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="card">
      <h3 style="margin-top:0">🔊 Vorlesen testen</h3>
      <div class="btn-row">
        <button class="btn soft" data-say="Welcome to Snowdonia! The path is very steep." data-lang="en-GB">Englisch</button>
        <button class="btn soft" data-say="Willkommen! Heute lernen wir Vokabeln." data-lang="de-DE">Deutsch</button>
        <button class="btn soft" data-say="Salvete, amici! Puella villam videt." data-lang="it-IT">Latein</button>
      </div>
      <p class="hinweis-latein">🇮🇹 Für Latein wird eine italienische Stimme genutzt. Die Aussprache ist daher nur ungefähr.</p>
      <p class="muted small">Klingt eine Stimme blechern? Auf dem iPhone unter Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen bessere Stimmen laden („Erweitert“).</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">📱 iPhone/iPad-Test</h3>
      <p>Prüft Vorlesen, Mikrofon, Speicher und Teilen auf diesem Gerät und erstellt einen Bericht zum Kopieren.</p>
      <a class="btn secondary block" href="diagnose.html">Gerätetest öffnen</a>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Speicher</h3>
      <p class="small">${esc(speicher || 'keine Angabe')}</p>
      <button class="btn secondary block" id="st-persist">Daten vor automatischem Löschen schützen</button>
    </div>
    <p class="muted small" style="text-align:center">Vokabel-Studio · Version ${esc(APP_VERSION)} · Alle Daten bleiben auf diesem Gerät.</p>`;
  return {
    title: 'Einstellungen', back: 'home', html,
    bind(root) {
      bindSprechen(root, ctx);
      const speichern = async () => {
        const p = await db.get('profile', ctx.profil.id);
        p.einstellungen = {
          ...(p.einstellungen || {}), abfrageRichtung: $('#st-richtung', root).value, sprechtempo: +$('#st-tempo', root).value,
          vorlesenAutomatisch: $('#st-auto', root).checked, tagesziel: +$('#st-ziel', root).value
        };
        await db.put('profile', p);
        ctx.profil = p;
      };
      $('#st-richtung', root).onchange = speichern;
      $('#st-tempo', root).oninput = () => { $('#st-tempo-w', root).textContent = Math.round($('#st-tempo', root).value * 100) + ' %'; };
      $('#st-tempo', root).onchange = speichern;
      $('#st-auto', root).onchange = speichern;
      $('#st-ziel', root).onchange = speichern;
      $('#st-persist', root).onclick = async () => {
        if (!navigator.storage?.persist) { toast('Dieser Browser unterstützt das nicht. Sichere regelmäßig!'); return; }
        const ok = await navigator.storage.persist();
        toast(ok ? 'Geschützt ✓' : 'Der Browser hat abgelehnt. Lege die App auf den Home-Bildschirm und sichere regelmäßig.');
        ctx.rerender();
      };
    }
  };
}
