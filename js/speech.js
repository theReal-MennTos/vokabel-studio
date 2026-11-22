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
// iOS-Safari liefert Ergebnisse oft erst beim Stoppen und beendet nicht immer selbst.
// Deshalb: Zwischenergebnisse sammeln, nach Stille selbst stoppen, Ergebnis nach dem Stopp noch annehmen.
// Zeitlimit läuft erst ab dem tatsächlichen Start (nach der Mikrofon-Erlaubnis).
// Rückgabe: Promise mit {ok, text, alternativen, grund}; zusätzlich .stop() für einen Stopp-Knopf.
export function hoere(lang, { maxMs = 10000, stilleMs = 1400, startMs = 15000, onZwischen } = {}) {
  const K = sttKlasse();
  if (!K) {
    const p = Promise.resolve({ ok: false, grund: 'Spracheingabe wird von diesem Browser nicht unterstützt.' });
    p.stop = () => {};
    return p;
  }
  const r = new K();
  let stoppe = () => {};
  const p = new Promise((resolve) => {
    let fertig = false, gestoppt = false, gehoert = false, text = '', alternativen = [], fehler = null;
    const timer = {};
    const clear = () => Object.values(timer).forEach(clearTimeout);
    const ende = () => {
      if (fertig) return;
      fertig = true; clear();
      text = text.trim();
      if (text) resolve({ ok: true, text, alternativen: alternativen.length ? alternativen : [text] });
      else resolve({ ok: false, grund: fehler || (gehoert ? 'Nichts verstanden. Versuch es noch einmal oder tippe die Antwort.' : 'Nichts gehört. Sprich direkt nach dem Tippen, etwas lauter.') });
    };
    stoppe = () => {
      if (gestoppt) return;
      gestoppt = true;
      try { r.stop(); } catch { /* egal */ }
      timer.nachlauf = setTimeout(ende, 1500);   // falls onend ausbleibt
    };
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 3;
    r.onstart = () => {
      clearTimeout(timer.start);
      timer.max = setTimeout(stoppe, maxMs);
    };
    r.onspeechstart = () => { gehoert = true; };
    r.onresult = (e) => {
      gehoert = true;
      text = [...e.results].map((res) => res[0].transcript).join(' ').replace(/\s+/g, ' ');
      const letzte = e.results[e.results.length - 1];
      if (e.results.length === 1) alternativen = [...letzte].map((a) => a.transcript.trim()).filter(Boolean);
      onZwischen?.(text.trim());
      clearTimeout(timer.stille);
      timer.stille = setTimeout(stoppe, stilleMs);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted' && gestoppt) return;
      if (e.error === 'no-speech' && text) return;
      fehler = sttFehlertext(e.error);
      stoppe();
    };
    r.onend = ende;
    timer.start = setTimeout(() => { fehler = 'Das Mikrofon ist nicht gestartet. Erlaubnis prüfen und noch einmal tippen.'; stoppe(); }, startMs);
    try { r.start(); } catch (e) { fehler = 'Mikrofon konnte nicht gestartet werden: ' + e.message; ende(); }
  });
  p.stop = () => stoppe();
  return p;
}

function sttFehlertext(code) {
  return {
    'not-allowed': 'Kein Zugriff aufs Mikrofon. Erlaube es in den Einstellungen (iPhone: Einstellungen › Safari › Mikrofon) und prüfe, ob Siri & Diktieren eingeschaltet sind.',
    'service-not-allowed': 'Spracherkennung ist nicht erlaubt. Auf dem iPhone muss „Diktierfunktion“ eingeschaltet sein (Einstellungen › Allgemein › Tastatur).',
    'no-speech': 'Nichts gehört. Sprich etwas lauter oder näher am Gerät.',
    'audio-capture': 'Kein Mikrofon gefunden.',
    'network': 'Keine Internetverbindung – die Spracherkennung braucht Internet.',
    'language-not-supported': 'Diese Sprache kann die Spracherkennung nicht.',
    'aborted': 'Abgebrochen.'
  }[code] || `Spracherkennung fehlgeschlagen (${code}).`;
}
