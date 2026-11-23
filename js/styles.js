// Styles (je Profil): Standard, Rock, Pop, HipHop – Farben (CSS), Logo, Emojis, Feier-Animation.
// Das Home-Bildschirm-Symbol bleibt immer das Standard-Logo (Web-Apps können es nicht je Profil wechseln).
import { LS_PREFIX } from './config.js';

export const STYLES = {
  standard: {
    name: 'Standard', kurz: 'Klar und ruhig', logo: 'icons/logo-96.png', logoGross: 'icons/logo-256.png',
    emoji: { lernen: '🃏', plan: '📅', import: '📸', buecher: '📚', erfolge: '🏆', eltern: '👪', sicherung: '💾', einstellungen: '⚙️', geschafft: '🎉', test: '🏆', punkt: '⭐', serie: '🔥', heute: '☀️' },
    feier: { art: 'explosion', farben: ['#2f5bd3', '#f59e0b', '#16a34a', '#db2777', '#7c3aed', '#0ea5e9', '#ef4444', '#facc15'], teilchen: [] }
  },
  rock: {
    name: 'Rock', kurz: 'Laut, dunkel, feurig', logo: 'icons/styles/rock-96.png', logoGross: 'icons/styles/rock-256.png',
    emoji: { lernen: '🎸', plan: '🥁', import: '📸', buecher: '📀', erfolge: '🤘', eltern: '🎚️', sicherung: '💾', einstellungen: '🎛️', geschafft: '🤘', test: '🔥', punkt: '🤘', serie: '🔥', heute: '⚡' },
    feier: { art: 'funken', farben: ['#ff2e2e', '#ff7a14', '#ffd23c', '#ffffff'], teilchen: ['⚡', '🔥', '🤘', '🎸'] }
  },
  pop: {
    name: 'Pop', kurz: 'Bunt, fröhlich, glitzernd', logo: 'icons/styles/pop-96.png', logoGross: 'icons/styles/pop-256.png',
    emoji: { lernen: '🎤', plan: '🗓️', import: '📸', buecher: '💿', erfolge: '🌟', eltern: '💌', sicherung: '💾', einstellungen: '🎀', geschafft: '🥳', test: '👑', punkt: '💖', serie: '✨', heute: '🌈' },
    feier: { art: 'aufsteigen', farben: ['#ff4fa3', '#b450e6', '#6e5aff', '#ffd1ec', '#7ee8fa'], teilchen: ['💖', '✨', '🌟', '🦄', '💜'] }
  },
  hiphop: {
    name: 'HipHop', kurz: 'Gold, Beats, Street-Style', logo: 'icons/styles/hiphop-96.png', logoGross: 'icons/styles/hiphop-256.png',
    emoji: { lernen: '🎧', plan: '📻', import: '📸', buecher: '💿', erfolge: '👑', eltern: '🧢', sicherung: '💾', einstellungen: '🎚️', geschafft: '🔥', test: '💯', punkt: '💎', serie: '🔥', heute: '🎤' },
    feier: { art: 'regen', farben: ['#ffe680', '#f0be28', '#aa6e0a', '#ffffff'], teilchen: ['💎', '💯', '👑', '🪙', '🎧'] }
  }
};

let aktuell = 'standard';
export function setzeStyle(id = 'standard') {
  aktuell = STYLES[id] ? id : 'standard';
  const root = document.documentElement;
  if (aktuell === 'standard') delete root.dataset.style; else root.dataset.style = aktuell;
  try { localStorage.setItem(LS_PREFIX + 'style', aktuell); } catch { /* privat */ }
}
export const style = () => STYLES[aktuell];
export const styleId = () => aktuell;
/** Emoji für einen Zweck im aktuellen Style */
export const E = (zweck) => STYLES[aktuell].emoji[zweck] || STYLES.standard.emoji[zweck] || '';
