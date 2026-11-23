// Erfolgs-Animationen (Konfetti, Abzeichen-Einblendung, Punkte). Nur wenn im Profil eingeschaltet (Standard: aus).
// Respektiert „Bewegung reduzieren“ des Geräts.
import { esc } from './util.js';
import { style, E } from './styles.js';

let profilEin = false;
export function setzeAnimationen(an) { profilEin = !!an; }
const reduziert = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const aktiv = () => profilEin && !reduziert();

/**
 * Feier-Animation im Stil des Profils. staerke: 1 (klein) bis 3 (groß)
 *  explosion (Standard): Konfetti aus der Mitte
 *  funken (Rock):        Funken und ⚡🔥 schießen von unten hoch, kurzer roter Blitz
 *  aufsteigen (Pop):     Herzen und Glitzer schweben sanft nach oben
 *  regen (HipHop):       Gold, 💎 und 💯 regnen von oben, der Bildschirm „wummert“
 */
export function konfetti(staerke = 2, { erzwingen = false } = {}) {
  if (!erzwingen && !aktiv()) return;
  const { art, farben, teilchen } = style().feier;
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (c.width = innerWidth * dpr), h = (c.height = innerHeight * dpr);
  const ctx = c.getContext('2d');
  const zufall = (a, b) => a + Math.random() * (b - a);
  const farbe = () => farben[Math.floor(Math.random() * farben.length)];
  const emoji = () => (teilchen.length && Math.random() < 0.35 ? teilchen[Math.floor(Math.random() * teilchen.length)] : null);
  const n = Math.round((art === 'aufsteigen' ? 28 : art === 'regen' ? 45 : 60) * staerke);
  const teile = Array.from({ length: n }, (_, i) => {
    const t = { r: zufall(0, Math.PI), vr: zufall(-0.3, 0.3), f: farbe(), e: emoji(), s: zufall(6, 12) * dpr, form: Math.random() < 0.3 ? 'kreis' : 'rechteck', verz: 0 };
    if (art === 'funken') Object.assign(t, { x: i % 2 ? zufall(0, w * 0.25) : zufall(w * 0.75, w), y: h + 10, vx: zufall(-4, 4) * dpr + (i % 2 ? 4 : -4) * dpr, vy: zufall(-26, -16) * dpr, g: 0.55 * dpr, form: 'funke', s: zufall(3, 6) * dpr });
    else if (art === 'aufsteigen') Object.assign(t, { x: zufall(0, w), y: h + zufall(0, h * 0.3), vx: 0, vy: zufall(-3.2, -1.6) * dpr, g: 0, phase: zufall(0, 6.3), form: 'herz', s: zufall(10, 18) * dpr, verz: zufall(0, 600) });
    else if (art === 'regen') Object.assign(t, { x: zufall(0, w), y: -zufall(10, h * 0.6), vx: zufall(-0.6, 0.6) * dpr, vy: zufall(3, 6) * dpr, g: 0.12 * dpr, form: Math.random() < 0.6 ? 'muenze' : 'rechteck', s: zufall(9, 15) * dpr });
    else Object.assign(t, { x: w / 2 + zufall(-0.15, 0.15) * w, y: h * 0.35, vx: zufall(-9, 9) * dpr, vy: zufall(-22, -6) * dpr, g: 0.45 * dpr });
    if (t.e) t.s = zufall(20, 30) * dpr;
    return t;
  });
  if (art === 'funken') {
    const blitz = document.createElement('div');
    blitz.className = 'fx-blitz';
    blitz.style.background = 'radial-gradient(circle at 50% 100%, rgba(255,80,30,.55), transparent 70%)';
    document.body.appendChild(blitz); setTimeout(() => blitz.remove(), 600);
  }
  if (art === 'regen') { const m = document.getElementById('app'); m?.classList.remove('fx-wummern'); void m?.offsetWidth; m?.classList.add('fx-wummern'); }
  const start = performance.now();
  const dauer = (art === 'aufsteigen' ? 3200 : art === 'regen' ? 2800 : 1800) + staerke * 500;
  const herz = (s) => { ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.4, -s, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.4, -s, s, -s * 0.3, 0, s * 0.3); ctx.fill(); };
  const schritt = (zeit) => {
    const el = zeit - start, p = el / dauer;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.7) / 0.3);
    for (const k of teile) {
      if (el < k.verz) continue;
      k.vy += k.g; k.vx *= 0.99; k.x += k.vx; k.y += k.vy; k.r += k.vr;
      if (art === 'aufsteigen') k.x += Math.sin(el / 400 + k.phase) * 0.8 * dpr;
      ctx.save(); ctx.translate(k.x, k.y);
      if (k.e) { ctx.font = `${k.s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k.e, 0, 0); }
      else {
        ctx.rotate(k.r); ctx.fillStyle = k.f;
        if (k.form === 'kreis') { ctx.beginPath(); ctx.arc(0, 0, k.s / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (k.form === 'herz') { ctx.rotate(-k.r); herz(k.s); }
        else if (k.form === 'muenze') { ctx.beginPath(); ctx.ellipse(0, 0, k.s / 2, (k.s / 2) * Math.abs(Math.cos(k.r * 2)) + 1, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (k.form === 'funke') { ctx.shadowColor = k.f; ctx.shadowBlur = 8 * dpr; ctx.fillRect(-k.s / 2, -k.s * 1.5, k.s, k.s * 3); }
        else ctx.fillRect(-k.s / 2, -k.s / 4, k.s, k.s / 2);
      }
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
  el.textContent = `+${n} ${E('punkt')}`;
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
