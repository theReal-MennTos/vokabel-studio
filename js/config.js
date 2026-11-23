// Beta-Testversion läuft unter eigener Adresse (…/vokabel-studio-beta/) auf derselben Domain.
// Damit Test- und Live-Daten sich nicht mischen, bekommt die Beta eigene Speichernamen.
export const BETA = /beta/i.test(location.pathname);
export const DB_NAME = BETA ? 'vokabel-studio-beta' : 'vokabel-studio';
export const LS_PREFIX = BETA ? 'vsb-' : 'vs-';
export const APP_VERSION = BETA ? '2.0.0-beta (Stufen 2–4)' : '2.0.0';
