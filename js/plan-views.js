// Stufe 3/4: Lernplan & Termine, Druckansicht, Erfolge, Eltern-Ansicht
import * as db from './db.js';
import { lehrwerkName } from './faecher.js';
import { esc, $, $$, toast, uid, plural, datum } from './util.js';
import * as L from './lernen.js';
import { starteSitzung, unitKontext } from './lern-views.js';
import { ABZEICHEN, hole as holeBelohnung } from './belohnung.js';
import { avatarHtml } from './avatare.js';

// ================= Lernplan =================

export function erzeugePlan(datumTermin, neueIds) {
  const h = L.heute();
  const tage = [];
  for (let d = h; d < datumTermin; d = L.plusTage(d, 1)) tage.push(d);
  if (!tage.length) tage.push(h);
  const n = tage.length;
  const lernTage = n >= 3 ? n - 1 : n;           // letzter Tag: Probetest
  const proTag = Math.ceil(neueIds.length / lernTage) || 0;
  return tage.map((d, i) => {
    const aufgaben = [];
    const chunk = neueIds.slice(i * proTag, (i + 1) * proTag);
    if (i < lernTage && chunk.length) aufgaben.push({ art: 'neu', vokabelIds: chunk, erledigt: false });
    if (i > 0 || !chunk.length) aufgaben.push({ art: 'wiederholen', erledigt: false });
    if (i === n - 1 && n >= 2) aufgaben.push({ art: 'test', erledigt: false });
    return { datum: d, aufgaben };
  });
}

async function neueVokabelIds(profilId, unitIds) {
  const voks = await L.vokabelnFuerUnits(unitIds);
  const map = await L.lernstandMap(profilId);
  return voks.filter((v) => (L.holeLs(map, profilId, v.id, 'fd')?.box || 0) < 2).sort((a, b) => a.reihenfolge - b.reihenfolge).map((v) => v.id);
}

const AUFGABE = {
  neu: (a) => ({ icon: '🆕', text: `${plural(a.vokabelIds.length, 'neue Vokabel', 'neue Vokabeln')} lernen` }),
  wiederholen: () => ({ icon: '🔁', text: 'Fällige wiederholen' }),
  test: () => ({ icon: '📝', text: 'Probetest' })
};

export async function naechsterTermin(profilId) {
  const h = L.heute();
  return (await db.byIndex('termine', 'profilId', profilId)).filter((t) => t.datum >= h).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
}

export async function planView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const h = L.heute();
  const termine = (await db.byIndex('termine', 'profilId', ctx.profil.id)).sort((a, b) => a.datum.localeCompare(b.datum));
  const kommend = termine.filter((t) => t.datum >= h), vergangen = termine.filter((t) => t.datum < h);
  const f = await L.faelligePaare(ctx.profil);
  const html = `
    <div class="card" style="text-align:center">
      <div class="muted">Heute fällig</div>
      <div class="prozent">${f.faellig.length}</div>
      <p class="small muted">${f.neuGesamt ? `${f.neuGesamt} Vokabeln noch nie geübt` : ''}</p>
      <button class="btn block" id="p-faellig" ${f.faellig.length + f.neu.length ? '' : 'disabled'}>🔁 Jetzt wiederholen</button>
    </div>
    <h3>Vokabeltests</h3>
    ${kommend.length ? kommend.map((t) => terminZeile(t)).join('') : '<div class="card muted">Noch kein Termin eingetragen.</div>'}
    <a class="btn block" href="#/termin-neu">➕ Termin für Vokabeltest eintragen</a>
    ${vergangen.length ? `<details class="card"><summary>Vergangene Termine (${vergangen.length})</summary>${vergangen.reverse().map((t) => terminZeile(t)).join('')}</details>` : ''}
    <div class="msg info small" style="margin-top:20px"><strong>So funktioniert der Wiederholungsplan:</strong> Jede Vokabel wandert bei einer richtigen Antwort einen Kasten weiter (Kasten 1 → 5) und kommt dann erst nach 1, 2, 4, 8 bzw. 16 Tagen wieder. Bei einer falschen Antwort geht sie zurück in Kasten 1.</div>`;
  return {
    title: 'Lernplan', back: 'home', html,
    bind(root) {
      $('#p-faellig', root).onclick = async () => {
        const r = await starteSitzung({ modus: 'faellig', unitIds: (await db.all('units')).map((u) => u.id), zurueck: 'plan' }, ctx.profil);
        if (r.leer) toast(r.leer); else ctx.go('uebung');
      };
    }
  };
}

