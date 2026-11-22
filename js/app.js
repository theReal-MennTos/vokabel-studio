// Vokabel-Studio – Start, Router, Grundgerüst
import * as db from './db.js';
import { FAECHER, LEHRWERKE } from './faecher.js';
import { esc, toast } from './util.js';
import * as V from './views.js';
import { importView } from './import-view.js';

export const APP_VERSION = '1.0.0 (Stufe 1)';

const ROUTES = [
  ['', V.startView],
  ['profile', V.profileView],
  ['profil-neu', V.profilFormView],
  ['profil/:id', V.profilFormView],
  ['home', V.homeView],
  ['bibliothek', V.bibliothekView],
  ['lehrwerk/:id', V.lehrwerkView],
  ['lehrwerk-neu/:fachId', V.lehrwerkFormView],
  ['unit/:id', V.unitView],
  ['vokabel/:id', V.vokabelView],
  ['vokabel-bearbeiten/:id', V.vokabelFormView],
  ['import', importView],
  ['backup', V.backupView],
  ['einstellungen', V.einstellungenView]
];

function match(path) {
  const teile = path.split('/').filter(Boolean);
  for (const [muster, view] of ROUTES) {
    const m = muster.split('/').filter(Boolean);
    if (m.length !== teile.length) continue;
    const params = {};
    if (m.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(teile[i])), true) : s === teile[i]))) {
      return { view, params };
    }
  }
  return null;
}

// --- aktives Profil (nur Komfort: localStorage, mit Absicherung) ---
const PROFIL_KEY = 'vs-aktives-profil';
export function aktivesProfilId() { try { return localStorage.getItem(PROFIL_KEY); } catch { return null; } }
export function setzeAktivesProfil(id) { try { id ? localStorage.setItem(PROFIL_KEY, id) : localStorage.removeItem(PROFIL_KEY); } catch { /* privat */ } }

export function go(path) { location.hash = '#/' + path; }

const ctx = { go, profil: null, rerender: () => render(), setzeAktivesProfil };

async function render() {
  const roh = location.hash.replace(/^#\/?/, '');
  const [path, qs] = roh.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const treffer = match(path) || match('');
  const id = aktivesProfilId();
  ctx.profil = id ? await db.get('profile', id) : null;
  if (!ctx.profil && id) setzeAktivesProfil(null);

  const main = document.getElementById('app');
  try {
    const r = await treffer.view({ ...treffer.params, query }, ctx);
    if (!r) return;   // View hat umgeleitet
    document.getElementById('title').textContent = r.title || 'Vokabel-Studio';
    document.title = r.title && r.title !== 'Vokabel-Studio' ? `${r.title} – Vokabel-Studio` : 'Vokabel-Studio';
    const back = document.getElementById('btn-back');
    back.hidden = !r.back;
    back.onclick = () => (r.back === 'history' ? history.back() : go(r.back));
    const pb = document.getElementById('btn-profile');
    pb.hidden = !ctx.profil || r.hideProfile;
    pb.textContent = ctx.profil?.avatar || '';
    pb.title = ctx.profil ? `${ctx.profil.name} – Profil wechseln` : '';
    main.innerHTML = r.html;
    if (r.bind) await r.bind(main);
    if (!r.keepScroll) window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="msg err"><strong>Da ist etwas schiefgelaufen.</strong><br>${esc(e.message || e)}</div>
      <a class="btn secondary block" href="#/home">Zur Startseite</a>`;
  }
}

async function seed() {
  if ((await db.getMeta('seed', 0)) >= 1) return;
  const ops = [
    ...FAECHER.map((f) => ({ store: 'faecher', op: 'put', value: { ...f } })),
    ...LEHRWERKE.map((l) => ({ store: 'lehrwerke', op: 'put', value: { ...l, vorinstalliert: true } }))
  ];
  await db.batch(ops);
  await db.setMeta('seed', 1);
}

async function start() {
  document.getElementById('btn-profile').onclick = () => go('profile');
  try {
    await db.openDb();
    await seed();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="msg err"><strong>Der Speicher auf diesem Gerät ist nicht verfügbar.</strong><br>
      ${esc(e.message || e)}<br><br>Mögliche Ursache: privater Modus in Safari. Bitte die App normal öffnen.</div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => toast('App wurde aktualisiert.'));
  }
}

start();
