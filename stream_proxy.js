const fetch = require('node-fetch');
const url = require('url');

// Límites de seguridad de memoria para Render
const FETCH_TIMEOUT_MS = 10000;                 // no dejar conexiones colgadas acumulando RAM
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;     // un manifiesto M3U8 real pesa pocos KB
const CACHE_TTL_PLAYLIST = 1000;                // 1 s (igual que antes)
const MAX_CACHE_ENTRIES = 100;

// Caché corto de manifiestos + deduplicación de peticiones simultáneas al mismo origen
const playlistCache = new Map();
const inFlight = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of playlistCache.entries()) {
    if (now - v.timestamp > CACHE_TTL_PLAYLIST * 10) playlistCache.delete(k);
  }
}, 30000).unref();

function originHeaders(targetUrl) {
  const parsedTarget = url.parse(targetUrl);
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': `${parsedTarget.protocol}//${parsedTarget.host}/`
  };
}

async function fetchPlaylistText(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: originHeaders(targetUrl),
    timeout: FETCH_TIMEOUT_MS,
    size: MAX_PLAYLIST_BYTES
  });
  if (!response.ok) {
    response.body.resume(); // descartar body: si no, node-fetch retiene socket + buffer (fuga)
    const err = new Error(`Error proxying stream: ${response.statusText}`);
    err.status = response.status;
    throw err;
  }
  return response.text();
}

async function handleStreamProxy(req, res, targetUrl) {
  try {
    const isM3U8 = targetUrl.includes('.m3u8');
    const host = req.headers.host || 'localhost:3500';
    const protocol = req.protocol || 'http';

    if (isM3U8) {
      const cacheKey = `${protocol}://${host}|${targetUrl}`;
      const now = Date.now();
      const cached = playlistCache.get(cacheKey);
      let rewrittenM3U8 = cached && (now - cached.timestamp < CACHE_TTL_PLAYLIST) ? cached.content : null;

      if (!rewrittenM3U8) {
        let pending = inFlight.get(targetUrl);
        if (!pending) {
          pending = fetchPlaylistText(targetUrl).finally(() => inFlight.delete(targetUrl));
          inFlight.set(targetUrl, pending);
        }
        const m3u8Text = await pending;

        // Base URL del stream original para resolver rutas relativas
        const lastSlashIndex = targetUrl.lastIndexOf('/');
        const baseUrlDir = targetUrl.substring(0, lastSlashIndex + 1);

        // Reescribir cada línea de segmento o sub-playlist para que pase por el proxy
        rewrittenM3U8 = m3u8Text.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            // Si es un tag #EXT-X-KEY o similar con URI=, reescribirlo también si es necesario
            if (trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
                const fullKeyUrl = p1.startsWith('http') ? p1 : baseUrlDir + p1;
                return `URI="${protocol}://${host}/api/stream/proxy?url=${encodeURIComponent(fullKeyUrl)}"`;
              });
            }
            return line;
          }

          // Si es una URL de segmento o sub-playlist
          const fullSegmentUrl = trimmed.startsWith('http') ? trimmed : baseUrlDir + trimmed;
          return `${protocol}://${host}/api/stream/proxy?url=${encodeURIComponent(fullSegmentUrl)}`;
        }).join('\n');

        if (playlistCache.size >= MAX_CACHE_ENTRIES) {
          playlistCache.delete(playlistCache.keys().next().value);
        }
        playlistCache.set(cacheKey, { timestamp: now, content: rewrittenM3U8 });
      }

      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store'
      });
      return res.end(rewrittenM3U8);
    }

    // Segmento de video TS / M4S / MP4 / clave:
    // 🚀 CORRECCIÓN DE MEMORIA: antes se hacía response.buffer() (segmento completo en RAM por cada TV).
    // Ahora se transmite en streaming (pipe): la RAM usada por segmento es mínima y constante.
    const response = await fetch(targetUrl, {
      headers: originHeaders(targetUrl),
      timeout: FETCH_TIMEOUT_MS
    });

    if (!response.ok) {
      response.body.resume();
      res.writeHead(response.status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end(`Error proxying stream: ${response.statusText}`);
    }

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Content-Type': response.headers.get('content-type') || 'video/mp2t',
      'Cache-Control': 'public, max-age=3600'
    };
    const len = response.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    res.writeHead(200, headers);

    // Si la TV cierra la conexión (cambio de canal), cortar también la descarga del origen
    res.on('close', () => { if (!res.writableEnded) response.body.destroy(); });
    response.body.on('error', () => { if (!res.writableEnded) res.destroy(); });
    response.body.pipe(res);

  } catch (err) {
    console.error('Stream proxy exception:', err.message);
    if (res.headersSent) return res.destroy();
    res.writeHead(err.status || 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Proxy Exception', message: err.message }));
  }
}

module.exports = {
  handleStreamProxy
};
