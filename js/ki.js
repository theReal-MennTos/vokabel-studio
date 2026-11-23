// Direkte KI-Anbindung (optional): Foto → Vokabel-JSON, eigene Sätze prüfen.
// Der Schlüssel liegt nur auf diesem Gerät (IndexedDB „meta“) und ist NICHT Teil der Sicherungsdatei.
// Aufrufe gehen direkt vom Browser an den Anbieter (alle drei erlauben das, geprüft 23.11.2026).
import * as db from './db.js';

export const ANBIETER = {
  gemini: {
    name: 'Google Gemini', schluesselUrl: 'https://aistudio.google.com/apikey',
    daten: 'Kostenlos ohne Kreditkarte. Achtung: Im Gratis-Zugang darf Google eingesendete Inhalte zur Verbesserung nutzen.',
    standard: /flash/i
  },
  mistral: {
    name: 'Mistral', schluesselUrl: 'https://console.mistral.ai/api-keys',
    daten: 'Kostenloser „Experiment“-Plan mit Telefonnummer; dafür muss man dem Training mit den Daten zustimmen. Gedacht zum Ausprobieren.',
    standard: /(pixtral|mistral-(small|medium))/i
  },
  groq: {
    name: 'Groq', schluesselUrl: 'https://console.groq.com/keys',
    daten: 'Kostenlos ohne Kreditkarte, begrenzt durch Nutzungslimits. Laut Groq kein Training mit den Daten.',
    standard: /(llama-4|vision|qwen.*vl|scout|maverick)/i
  }
};

export async function einstellungen() {
  return (await db.getMeta('ki')) || { anbieter: 'gemini', schluessel: '', modell: '' };
}
export async function speichere(e) { await db.setMeta('ki', e); }
export async function entferne() { await db.del('meta', 'ki'); }
export async function aktiv() { const e = await einstellungen(); return !!(e.schluessel && e.modell); }

// ---------- Fehler verständlich machen ----------
class KiFehler extends Error {}
async function pruefeAntwort(res, anbieter) {
  if (res.ok) return res.json();
  let detail = '';
  try { const j = await res.json(); detail = j.error?.message || j.detail || j.message || JSON.stringify(j).slice(0, 200); } catch { /* egal */ }
  const n = ANBIETER[anbieter].name;
  const text = {
    400: `${n} hat die Anfrage abgelehnt. ${/key/i.test(detail) ? 'Der Schlüssel ist ungültig.' : 'Vielleicht kann das gewählte Modell keine Fotos lesen – anderes Modell wählen.'}`,
    401: `Der Schlüssel für ${n} ist ungültig oder abgelaufen.`,
    403: `${n} verweigert den Zugriff. Ist der Schlüssel freigeschaltet?`,
    404: `Das gewählte Modell gibt es bei ${n} nicht (mehr). Bitte in den Eltern-Einstellungen ein anderes wählen.`,
    413: 'Das Foto ist zu groß.',
    429: `Das kostenlose Limit bei ${n} ist gerade erreicht. Bitte später noch einmal – oder den Weg über Kopieren nutzen.`
  }[res.status] || `${n} meldet einen Fehler (${res.status}). Bitte später noch einmal versuchen.`;
  throw new KiFehler(text + (detail ? `\n(Details: ${detail.slice(0, 160)})` : ''));
}
async function hole(url, opts, anbieter) {
  let res;
  try { res = await fetch(url, opts); }
  catch { throw new KiFehler('Keine Verbindung zum KI-Dienst. Ist das Internet an?'); }
  return pruefeAntwort(res, anbieter);
}