function terminZeile(t) {
  const d = L.tageBis(t.datum);
  const wann = d === 0 ? 'heute' : d === 1 ? 'morgen' : d > 0 ? `in ${d} Tagen` : datum(t.datum);
  const heuteTag = t.plan?.find((p) => p.datum === L.heute());
  const offen = heuteTag?.aufgaben.filter((a) => !a.erledigt).length || 0;
  return `<a class="card list-item" href="#/termin/${esc(t.id)}" style="margin:10px 0">
    <span style="font-size:30px">📝</span>
    <span class="grow"><span class="vok-wort">${esc(t.titel)}</span><br><span class="vok-de">${esc(L.datumLang(t.datum))} · ${wann}</span></span>
    ${offen ? `<span class="badge warn">${offen} offen</span>` : heuteTag ? '<span class="badge ok">✓ heute</span>' : ''}<span class="chev">›</span></a>`;
}

export async function terminFormView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const { units, lw, fachVonUnit } = await unitKontext();
  const erlaubt = units.filter((u) => !ctx.profil.fachIds?.length || ctx.profil.fachIds.includes(fachVonUnit.get(u.id).id));
  const morgen = L.plusTage(L.heute(), 1);
  const html = `
    <label for="tf-titel">Was wird geschrieben?</label>
    <input id="tf-titel" type="text" value="Vokabeltest" maxlength="60">
    <label for="tf-datum">Wann?</label>
    <input id="tf-datum" type="date" min="${morgen}" value="${L.plusTage(L.heute(), 7)}">
    <label>Welche Units kommen dran?</label>
    <div class="card" style="padding:6px 14px">
      ${erlaubt.length ? erlaubt.map((u) => `<label class="switch" style="display:flex;min-height:48px"><input type="checkbox" class="tf-unit" value="${esc(u.id)}" ${query.unit === u.id ? 'checked' : ''}>
        <span class="grow">Unit ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''} <span class="muted small">(${esc(lehrwerkName(lw.get(u.lehrwerkId)))})</span></span></label>`).join('') : '<p class="muted">Noch keine Units eingelesen.</p>'}
    </div>
    <button class="btn block" id="tf-save">Plan erstellen</button>`;
  return {
    title: 'Neuer Termin', back: 'plan', html,
    bind(root) {
      $('#tf-save', root).onclick = async () => {
        const unitIds = $$('.tf-unit:checked', root).map((c) => c.value);
        const d = $('#tf-datum', root).value;
        if (!unitIds.length) { toast('Wähle mindestens eine Unit.'); return; }
        if (!d || d <= L.heute()) { toast('Der Termin muss in der Zukunft liegen.'); return; }
        const t = { id: uid('tm'), profilId: ctx.profil.id, titel: $('#tf-titel', root).value.trim() || 'Vokabeltest', datum: d, unitIds, erstelltAm: new Date().toISOString() };
        t.plan = erzeugePlan(d, await neueVokabelIds(ctx.profil.id, unitIds));
        await db.put('termine', t);
        toast('Lernplan erstellt! 📅');
        ctx.go(`termin/${t.id}`);
      };
    }
  };
}

