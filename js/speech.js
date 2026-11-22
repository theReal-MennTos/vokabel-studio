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
export function hoere(lang, { timeoutMs = 8000 } = {}) {
  const K = sttKlasse();
  if (!K) return Promise.resolve({ ok: false, grund: 'Spracheingabe wird von diesem Browser nicht unterstützt.' });
  return new Promise((resolve) => {
    let fertig = false;
    const r = new K();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.continuous = false;
    const ende = (x) => { if (!fertig) { fertig = true; try { r.stop(); } catch { /* egal */ } resolve(x); } };
    r.onresult = (e) => {
      const res = e.results[0];
      const alts = [...res].map((a) => a.transcript.trim());
      ende({ ok: true, text: alts[0] || '', alternativen: alts });
    };
    r.onerror = (e) => ende({ ok: false, grund: sttFehlertext(e.error) });
    r.onend = () => ende({ ok: false, grund: 'Nichts verstanden. Versuch es noch einmal oder tippe die Antwort.' });
    try { r.start(); } catch (e) { ende({ ok: false, grund: 'Mikrofon konnte nicht gestartet werden: ' + e.message }); }
    setTimeout(() => ende({ ok: false, grund: 'Zeit abgelaufen – nichts gehört.' }), timeoutMs);
  });
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
