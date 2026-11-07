const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const { pipeline } = require('stream');
const url = require('url');
const { resolveRcnQualityUrl, refreshRcnUrlIfNeeded } = require('./first_tv_bridge');
const { parseTrackCodeFromSyntheticUrl, streamMillicastSharedMp4 } = require('./millicast_bridge');
const { getRacingScheduleStatus } = require('./schedule_manager');
const {
  recordBytesSent,
  onStreamConnectionOpen,
  onStreamConnectionClose,
  registerExclusiveDeviceStream,
  isBandwidthWithinLimits
} = require('./bandwidth_tracker');

// Límites de seguridad de memoria para Render
const FETCH_TIMEOUT_MS = 10000;                 // no dejar conexiones colgadas acumulando RAM
const MAX_CLIENT_BUFFER_BYTES = 1024 * 1024;    // máx 1 MB de buffer de salida por cliente para evitar OOM en TVs lentas/caídas
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;     // un manifiesto M3U8 real pesa pocos KB
const CACHE_TTL_PLAYLIST = 1000;                // 1 s (igual que antes)
const MAX_CACHE_ENTRIES = 100;

// Caché corto de manifiestos + deduplicación de peticiones simultáneas al mismo origen
const playlistCache = new Map();
const inFlight = new Map();

// Multiplexor 1-a-N para RCNCDN / RTN (Concentra 37 TVs de Venezuela en 1 SOLA conexión de video hacia el proveedor en EE.UU.)
const rcnSharedHubs = new Map();

function extractRcnHubKey(targetUrl, mp4Line) {
  try {
    const decoded = decodeURIComponent(targetUrl || '');
    const m = decoded.match(/stream=([^&]+)/);
    if (m && m[1]) return m[1].split('?')[0];
  } catch (e) {}
  return mp4Line.split('?')[0];
}

function attachClientToSharedRcnHub(hubKey, mp4Line, req, res) {
  const deviceId = (req.query && req.query.deviceId) || req.headers['x-device-id'] || 'tv';
  registerExclusiveDeviceStream(deviceId, res, `rcn:${hubKey}`);
  let hub = rcnSharedHubs.get(hubKey);

  if (!hub || hub.closed) {
    hub = {
      hubKey,
      mp4Line,
      clients: new Set(),
      initBoxes: [],
      curInitChunks: [],
      initSegment: null,
      boxState: 'HEADER',
      headerBuf: Buffer.alloc(0),
      boxType: '',
      boxRemaining: 0,
      upstreamReq: null,
      upstreamRes: null,
      idleTimer: null,
      closed: false
    };
    rcnSharedHubs.set(hubKey, hub);

    const netClient = mp4Line.startsWith('https') ? https : http;
    const upReq = netClient.get(mp4Line, {
      headers: originHeaders(mp4Line),
      timeout: FETCH_TIMEOUT_MS
    }, (upRes) => {
      hub.upstreamRes = upRes;
      if (upRes.statusCode !== 200) {
        upRes.resume();
        upRes.destroy();
        closeHub(hub, upRes.statusCode || 502, `Error proxying RCNCDN live stream: ${upRes.statusCode}`);
        return;
      }

      upRes.setTimeout(20000, () => {
        closeHub(hub);
      });

      upRes.on('data', (chunk) => {
        if (!chunk || !chunk.length || hub.closed) return;
        if (!isBandwidthWithinLimits().allowed) {
          closeHub(hub);
          return;
        }
        processFmp4ChunkForHub(hub, chunk);
      });

      upRes.on('end', () => closeHub(hub));
      upRes.on('error', () => closeHub(hub));
    });

    upReq.on('error', () => closeHub(hub, 502, 'Upstream stream connection error'));
    hub.upstreamReq = upReq;
  }

  if (hub.idleTimer) {
    clearTimeout(hub.idleTimer);
    hub.idleTimer = null;
  }

  const clientObj = {
    res,
    deviceId,
    headersSent: false,
    hasInit: false,
    waitingForMoof: true,
    connCounted: true
  };

  onStreamConnectionOpen();
  hub.clients.add(clientObj);

  // Si el hub ya capturó la cabecera ftyp+moov del MP4, enviarla de inmediato a esta nueva TV
  if (hub.initSegment) {
    sendHeadersAndInitToClient(clientObj, hub.initSegment);
  }

  const detachClient = () => {
    if (hub.clients.has(clientObj)) {
      hub.clients.delete(clientObj);
    }
    if (clientObj.connCounted) {
      clientObj.connCounted = false;
      onStreamConnectionClose();
    }
    if (hub.clients.size === 0 && !hub.closed && !hub.idleTimer) {
      // Cerrar la conexión única hacia el proveedor 4s después de que la última TV cambie de canal
      hub.idleTimer = setTimeout(() => {
        if (hub.clients.size === 0) {
          closeHub(hub);
        }
      }, 4000);
    }
  };

  req.once('close', detachClient);
  res.once('close', detachClient);
}