// ---------- Modelle ----------
export async function modelle(anbieter, schluessel) {
  if (anbieter === 'gemini') {
    const j = await hole(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': schluessel } }, anbieter);
    return (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini|gemma/i.test(m.name) && !/embedding|tts|image-generation|live|audio/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
      .sort(sortiere);
  }
  const url = anbieter === 'mistral' ? 'https://api.mistral.ai/v1/models' : 'https://api.groq.com/openai/v1/models';
  const j = await hole(url, { headers: { Authorization: `Bearer ${schluessel}` } }, anbieter);
  return (j.data || [])
    .filter((m) => m.active !== false && !/embed|whisper|tts|guard|moderation|ocr|codestral|transcri/i.test(m.id))
    .map((m) => ({ id: m.id, name: m.id, bild: m.capabilities?.vision }))
    .sort(sortiere);
}
// neuere Versionsnummern zuerst
function sortiere(a, b) {
  const v = (x) => parseFloat((/(\d+(\.\d+)?)/.exec(x.id) || [0, 0])[1]);
  return v(b) - v(a) || a.id.localeCompare(b.id);
}
export function vorschlag(anbieter, liste) {
  const re = ANBIETER[anbieter].standard;
  const passend = liste.filter((m) => re.test(m.id) && m.bild !== false && !/lite|preview|exp|thinking/i.test(m.id));
  return (passend[0] || liste.find((m) => re.test(m.id)) || liste[0])?.id || '';
}

// ---------- Bild vorbereiten (verkleinern, JPEG) ----------
export function bildVorbereiten(file, maxSeite = 1800, qualitaet = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const f = Math.min(1, maxSeite / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const daten = c.toDataURL('image/jpeg', qualitaet);
      resolve({ mime: 'image/jpeg', base64: daten.split(',')[1], dataUrl: daten, breite: c.width, hoehe: c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new KiFehler('Das Bild konnte nicht gelesen werden. Bitte ein Foto im JPG- oder PNG-Format wählen.')); };
    img.src = url;
  });
}

// ---------- Anfragen ----------
/** Schickt Text (+ optional Bilder) und liefert die Textantwort. json=true bittet um reines JSON. */
export async function frage(prompt, { bilder = [], json = false, signal } = {}) {
  const e = await einstellungen();
  if (!e.schluessel || !e.modell) throw new KiFehler('Die KI ist noch nicht eingerichtet (Eltern › KI-Anbindung).');
  if (e.anbieter === 'gemini') {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, ...bilder.map((b) => ({ inline_data: { mime_type: b.mime, data: b.base64 } }))] }],
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) }
    };
    const j = await hole(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(e.modell)}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': e.schluessel }, body: JSON.stringify(body), signal }, 'gemini');
    const kand = j.candidates?.[0];
    if (!kand) throw new KiFehler('Gemini hat keine Antwort geliefert' + (j.promptFeedback?.blockReason ? ` (blockiert: ${j.promptFeedback.blockReason})` : '') + '.');
    if (kand.finishReason === 'MAX_TOKENS') throw new KiFehler('Die Antwort war zu lang und wurde abgeschnitten. Bitte weniger Vokabeln pro Foto (z. B. halbe Seite).');
    return (kand.content?.parts || []).map((p) => p.text || '').join('');
  }
  const url = e.anbieter === 'mistral' ? 'https://api.mistral.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
  const inhalt = bilder.length
    ? [{ type: 'text', text: prompt }, ...bilder.map((b) => (e.anbieter === 'mistral'
      ? { type: 'image_url', image_url: b.dataUrl }
      : { type: 'image_url', image_url: { url: b.dataUrl } }))]
    : prompt;
  const body = { model: e.modell, temperature: 0.2, messages: [{ role: 'user', content: inhalt }], ...(json ? { response_format: { type: 'json_object' } } : {}) };
  const j = await hole(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.schluessel}` }, body: JSON.stringify(body), signal }, e.anbieter);
  const wahl = j.choices?.[0];
  if (!wahl) throw new KiFehler('Keine Antwort erhalten.');
  if (wahl.finish_reason === 'length') throw new KiFehler('Die Antwort war zu lang und wurde abgeschnitten. Bitte weniger Vokabeln pro Foto (z. B. halbe Seite).');
  const c = wahl.message?.content;
  return Array.isArray(c) ? c.map((x) => x.text || '').join('') : (c || '');
}

/** Kurzer Verbindungstest mit dem gewählten Modell */
export async function teste() {
  const t = await frage('Antworte nur mit dem Wort: OK');
  return t.trim().slice(0, 40);
}

export { KiFehler };
