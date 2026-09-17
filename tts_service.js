// tts_service.js - Servicio de Audio TTS Universal para Smart TVs y Navegadores (Visual-FX)
// Genera streams de audio MP3 (audio/mpeg) en español natural para garantizar
// reproducción del 100% en televisores que carecen de Web Speech API nativa (LG webOS, Hisense, cajas Android TV).

const fetch = globalThis.fetch || require('node-fetch');

// Caché en memoria para almacenar buffers de audio generados recientemente y responder en 1-2 ms
const ttsCache = new Map();
const MAX_CACHE_ENTRIES = 500;

/**
 * Divide textos largos en fragmentos menores a 170 caracteres respetando
 * comas, puntos y signos de puntuación para cumplir con la API de audio.
 */
function splitTextIntoChunks(text, maxLen = 170) {
  const clean = (text || '').trim();
  if (clean.length <= maxLen) return [clean];

  const chunks = [];
  const sentences = clean.split(/([.,;:\n]+)/);
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if ((currentChunk + part).length <= maxLen) {
      currentChunk += part;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      if (part.length <= maxLen) {
        currentChunk = part;
      } else {
        // Si una sola frase excede maxLen, dividir por palabras
        const words = part.split(/\s+/);
        let wordChunk = '';
        for (const w of words) {
          if ((wordChunk + ' ' + w).length <= maxLen) {
            wordChunk = wordChunk ? wordChunk + ' ' + w : w;
          } else {
            if (wordChunk.trim()) chunks.push(wordChunk.trim());
            wordChunk = w;
          }
        }
        currentChunk = wordChunk;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [clean.substring(0, maxLen)];
}

/**
 * Descarga el fragmento individual de audio MP3 desde Google TTS.
 */
async function fetchAudioChunk(chunkText) {
  const encoded = encodeURIComponent(chunkText);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=es&client=tw-ob&q=${encoded}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`Google TTS respondió con código ${res.status}: ${res.statusText}`);
  }

  if (typeof res.buffer === 'function') {
    return await res.buffer();
  } else {
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
}

/**
 * Manejador principal de la ruta GET /api/tts?text=...
 */
async function handleTtsRequest(req, res) {
  try {
    const rawText = req.query.text || '';
    const cleanText = rawText.trim();

    if (!cleanText) {
      return res.status(400).json({ error: 'Parámetro "text" requerido.' });
    }

    // Normalización fonética rápida
    let spokenText = cleanText
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .replace(/\bchance\b/gi, 'Chanse')
      .replace(/\bgu[aá]charo\b/gi, 'Guácharo')
      .replace(/la\s+r[ií]ca\s*chona/gi, 'La Rícachona')
      .replace(/\br[ií]ca\s+chona\b/gi, 'Rícachona')
      .replace(/\br[ií]cachona\b/gi, 'Rícachona')
      .replace(/\bt[aá]chira\b/gi, 'Táchira');

    const cacheKey = spokenText.toLowerCase();

    // 1. Verificar si ya está en caché en memoria
    if (ttsCache.has(cacheKey)) {
      const cached = ttsCache.get(cacheKey);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': cached.length,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'X-TTS-Cache': 'HIT'
      });
      return res.end(cached);
    }

    const mergedMp3 = await generateTtsAudio(spokenText);

    if (!mergedMp3 || mergedMp3.length === 0) {
      return res.status(500).json({ error: 'No se pudo generar audio para el texto proporcionado.' });
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': mergedMp3.length,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
      'X-TTS-Cache': 'MISS'
    });
    return res.end(mergedMp3);

  } catch (err) {
    console.error('[TTS Service Error]', err.message);
    return res.status(500).json({ error: 'Error generando audio de voz.', details: err.message });
  }
}

async function generateTtsAudio(text) {
  const cacheKey = (text || '').trim().toLowerCase();
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey);
  }

  const chunks = splitTextIntoChunks(text);
  const audioBuffers = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const buf = await fetchAudioChunk(chunk);
    audioBuffers.push(buf);
  }

  if (audioBuffers.length === 0) {
    throw new Error('No se generaron buffers de audio.');
  }

  const mergedMp3 = Buffer.concat(audioBuffers);

  // Guardar en caché LRU en memoria
  if (ttsCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = ttsCache.keys().next().value;
    ttsCache.delete(firstKey);
  }
  ttsCache.set(cacheKey, mergedMp3);

  return mergedMp3;
}

module.exports = {
  handleTtsRequest,
  generateTtsAudio,
  splitTextIntoChunks
};
