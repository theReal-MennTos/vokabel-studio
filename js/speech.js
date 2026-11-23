// Vorlesen (speechSynthesis) und Spracheingabe (webkitSpeechRecognition).
// iOS: Stimmen hängen von den in den Einstellungen geladenen Stimmen ab; erstes Vorlesen nur nach Tippen.

export const ttsVerfuegbar = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
export const sttKlasse = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

let stimmenCache = null;
export function stimmen() {
  if (!ttsVerfuegbar()) return Promise.resolve([]);
  if (stimmenCache?.length) return Promise.resolve(stimmenCache);
  return new Promise((resolve) => {
    const fertig = () => { stimmenCache = speechSynthesis.getVoices(); resolve(stimmenCache); };
    const v = speechSynthesis.getVoices();
    if (v.length) return fertig();
    speechSynthesis.addEventListener('voiceschanged', fertig, { once: true });
    setTimeout(fertig, 1500);   // Safari feuert voiceschanged nicht immer
  });
}

export async function waehleStimme(lang) {
  const alle = await stimmen();
  const l = lang.toLowerCase().replace('_', '-');
  const basis = l.split('-')[0];
  const passend = alle.filter((v) => v.lang.toLowerCase().replace('_', '-') === l);
  const aehnlich = alle.filter((v) => v.lang.toLowerCase().startsWith(basis));
  const liste = passend.length ? passend : aehnlich;
  // bessere Qualitätsstufen bevorzugen, falls vorhanden
  return liste.find((v) => /premium|enhanced|erweitert/i.test(v.name)) || liste.find((v) => v.localService) || liste[0] || null;
}

export async function sprich(text, lang, { rate = 0.9 } = {}) {
  if (!ttsVerfuegbar() || !text) return { ok: false, grund: 'Vorlesen wird von diesem Browser nicht unterstützt.' };
  speechSynthesis.cancel();
  // Latein über italienische Stimme: Längenzeichen entfernen, sonst buchstabiert die Stimme teils
  if (lang.startsWith('it')) text = text.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');
  const u = new SpeechSynthesisUtterance(text);
  const stimme = await waehleStimme(lang);
  u.lang = stimme?.lang || lang;
  if (stimme) u.voice = stimme;
  u.rate = rate;
  return new Promise((resolve) => {
    let fertig = false;
    const ende = (r) => { if (!fertig) { fertig = true; resolve(r); } };
    u.onend = () => ende({ ok: true, stimme: stimme?.name || '(Standard)' });
    u.onerror = (e) => ende({ ok: false, grund: e.error || 'Fehler beim Vorlesen' });
    speechSynthesis.speak(u);
    setTimeout(() => ende({ ok: true, stimme: stimme?.name || '(Standard)', timeout: true }), Math.max(4000, text.length * 180));
  });
}

// Spracheingabe: liefert {ok, text, alternativen, grund}
// iOS-Safari-Eigenheiten (aus Gerätetests):
// - liefert Ergebnisse oft erst beim Stoppen und beendet nicht immer selbst → nach Stille selbst stoppen
// - im Dauer-Modus kommt jedes Zwischenergebnis komplett erneut („Mountain Mountain“) → zusammenführen, auf iOS kein Dauer-Modus
// - direkt nach Vorlesen oder einem vorigen Versuch ist das Mikrofon kurz belegt → Vorlesen stoppen, alte Erkennung abbrechen, kurz warten, einmal neu versuchen
// Rückgabe: Promise mit {ok, text, alternativen, grund, protokoll}; zusätzlich .stop() für einen Stopp-Knopf.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let aktiv = null;          // laufende Erkennung
let letztesEnde = 0;       // Zeitpunkt, an dem die letzte Erkennung endete
const PAUSE_MS = 600;