function sendHeadersAndInitToClient(c, initBuf) {
  if (c.hasInit || c.res.writableEnded || c.res.destroyed) return;
  try {
    if (!c.headersSent && !c.res.headersSent) {
      c.res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store'
      });
      c.headersSent = true;
    }
    c.res.write(initBuf);
    recordBytesSent(initBuf.length, c.deviceId);
    c.hasInit = true;
    c.waitingForMoof = true;
  } catch (e) {}
}

function broadcastDataToActiveClients(hub, buf) {
  if (!buf || !buf.length) return;
  for (const c of hub.clients) {
    if (!c.hasInit || c.waitingForMoof) continue;
    if (c.res.writableEnded || c.res.destroyed) continue;
    if (c.res.writableLength > MAX_CLIENT_BUFFER_BYTES) {
      // TV colgada o con red caída: desconectarla sin afectar a las demás agencias
      try { c.res.destroy(); } catch (e) {}
      continue;
    }
    try {
      c.res.write(buf);
      recordBytesSent(buf.length, c.deviceId);
    } catch (e) {}
  }
}

function processFmp4ChunkForHub(hub, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    if (hub.boxState === 'HEADER') {
      const needed = 8 - hub.headerBuf.length;
      const take = Math.min(needed, chunk.length - offset);
      hub.headerBuf = Buffer.concat([hub.headerBuf, chunk.slice(offset, offset + take)]);
      offset += take;

      if (hub.headerBuf.length === 8) {
        const boxSize = hub.headerBuf.readUInt32BE(0);
        const boxType = hub.headerBuf.toString('ascii', 4, 8);
        hub.boxType = boxType;
        hub.boxRemaining = boxSize >= 8 ? (boxSize - 8) : 0;
        hub.boxState = 'PAYLOAD';

        if (!hub.initSegment && (boxType === 'ftyp' || boxType === 'moov')) {
          hub.curInitChunks = [hub.headerBuf];
        } else {
          // Si empieza un fragmento moof, activar todas las TVs que estaban esperando borde de cuadro limpio
          if (boxType === 'moof' && hub.initSegment) {
            for (const c of hub.clients) {
              if (c.hasInit && c.waitingForMoof) {
                c.waitingForMoof = false;
              }
            }
          }
          broadcastDataToActiveClients(hub, hub.headerBuf);
        }
        hub.headerBuf = Buffer.alloc(0);
      }
    } else {
      const take = Math.min(hub.boxRemaining, chunk.length - offset);
      const part = chunk.slice(offset, offset + take);
      offset += take;
      hub.boxRemaining -= take;

      if (!hub.initSegment && (hub.boxType === 'ftyp' || hub.boxType === 'moov')) {
        hub.curInitChunks.push(part);
        if (hub.boxRemaining === 0) {
          hub.initBoxes.push(Buffer.concat(hub.curInitChunks));
          hub.curInitChunks = [];
          if (hub.boxType === 'moov') {
            hub.initSegment = Buffer.concat(hub.initBoxes);
            for (const c of hub.clients) {
              if (!c.hasInit) {
                sendHeadersAndInitToClient(c, hub.initSegment);
              }
            }
          }
        }
      } else {
        broadcastDataToActiveClients(hub, part);
      }

      if (hub.boxRemaining === 0) {
        hub.boxState = 'HEADER';
      }
    }
  }
}

