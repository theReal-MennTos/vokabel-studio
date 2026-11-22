// Hell/Dunkel/Automatisch. Wird je Profil gespeichert und zusätzlich lokal gemerkt (damit beim Start nichts aufblitzt).
import { LS_PREFIX } from './config.js';

export const DESIGNS = [['auto', 'Automatisch (wie das Gerät)'], ['hell', 'Hell'], ['dunkel', 'Dunkel']];

export function setzeDesign(d = 'auto') {
  const root = document.documentElement;
  if (d === 'hell') root.dataset.theme = 'light';
  else if (d === 'dunkel') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try { localStorage.setItem(LS_PREFIX + 'design', d); } catch { /* privat */ }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#2f5bd3');
}