// iOS-Fehler (Gerätetest 23.11.2026): ab dem 2. Versuch meldet die Erkennung „Mikrofon an“, bekommt aber keinen Ton.
// Zum Eingrenzen gibt es Varianten; der Gerätetest lässt sie wählen. Die Wahl wird gemerkt.
export const VARIANTEN = {
  A: 'Standard (neu starten, stop)',
  B: 'Beenden mit abort statt stop',
  C: 'Mikrofon vorher kurz öffnen und schließen',
  D: 'Dieselbe Erkennung wiederverwenden',
  E: 'Jede Erkennung in einem frischen Unterfenster',
  F: 'Seite nach jedem Versuch neu laden (nur Gerätetest)'
};
// Ergebnis Gerätetest 23.11.2026 (iPhone, Home-Bildschirm): A–D funktionieren nur beim 1. Versuch nach dem App-Start.
let erfolgeSeitLaden = 0;
/** iOS: Nach dem ersten Erfolg liefert die Erkennung keinen Ton mehr (bis zum Neustart) → Tastatur-Diktat anbieten. */
export function mikroVerbraucht() { return IOS && erfolgeSeitLaden >= 1 && variante !== 'E' && variante !== 'F'; }
let variante = (() => { try { return localStorage.getItem('stt-variante') || 'A'; } catch { return 'A'; } })();
let wiederverwendet = null;
export function setzeVariante(v) { if (VARIANTEN[v]) { variante = v; try { localStorage.setItem('stt-variante', v); } catch { /* egal */ } } }
export function aktuelleVariante() { return variante; }

function fuehreZusammen(results) {
  // Chrome: Ergebnisse sind Teilstücke → aneinanderhängen. iOS: oft Wiederholungen → nur Neues anhängen.
  let text = '';
  for (const res of results) {
    const t = res[0].transcript.trim();
    if (!t) continue;
    const a = text.toLowerCase(), b = t.toLowerCase();
    if (!text || b.startsWith(a)) text = t;
    else if (!a.includes(b)) text += ' ' + t;
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function hoere(lang, opts = {}) {
  const K = sttKlasse();
  if (!K) {
    const p = Promise.resolve({ ok: false, grund: 'Spracheingabe wird von diesem Browser nicht unterstützt.', protokoll: [] });
    p.stop = () => {};
    return p;
  }
  let stopRef = { stop: () => {} };
  const p = (async () => {
    if (ttsVerfuegbar()) speechSynthesis.cancel();
    if (aktiv) { try { aktiv.abort(); } catch { /* egal */ } aktiv = null; await warte(PAUSE_MS); }
    const seitEnde = Date.now() - letztesEnde;
    if (seitEnde < PAUSE_MS) await warte(PAUSE_MS - seitEnde);
    if (variante === 'C' && navigator.mediaDevices?.getUserMedia) {
      try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); } catch { /* egal */ }
      await warte(300);
    }
    let r = await versuch(K, lang, opts, stopRef);
    if (r.ok) erfolgeSeitLaden++;
    // Sofort-Abbruch (Mikrofon belegt) → einmal neu versuchen
    if (!r.ok && r.sofort && !r.gestopptVonHand) {
      r.protokoll.push('→ zweiter Versuch');
      await warte(800);
      const r2 = await versuch(K, lang, opts, stopRef);
      r2.protokoll = [...r.protokoll, ...r2.protokoll];
      r = r2;
    }
    return r;
  })();
  p.stop = () => stopRef.stop();
  return p;
}

const warte = (ms) => new Promise((res) => setTimeout(res, ms));