export async function terminView({ id }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const t = await db.get('termine', id);
  if (!t) { ctx.go('plan'); return null; }
  const { units } = await unitKontext();
  const namen = t.unitIds.map((uid2) => units.find((u) => u.id === uid2)).filter(Boolean).map((u) => `Unit ${u.nummer}`);
  const h = L.heute();
  const d = L.tageBis(t.datum);
  const stat = await L.kastenStatistik(ctx.profil.id, t.unitIds);
  const html = `
    <div class="card">
      <h2 style="margin-top:0">${esc(t.titel)}</h2>
      <p>${esc(L.datumLang(t.datum))} · <strong>${d > 1 ? `noch ${d} Tage` : d === 1 ? 'morgen!' : d === 0 ? 'heute!' : 'vorbei'}</strong><br><span class="muted">${esc(namen.join(', '))}</span></p>
      <div class="kasten">${stat.zaehl.map((n, i) => `<div><span style="height:${stat.gesamt ? Math.max(4, n / stat.gesamt * 60) : 4}px"></span><small>${i ? i : 'neu'}</small><b>${n}</b></div>`).join('')}</div>
      <p class="small muted">${stat.sicher} von ${stat.gesamt} Vokabeln sicher (Kasten 4–5)</p>
    </div>
    ${t.plan.map((tag) => {
      const istHeute = tag.datum === h, vorbei = tag.datum < h;
      return `<div class="card ${istHeute ? 'heute' : ''}" ${vorbei ? 'style="opacity:.6"' : ''}>
        <div class="check-head"><strong class="grow">${istHeute ? 'Heute' : esc(L.datumLang(tag.datum))}</strong>${istHeute ? '<span class="badge">heute</span>' : ''}</div>
        ${tag.aufgaben.map((a, i) => { const A = AUFGABE[a.art](a); return `<div class="list-item" style="padding:8px 0">
          <span>${a.erledigt ? '✅' : A.icon}</span><span class="grow">${esc(A.text)}</span>
          ${istHeute && !a.erledigt ? `<button class="btn" style="min-height:48px" data-start="${i}">Los</button>` : ''}</div>`; }).join('')}
      </div>`;
    }).join('')}
    ${d === 0 ? '<div class="msg ok">Viel Erfolg heute! 🍀</div>' : ''}
    <div class="btn-row">
      <button class="btn secondary" id="tm-neu">Plan neu berechnen</button>
      <button class="btn danger" id="tm-del">Termin löschen</button>
    </div>`;
  return {
    title: 'Lernplan', back: 'plan', html,
    bind(root) {
      $$('[data-start]', root).forEach((b) => b.onclick = async () => {
        const i = +b.dataset.start;
        const a = t.plan.find((x) => x.datum === h).aufgaben[i];
        const ref = { terminId: t.id, datum: h, index: i };
        const cfg = a.art === 'neu' ? { modus: 'neu', unitIds: t.unitIds, vokabelIds: a.vokabelIds }
          : a.art === 'test' ? { modus: 'test', unitIds: t.unitIds, anzahl: 20 }
            : { modus: 'faellig', unitIds: t.unitIds };
        const r = await starteSitzung({ ...cfg, zurueck: `termin/${t.id}`, terminRef: ref }, ctx.profil);
        if (r.leer) { a.erledigt = true; await db.put('termine', t); toast(r.leer); ctx.rerender(); return; }
        ctx.go('uebung');
      });
      $('#tm-neu', root).onclick = async () => {
        if (t.datum <= h) { toast('Der Termin ist heute oder vorbei.'); return; }
        t.plan = erzeugePlan(t.datum, await neueVokabelIds(ctx.profil.id, t.unitIds));
        await db.put('termine', t); toast('Plan neu berechnet.'); ctx.rerender();
      };
      $('#tm-del', root).onclick = async () => { if (confirm('Termin löschen?')) { await db.del('termine', t.id); ctx.go('plan'); } };
    }
  };
}

