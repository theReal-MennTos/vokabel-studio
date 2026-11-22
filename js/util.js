export function uid(prefix = 'x') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${r[0].toString(36)}${r[1].toString(36)}`.slice(0, prefix.length + 12);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Vergleichsform eines Wortes: ohne (to), Längenzeichen, Satzzeichen, Groß/klein
export function normWort(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̄̆]/g, '')   // Makron/Breve (ā, ă)
    .normalize('NFC')
    .replace(/^\(to\)\s+|^to\s+/, '')
    .replace(/[.,!?;:"'„“”‚‘’()…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toast(text, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback für ältere Safari-Versionen
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function datum(d = new Date()) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function plural(n, eins, mehr) { return `${n} ${n === 1 ? eins : mehr}`; }
