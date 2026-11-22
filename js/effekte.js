// Erfolgs-Animationen (Konfetti, Abzeichen-Einblendung, Punkte). Nur wenn im Profil eingeschaltet (Standard: aus).
// Respektiert „Bewegung reduzieren“ des Geräts.
import { esc } from './util.js';

let profilEin = false;
export function setzeAnimationen(an) { profilEin = !!an; }
const reduziert = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const aktiv = () => profilEin && !reduziert();

const FARBEN = ['#2f5bd3', '#f59e0b', '#16a34a', '#db2777', '#7c3aed', '#0ea5e9', '#ef4444', '#facc15'];

/** Konfetti-Regen. staerke: 1 (klein) bis 3 (groß) */
export function konfetti(staerke = 2, { erzwingen = false } = {}) {
  if (!erzwingen && !aktiv()) return;
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (c.width = innerWidth * dpr), h = (c.height = innerHeight * dpr);
  const ctx = c.getContext('2d');
  const n = 60 * staerke;
  const teile = Array.from({ length: n }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
    vx: (Math.random() - 0.5) * 18 * dpr, vy: (-Math.random() * 16 - 6) * dpr,
    g: 0.45 * dpr, s: (6 + Math.random() * 6) * dpr, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    f: FARBEN[Math.floor(Math.random() * FARBEN.length)], form: Math.random() < 0.3 ? 'kreis' : 'rechteck'
  }));
  const start = performance.now();
  const dauer = 1800 + staerke * 500;
  const schritt = (t) => {
    const p = (t - start) / dauer;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.7) / 0.3);
    for (const k of teile) {
      k.vy += k.g; k.vx *= 0.99; k.x += k.vx; k.y += k.vy; k.r += k.vr;
      ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.r); ctx.fillStyle = k.f;
      if (k.form === 'kreis') { ctx.beginPath(); ctx.arc(0, 0, k.s / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-k.s / 2, -k.s / 4, k.s, k.s / 2);
      ctx.restore();
    }
    if (p < 1) requestAnimationFrame(schritt); else c.remove();
  };
  requestAnimationFrame(schritt);
}

/** Einblendung eines neuen Abzeichens */
export function abzeichen(a, { erzwingen = false } = {}) {
  if (!erzwingen && !aktiv()) return false;
  const el = document.createElement('div');
  el.className = 'fx-badge';
  el.innerHTML = `<div class="fx-badge-karte"><div class="fx-badge-icon">${esc(a.icon)}</div>
    <div class="small muted">Neues Abzeichen!</div><strong>${esc(a.name)}</strong><div class="small">${esc(a.text)}</div></div>`;
  document.body.appendChild(el);
  konfetti(2, { erzwingen });
  const weg = () => { el.classList.add('weg'); setTimeout(() => el.remove(), 400); };
  el.onclick = weg;
  setTimeout(weg, 3200);
  return true;
}

/** Kleines „+10 ⭐“ an einem Element */
export function punkte(n, ziel) {
  if (!aktiv() || !n || !ziel) return;
  const r = ziel.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fx-punkte';
  el.textContent = `+${n} ⭐`;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/** Kurzes Aufleuchten (richtige Antwort) */
export function puls(el) {
  if (!aktiv() || !el) return;
  el.classList.remove('fx-puls'); void el.offsetWidth; el.classList.add('fx-puls');
}