// ================= Druckansicht =================
export async function druckView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const unitIds = (query.units || '').split(',').filter(Boolean);
  const { units, lw, fachVonUnit } = await unitKontext();
  const us = unitIds.map((id) => units.find((u) => u.id === id)).filter(Boolean);
  if (!us.length) { ctx.go('lernen'); return null; }
  const fach = fachVonUnit.get(us[0].id);
  const voks = L.mische(await L.vokabelnFuerUnits(unitIds));
  const n = +query.n || 0;
  const sel = n ? voks.slice(0, n) : voks;
  const rs = L.richtungen(ctx.profil, query.richtung || 'beide');
  const fragen = sel.map((v) => ({ v, r: rs[Math.floor(Math.random() * rs.length)] }));
  const titel = `${lehrwerkName(lw.get(us[0].lehrwerkId))} – ${us.map((u) => 'Unit ' + u.nummer).join(', ')}`;
  const zeile = (q, i, loes) => `<tr><td class="nr">${i + 1}.</td><td>${esc(L.frage(q.v, q.r))}</td><td class="${loes ? 'loes' : 'leer'}">${loes ? esc(L.loesungen(q.v, q.r).join('; ')) : ''}</td></tr>`;
  const html = `
    <div class="no-print">
      <div class="msg info small">Tippe auf <strong>Drucken</strong>. Im Druckfenster kannst du auch <strong>„Als PDF sichern“</strong> bzw. über <strong>Teilen › In Dateien sichern</strong> ein PDF speichern.
        Klappt das Drucken in der Home-Bildschirm-App nicht, öffne die Seite in Safari.</div>
      <div class="btn-row"><button class="btn" id="d-print">🖨️ Drucken / PDF</button><button class="btn secondary" id="d-neu">🔀 Neu mischen</button></div>
      <div class="btn-row"><a class="btn secondary" href="${esc(location.href)}" target="_blank" rel="noopener">In Safari öffnen</a></div>
    </div>
    <div class="druck">
      <h2>Vokabeltest</h2>
      <p>${esc(titel)}</p>
      <p class="kopfzeile">Name: ______________________ &nbsp; Datum: ____________ &nbsp; Punkte: ____ / ${fragen.length}</p>
      <p class="small">Übersetze. ${fach.formenTyp === 'latein' ? 'Bei Nomen Genitiv und Genus, bei Verben die Stammformen angeben.' : ''}</p>
      <table class="testtab">${fragen.map((q, i) => zeile(q, i, false)).join('')}</table>
      <div class="seitenumbruch"></div>
      <h2>Lösungen</h2>
      <p>${esc(titel)}</p>
      <table class="testtab">${fragen.map((q, i) => zeile(q, i, true)).join('')}</table>
    </div>`;
  return {
    title: 'Test drucken', back: 'history', html,
    bind(root) {
      $('#d-print', root).onclick = () => window.print();
      $('#d-neu', root).onclick = () => ctx.rerender();
    }
  };
}

// ================= Erfolge =================
export async function erfolgeView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const b = await holeBelohnung(ctx.profil.id);
  const stat = await L.kastenStatistik(ctx.profil.id);
  const hat = new Map(b.abzeichen.map((a) => [a.id, a]));
  const html = `
    <div class="grid">
      <div class="card stat"><div class="big">⭐</div><div class="zahl">${b.punkte}</div><div class="muted small">Punkte</div></div>
      <div class="card stat"><div class="big">🔥</div><div class="zahl">${b.serie.aktuell}</div><div class="muted small">Tage am Stück (Rekord ${b.serie.rekord})</div></div>
      <div class="card stat"><div class="big">🧠</div><div class="zahl">${stat.sicher}</div><div class="muted small">Vokabeln sicher</div></div>
      <div class="card stat"><div class="big">🏅</div><div class="zahl">${b.abzeichen.length}/${ABZEICHEN.length}</div><div class="muted small">Abzeichen</div></div>
    </div>
    <h3>Abzeichen</h3>
    <div class="abzeichen">${ABZEICHEN.map((a) => `<div class="card ${hat.has(a.id) ? '' : 'gesperrt'}">
      <div class="big">${a.icon}</div><strong>${esc(a.name)}</strong><div class="small muted">${esc(a.text)}</div>
      ${hat.has(a.id) ? `<div class="small" style="color:var(--ok)">✓ ${datum(hat.get(a.id).erhaltenAm)}</div>` : ''}</div>`).join('')}</div>`;
  return { title: 'Meine Erfolge', back: 'home', html };
}

// ================= Eltern-Ansicht =================
let elternOffen = false;

