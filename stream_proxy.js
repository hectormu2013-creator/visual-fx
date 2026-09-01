const fetch = require('node-fetch');
const url = require('url');

const streamCache = new Map();
const CACHE_TTL_PLAYLIST = 1000;
const CACHE_TTL_SEGMENT = 30000;

async function handleStreamProxy(req, res, targetUrl) {
  try {
    const parsedTarget = url.parse(targetUrl);
    const isM3U8 = targetUrl.includes('.m3u8');
    const now = Date.now();

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${parsedTarget.protocol}//${parsedTarget.host}/`
      }
    });

    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end(`Error proxying stream: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || (isM3U8 ? 'application/vnd.apple.mpegurl' : 'video/mp2t');

    if (isM3U8) {
      let m3u8Text = await response.text();
      
      // Base URL del stream original para resolver rutas relativas
      const lastSlashIndex = targetUrl.lastIndexOf('/');
      const baseUrlDir = targetUrl.substring(0, lastSlashIndex + 1);

      // Reescribir cada línea de segmento o sub-playlist para que pase por el proxy
      const host = req.headers.host || 'localhost:3500';
      const protocol = req.protocol || 'http';

      const rewrittenM3U8 = m3u8Text.split('\n').map(line => {
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

      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store'
      });
      return res.end(rewrittenM3U8);
    } else {
      // Es un segmento de video TS / M4S / MP4
      const buffer = await response.buffer();
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(buffer);
    }

  } catch (err) {
    console.error('Stream proxy exception:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Proxy Exception', message: err.message }));
  }
}

module.exports = {
  handleStreamProxy
};
