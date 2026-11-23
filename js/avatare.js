// Profilfiguren: Emojis in Kategorien (Klasse 5 bis Abitur) und Initialen mit Farbe.
// Initialen werden als "ini:AB:#3b82f6" gespeichert.
import { esc } from './util.js';

export const KATEGORIEN = [
  { name: 'Tiere', liste: ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🐧', '🐨', '🐵', '🐬', '🦉', '🐺', '🦅', '🦈', '🐢', '🦋', '🐝', '🐳', '🦒', '🦥', '🐈‍⬛', '🐕', '🦔', '🦜'] },
  { name: 'Fantasie', liste: ['🦄', '🐉', '🦖', '👾', '🤖', '👽', '🧙', '🧛', '🧜', '🥷', '🦸', '🧞'] },
  { name: 'Sport', liste: ['⚽', '🏀', '🏐', '🎾', '🏓', '🏸', '🏒', '🏈', '🥊', '🥋', '🛹', '🏄', '🚴', '🧗', '🏊', '⛷️', '🏇', '🤸', '🏋️', '🎯'] },
  { name: 'Musik & Kunst', liste: ['🎸', '🎧', '🎤', '🎹', '🥁', '🎻', '🎷', '🎺', '🎨', '📷', '🎬', '🎭', '✏️', '🖌️'] },
  { name: 'Games & Technik', liste: ['🎮', '🕹️', '💻', '⌨️', '📱', '🛸', '🚀', '🛰️', '🔭', '🧪', '🔬', '🧬', '⚙️', '🔋'] },
  { name: 'Natur & Welt', liste: ['🌍', '🌙', '⭐', '🌟', '⚡', '🔥', '🌊', '🏔️', '🌋', '🌵', '🌸', '🌻', '🍀', '🌈', '❄️', '🪐'] },
  { name: 'Lässig', liste: ['😎', '🕶️', '🧢', '👟', '🎒', '☕', '🧋', '🍕', '🍔', '🌮', '🍩', '🍉', '🧩', '♟️', '🎲', '🎳'] },
  { name: 'Ziele & Schule', liste: ['📚', '🎓', '🏆', '🥇', '💡', '🧠', '📝', '🗺️', '⏳', '🏛️', '✈️', '🏍️', '🚗', '⛵', '🗽', '🗼'] },
  { name: 'Symbole', liste: ['💎', '💯', '✨', '🔱', '⚓', '🛡️', '🗝️', '♾️', '☮️', '☯️', '♠️', '♥️', '♦️', '♣️', '🔷', '🟣'] }
];

export const ALLE = KATEGORIEN.flatMap((k) => k.liste);
export const INI_FARBEN = ['#2f5bd3', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#475569', '#111827', '#9b3d1f'];

export function zufall() { return ALLE[Math.floor(Math.random() * 40)]; }

export function istInitialen(a) { return String(a || '').startsWith('ini:'); }
export function parseInitialen(a) {
  const [, text = '?', farbe = INI_FARBEN[0]] = String(a).split(':');
  return { text, farbe };
}
export function initialen(text, farbe) {
  const t = String(text || '').trim().replace(/[^A-Za-zÄÖÜäöü0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  return `ini:${t}:${farbe}`;
}

/** HTML für die Figur. groesse in px (Schriftgröße bzw. Kreis) */
export function avatarHtml(a, groesse = null) {
  if (istInitialen(a)) {
    const { text, farbe } = parseInitialen(a);
    const st = groesse ? `width:${groesse * 1.25}px;height:${groesse * 1.25}px;font-size:${groesse * 0.55}px;` : '';
    return `<span class="ava-ini" style="background:${esc(farbe)};${st}" aria-label="Initialen ${esc(text)}">${esc(text)}</span>`;
  }
  return esc(a || '🙂');
}