function versuch(K, lang, { maxMs = 10000, stilleMs = 1400, startMs = 15000, onZwischen } = {}, stopRef) {
  return new Promise((resolve) => {
    let r, rahmen = null;
    if (variante === 'D') { r = wiederverwendet || new K(); wiederverwendet = r; }
    else if (variante === 'E') {
      rahmen = document.createElement('iframe');
      rahmen.setAttribute('allow', 'microphone');
      rahmen.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-10px;top:-10px';
      document.body.appendChild(rahmen);
      const W = rahmen.contentWindow;
      const KR = W.SpeechRecognition || W.webkitSpeechRecognition || K;
      r = new KR();
    } else r = new K();
    aktiv = r;
    const t0 = Date.now();
    const protokoll = [];
    const log = (x) => protokoll.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${x}`);
    let fertig = false, gestoppt = false, vonHand = false, gestartet = false, gehoert = false, mikro = false, text = '', alternativen = [], fehler = null;
    log('variante ' + variante);
    const timer = {};
    const clear = () => Object.values(timer).forEach(clearTimeout);
    const ende = () => {
      if (fertig) return;
      fertig = true; clear();
      if (aktiv === r) aktiv = null;
      letztesEnde = Date.now();
      if (rahmen) setTimeout(() => rahmen.remove(), 300);
      log('ende');
      const sofort = Date.now() - t0 < 1500 && !gehoert;
      const keinTon = mikro && !gehoert && !vonHand;
      if (text) resolve({ ok: true, text, alternativen: alternativen.length ? alternativen : [text], protokoll });
      else resolve({ ok: false, sofort, keinTon, gestopptVonHand: vonHand, protokoll,
        grund: fehler || (gehoert ? 'Nichts verstanden. Versuch es noch einmal oder tippe die Antwort.'
          : sofort ? 'Das Mikrofon war gerade belegt. Bitte noch einmal tippen.' : 'Nichts gehört. Sprich direkt nach dem Tippen, etwas lauter.') });
    };
    const stoppe = (grund) => {
      if (gestoppt) return;
      gestoppt = true;
      log('stop (' + grund + ')');
      try { variante === 'B' ? r.abort() : r.stop(); } catch { /* egal */ }
      timer.nachlauf = setTimeout(ende, 1500);   // falls onend ausbleibt
    };
    stopRef.stop = () => { vonHand = true; stoppe('Knopf'); };
    r.lang = lang;
    r.interimResults = true;
    r.continuous = !IOS;
    r.maxAlternatives = 3;
    r.onstart = () => { gestartet = true; log('start'); clearTimeout(timer.start); timer.max = setTimeout(() => stoppe('Zeit'), maxMs); };
    r.onaudiostart = () => { mikro = true; log('mikro an'); };
    r.onspeechstart = () => { gehoert = true; log('sprache erkannt'); };
    r.onresult = (e) => {
      gehoert = true;
      text = fuehreZusammen(e.results);
      const letzte = e.results[e.results.length - 1];
      if (e.results.length === 1) alternativen = [...letzte].map((a) => a.transcript.trim()).filter(Boolean);
      log(`ergebnis „${text}“${letzte.isFinal ? ' (final)' : ''}`);
      onZwischen?.(text);
      clearTimeout(timer.stille);
      timer.stille = setTimeout(() => stoppe('Stille'), stilleMs);
    };
    r.onerror = (e) => {
      log('fehler ' + e.error);
      if (e.error === 'aborted' && gestoppt) return;
      if (e.error === 'no-speech' && text) return;
      fehler = sttFehlertext(e.error);
      stoppe('Fehler');
    };
    r.onend = ende;
    timer.start = setTimeout(() => { if (!gestartet) { fehler = 'Das Mikrofon ist nicht gestartet. Erlaubnis prüfen und noch einmal tippen.'; stoppe('kein Start'); } }, startMs);
    try { r.start(); log('start angefordert (' + lang + ', ' + (r.continuous ? 'dauer' : 'einzel') + ')'); }
    catch (e) { fehler = 'Mikrofon konnte nicht gestartet werden: ' + e.message; log('start-fehler ' + e.message); ende(); }
  });
}

function sttFehlertext(code) {
  return {
    'not-allowed': 'Kein Zugriff aufs Mikrofon. Erlaube es in den Einstellungen (iPhone: Einstellungen › Safari › Mikrofon) und prüfe, ob Siri & Diktieren eingeschaltet sind.',
    'service-not-allowed': 'Spracherkennung ist nicht erlaubt. Auf dem iPhone muss „Diktierfunktion“ eingeschaltet sein (Einstellungen › Allgemein › Tastatur).',
    'no-speech': 'Nichts gehört. Sprich etwas lauter oder näher am Gerät.',
    'audio-capture': 'Das Mikrofon ist gerade belegt oder nicht verfügbar. Kurz warten und noch einmal tippen.',
    'network': 'Keine Internetverbindung – die Spracherkennung braucht Internet.',
    'language-not-supported': 'Diese Sprache kann die Spracherkennung nicht.',
    'aborted': 'Abgebrochen.'
  }[code] || `Spracherkennung fehlgeschlagen (${code}).`;
}