async function hash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function elternView(_p, ctx) {
  const pinRec = await db.getMeta('elternPin');
  if (!elternOffen) {
    const html = pinRec ? `
      <div class="card" style="text-align:center"><div class="big" style="font-size:48px">🔒</div>
        <p>Eltern-Bereich. Bitte PIN eingeben.</p>
        <input id="el-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" style="text-align:center;font-size:28px;letter-spacing:8px">
        <button class="btn block" id="el-ok" style="margin-top:12px">Öffnen</button>
        <p class="muted small">PIN vergessen? Unter Sicherung › Gefahrenzone alles löschen und neu einrichten – oder Sicherung laden.</p></div>`
      : `<div class="card"><h3 style="margin-top:0">Eltern-PIN festlegen</h3>
        <p>Mit der PIN schützt du die Eltern-Ansicht. Kinder sehen sie dann nicht ohne dich.</p>
        <input id="el-neu" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="4–8 Ziffern">
        <input id="el-neu2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN wiederholen" style="margin-top:8px">
        <button class="btn block" id="el-set" style="margin-top:12px">PIN speichern</button></div>`;
    return {
      title: 'Eltern', back: 'home', html,
      bind(root) {
        const ok = $('#el-ok', root);
        if (ok) {
          const tryOpen = async () => {
            if ((await hash($('#el-pin', root).value, pinRec.salt)) === pinRec.hash) { elternOffen = true; ctx.rerender(); }
            else { toast('Falsche PIN.'); $('#el-pin', root).value = ''; }
          };
          ok.onclick = tryOpen;
          $('#el-pin', root).onkeydown = (e) => { if (e.key === 'Enter') tryOpen(); };
          setTimeout(() => $('#el-pin', root).focus(), 50);
        } else {
          $('#el-set', root).onclick = async () => {
            const a = $('#el-neu', root).value, b = $('#el-neu2', root).value;
            if (!/^\d{4,8}$/.test(a)) { toast('Bitte 4 bis 8 Ziffern.'); return; }
            if (a !== b) { toast('Die beiden PINs sind verschieden.'); return; }
            const salt = uid('s');
            await db.setMeta('elternPin', { salt, hash: await hash(a, salt) });
            elternOffen = true; toast('PIN gespeichert.'); ctx.rerender();
          };
        }
      }
    };
  }

  const profile = await db.all('profile');
  const tage = [...Array(7)].map((_, i) => L.plusTage(L.heute(), i - 6));
  const karten = await Promise.all(profile.map(async (p) => {
    const [b, stat, ev, tests, termine] = await Promise.all([
      holeBelohnung(p.id), L.kastenStatistik(p.id), db.byIndex('ereignisse', 'profilId', p.id),
      db.byIndex('tests', 'profilId', p.id), db.byIndex('termine', 'profilId', p.id)
    ]);
    const proTag = new Map(tage.map((t) => [t, 0]));
    ev.forEach((e) => { const t = L.isoTag(e.zeitpunkt); if (proTag.has(t)) proTag.set(t, proTag.get(t) + 1); });
    const max = Math.max(1, ...proTag.values());
    const letzte = ev.reduce((m, e) => (e.zeitpunkt > m ? e.zeitpunkt : m), '');
    const quote = ev.length ? Math.round(ev.filter((e) => e.korrekt).length / ev.length * 100) : 0;
    const falschZaehl = new Map();
    ev.filter((e) => !e.korrekt && e.vokabelId).forEach((e) => falschZaehl.set(e.vokabelId, (falschZaehl.get(e.vokabelId) || 0) + 1));
    const schwerIds = [...falschZaehl].sort((a, c) => c[1] - a[1]).slice(0, 5);
    const schwer = (await Promise.all(schwerIds.map(([id, n]) => db.get('vokabeln', id).then((v) => v && { v, n })))).filter(Boolean);
    const kommend = termine.filter((t) => t.datum >= L.heute()).sort((a, c) => a.datum.localeCompare(c.datum));
    tests.sort((a, c) => c.zeitpunkt.localeCompare(a.zeitpunkt));
    return `<div class="card">
      <h3 style="margin-top:0">${avatarHtml(p.avatar, 22)} ${esc(p.name)}</h3>
      <p class="small">Zuletzt aktiv: <strong>${letzte ? datum(letzte) : 'noch nie'}</strong> · Serie: <strong>${plural(b.serie.aktuell, 'Tag', 'Tage')}</strong> (Rekord ${b.serie.rekord}) · ⭐ ${b.punkte}</p>
      <h4 class="muted small">ANTWORTEN DER LETZTEN 7 TAGE</h4>
      <div class="woche">${tage.map((t) => `<div><span style="height:${Math.round(proTag.get(t) / max * 56) + 2}px"></span><small>${new Date(t + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' })}</small><b>${proTag.get(t)}</b></div>`).join('')}</div>
      <p class="small">Trefferquote insgesamt: <strong>${quote} %</strong> bei ${ev.length} Antworten</p>
      <h4 class="muted small">LERNSTAND (${stat.gesamt} VOKABELN)</h4>
      <div class="kasten">${stat.zaehl.map((n, i) => `<div><span style="height:${stat.gesamt ? Math.max(4, n / stat.gesamt * 60) : 4}px"></span><small>${i ? 'K' + i : 'neu'}</small><b>${n}</b></div>`).join('')}</div>
      <p class="small muted">${stat.sicher} sicher (Kasten 4–5), ${stat.zaehl[0]} noch nie geübt</p>
      ${tests.length ? `<h4 class="muted small">TESTS</h4><ul class="small">${tests.slice(0, 5).map((t) => `<li>${datum(t.zeitpunkt)}: <strong>${t.prozent} %</strong> (${esc(t.einschaetzung)})</li>`).join('')}</ul>` : ''}
      ${kommend.length ? `<h4 class="muted small">ANSTEHEND</h4><ul class="small">${kommend.map((t) => `<li>${esc(t.titel)} am ${esc(L.datumLang(t.datum))}</li>`).join('')}</ul>` : ''}
      ${schwer.length ? `<h4 class="muted small">SCHWIERIGSTE WÖRTER</h4><ul class="small">${schwer.map((s) => `<li>${esc(s.v.wort)} – ${esc(s.v.bedeutungen[0])} (${s.n}× falsch)</li>`).join('')}</ul>` : ''}
    </div>`;
  }));
  const K = await import('./ki.js');
  const ki = await K.einstellungen();
  const html = `${karten.join('') || '<div class="card muted">Noch keine Profile.</div>'}
    <div class="card" id="ki-karte">
      <h3 style="margin-top:0">🤖 KI-Anbindung <span class="badge">optional</span></h3>
      <p class="small">Mit einem eigenen, kostenlosen Zugangsschlüssel wertet die App Fotos der Vokabelseite <strong>selbst</strong> aus – ohne Kopieren und Einfügen. Außerdem kann die KI eigene Sätze prüfen. Der Schlüssel bleibt nur auf diesem Gerät und kommt <strong>nicht</strong> in die Sicherungsdatei.</p>
      ${ki.schluessel && ki.modell ? `<div class="msg ok small">✓ Eingerichtet: <strong>${esc(K.ANBIETER[ki.anbieter].name)}</strong>, Modell <strong>${esc(ki.modell)}</strong>${ki.ausweich?.length ? `<br>Ausweichmodelle bei Überlastung: ${esc(ki.ausweich.join(', '))}` : '<br>Keine Ausweichmodelle – zum Festlegen „Prüfen & Modelle laden“ und speichern.'}</div>` : ''}
      <label>Anbieter</label>
      <div class="btn-row" id="ki-anbieter" style="margin-top:0">${Object.entries(K.ANBIETER).map(([id, a]) => `<button class="btn ${ki.anbieter === id ? '' : 'secondary'}" data-anb="${id}">${esc(a.name)}${id === 'gemini' ? ' ⭐' : ''}</button>`).join('')}</div>
      <p class="small muted" id="ki-daten"></p>
      <p class="small"><a id="ki-link" href="#" target="_blank" rel="noopener">→ Hier kostenlos einen Schlüssel erzeugen</a> (Konto für Erwachsene)</p>
      <label for="ki-key">Zugangsschlüssel (API-Key)</label>
      <input id="ki-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Schlüssel einfügen" value="${esc(ki.schluessel || '')}">
      <div class="btn-row"><button class="btn" id="ki-laden">Prüfen & Modelle laden</button></div>
      <div id="ki-modelle"></div>
      ${ki.schluessel ? '<div class="btn-row"><button class="btn secondary" id="ki-test">Verbindung testen</button><button class="btn danger" id="ki-weg">KI-Anbindung entfernen</button></div>' : ''}
      <p class="small muted">Gratis-Angebote ändern sich häufig. Klappt ein Anbieter nicht mehr, einfach umschalten. Der Weg über Kopieren und Einfügen bleibt immer möglich.</p>
    </div>
    <div class="btn-row"><button class="btn secondary" id="el-zu">🔒 Schließen</button><button class="btn secondary" id="el-pinneu">PIN ändern</button></div>`;
  return {
    title: 'Eltern-Ansicht', back: 'home', html,
    bind(root) {
      $('#el-zu', root).onclick = () => { elternOffen = false; ctx.go('home'); };
      // ----- KI-Anbindung -----
      let anbieter = ki.anbieter || 'gemini';
      const zeigeAnbieter = () => {
        $('#ki-daten', root).textContent = K.ANBIETER[anbieter].daten;
        $('#ki-link', root).href = K.ANBIETER[anbieter].schluesselUrl;
        $$('#ki-anbieter [data-anb]', root).forEach((b) => b.classList.toggle('secondary', b.dataset.anb !== anbieter));
      };
      zeigeAnbieter();
      $$('#ki-anbieter [data-anb]', root).forEach((b) => b.onclick = () => {
        anbieter = b.dataset.anb; zeigeAnbieter();
        if (anbieter !== ki.anbieter) { $('#ki-key', root).value = ''; $('#ki-modelle', root).innerHTML = ''; }
      });
      $('#ki-laden', root).onclick = async () => {
        const key = $('#ki-key', root).value.trim();
        if (!key) { toast('Bitte zuerst den Schlüssel einfügen.'); return; }
        const box = $('#ki-modelle', root);
        box.innerHTML = '<p class="muted small">Prüfe Schlüssel …</p>';
        try {
          const liste = await K.modelle(anbieter, key);
          if (!liste.length) { box.innerHTML = '<div class="msg warn small">Schlüssel gültig, aber keine passenden Modelle gefunden.</div>'; return; }
          const vor = anbieter === ki.anbieter && liste.some((m) => m.id === ki.modell) ? ki.modell : K.vorschlag(anbieter, liste);
          box.innerHTML = `<div class="msg ok small">✓ Schlüssel gültig. ${liste.length} Modelle gefunden.</div>
            <label for="ki-modell">Modell (muss Fotos lesen können)</label>
            <select id="ki-modell">${liste.map((m) => `<option value="${esc(m.id)}" ${m.id === vor ? 'selected' : ''}>${esc(m.name)}${m.bild === false ? ' (ohne Bild)' : ''}</option>`).join('')}</select>
            <div class="btn-row"><button class="btn" id="ki-speichern">Speichern</button></div>`;
          $('#ki-speichern', root).onclick = async () => {
            const gewaehlt = $('#ki-modell', root).value;
            await K.speichere({ anbieter, schluessel: key, modell: gewaehlt, ausweich: K.ausweichListe(anbieter, liste, gewaehlt) });
            toast('KI-Anbindung gespeichert ✓');
            ctx.rerender();
          };
        } catch (e) { box.innerHTML = `<div class="msg err small">${esc(e.message).replace(/\n/g, '<br>')}</div>`; }
      };
      const t = $('#ki-test', root);
      if (t) t.onclick = async () => {
        t.disabled = true; t.textContent = 'Teste …';
        try { const a = await K.teste((m) => { t.textContent = m; }); toast(`Verbindung klappt ✓ (Antwort: ${a})`); }
        catch (e) { toast(e.message.split('\n')[0], 8000); }
        t.disabled = false; t.textContent = 'Verbindung testen';
      };
      const w = $('#ki-weg', root);
      if (w) w.onclick = async () => { if (confirm('KI-Anbindung und Schlüssel von diesem Gerät entfernen?')) { await K.entferne(); toast('Entfernt.'); ctx.rerender(); } };
      $('#el-pinneu', root).onclick = async () => { await db.put('meta', { key: 'elternPin', value: null }); await db.del('meta', 'elternPin'); elternOffen = false; ctx.rerender(); };
    }
  };
}