function closeHub(hub, statusCode = null, errorMsg = null) {
  if (!hub || hub.closed) return;
  hub.closed = true;
  if (hub.idleTimer) {
    clearTimeout(hub.idleTimer);
    hub.idleTimer = null;
  }
  if (rcnSharedHubs.get(hub.hubKey) === hub) {
    rcnSharedHubs.delete(hub.hubKey);
  }
  try { if (hub.upstreamReq) hub.upstreamReq.destroy(); } catch (e) {}
  try { if (hub.upstreamRes) hub.upstreamRes.destroy(); } catch (e) {}

  for (const c of hub.clients) {
    if (c.connCounted) {
      c.connCounted = false;
      onStreamConnectionClose();
    }
    try {
      if (statusCode && !c.res.headersSent) {
        c.res.writeHead(statusCode, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        c.res.end(errorMsg || 'Stream closed');
      } else if (!c.res.writableEnded) {
        c.res.end();
      }
    } catch (e) {}
  }
  hub.clients.clear();
}

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
    // Regla de Horario Oficial: fuera del horario de carreras (salvo Force Open), cortar 100% del flujo de video (0 MB)
    const schedStatus = getRacingScheduleStatus();
    if (!schedStatus.isRacingAllowed) {
      res.writeHead(403, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({
        error: 'OFF_HOURS',
        message: schedStatus.statusReason,
        fallbackService: 'loteria'
      }));
    }

    // Caso especial RTN / Robertsstream Dolby Millicast (1-a-N WebRTC -> fMP4 en servidor EE.UU.)
    const millicastCode = parseTrackCodeFromSyntheticUrl(targetUrl);
    if (millicastCode) {
      if (!isBandwidthWithinLimits().allowed) {
        res.writeHead(429, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        return res.end('BANDWIDTH_LIMIT_REACHED');
      }
      return streamMillicastSharedMp4(millicastCode, req, res);
    }

    // Caso especial 1/ST TV / RCNCDN H5Live: resolver playlist.m3u8 -> stream.mp4 progresivo en vivo
    if (targetUrl.includes('ws.rcncdn.com/h5live/http/playlist.m3u8')) {
      const qMode = req.query && req.query.quality;
      const gCount = req.query && req.query.grid;
      let effectiveRcnUrl = await refreshRcnUrlIfNeeded(targetUrl, qMode, gCount, false);
      let rcnCacheKey = `rcn_mp4|${effectiveRcnUrl}`;
      const now = Date.now();
      const cachedMp4 = playlistCache.get(rcnCacheKey);
      let mp4Line = (cachedMp4 && (now - cachedMp4.timestamp < 30000)) ? cachedMp4.content : null;

      if (!mp4Line) {
        let m3u8Text;
        try {
          m3u8Text = await fetchPlaylistText(effectiveRcnUrl);
        } catch (err) {
          if (err.status === 401 || err.status === 403) {
            effectiveRcnUrl = await refreshRcnUrlIfNeeded(targetUrl, qMode, gCount, true);
            rcnCacheKey = `rcn_mp4|${effectiveRcnUrl}`;
            m3u8Text = await fetchPlaylistText(effectiveRcnUrl);
          } else {
            throw err;
          }
        }
        const rawLine = m3u8Text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
        if (!rawLine) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          return res.end('No live fMP4 stream found in RCNCDN playlist');
        }
        mp4Line = rawLine.startsWith('http')
          ? rawLine
          : `https://ws.rcncdn.com/h5live/http/${rawLine.replace(/^\/+/, '')}`;
        playlistCache.set(rcnCacheKey, { timestamp: now, content: mp4Line });
      }

      // Conectar la TV al Multiplexor Compartido 1-a-N (1 sola conexión hacia el proveedor para todas las agencias)
      const hubKey = extractRcnHubKey(effectiveRcnUrl, mp4Line);
      attachClientToSharedRcnHub(hubKey, mp4Line, req, res);
      return;
    }

    const isM3U8 = targetUrl.includes('.m3u8');
    const host = req.headers.host || 'localhost:3500';
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.protocol || 'http');

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
    const segDeviceId = (req.query && req.query.deviceId) || req.headers['x-device-id'] || 'tv';
    response.body.on('data', (chunk) => {
      if (chunk && chunk.length) recordBytesSent(chunk.length, segDeviceId);
    });
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
