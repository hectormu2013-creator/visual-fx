const fetch = require('node-fetch');
const https = require('https');
const http = require('http');

// Cookie de sesión WordPress de 1st.tv (configurable por variable de entorno FIRST_TV_COOKIE)
const DEFAULT_FIRST_TV_COOKIE = [
  'wordpress_logged_in_b6990e60552c4f503541a16b265584be=Hectormu2013%7C1793652701%7Ckcr9HsgWS3TRpQR5atLacDGBNHos5aDQquVpJu32dMv%7C46165b890b54e811edaefb3217e079b7f7a99ff382d9b8a21ad6cf9754430516',
  'wordpress_sec_b6990e60552c4f503541a16b265584be=Hectormu2013%7C1793652701%7Ckcr9HsgWS3TRpQR5atLacDGBNHos5aDQquVpJu32dMv%7Cd7f6eb9cbef5d0b62d9257fcfb1353dd541ef2b4661de22b0ce95c52180f98cd'
].join('; ');

let currentFirstTvCookie = process.env.FIRST_TV_COOKIE || DEFAULT_FIRST_TV_COOKIE;
let firstTvEnabled = process.env.FIRST_TV_ENABLED !== 'false';
let circuitPausedUntil = 0;

// Caché de tokens (los tokens tkendtime de 1st.tv duran 12 horas; renovamos cada 6 horas)
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
// Caché de estado En Vivo en CDN (35 min si está en vivo, 10 min si está fuera de aire; no toca 1st.tv si ya tiene token)
const LIVE_STATUS_TTL_MS = 35 * 60 * 1000;
const OFFAIR_STATUS_TTL_MS = 10 * 60 * 1000;

const trackStateCache = new Map();
const variantUrlMap = new Map();
let startupSyncCompleted = false;

// Hipódromos Prioritarios (1/ST TV & principales del día en baja latencia H5Live ~2s)
const PRIORITY_TRACKS = [
  { id: 'gulfstream-park', code: 'GP', name: 'Gulfstream Park', flag: '🇺🇸', location: 'Hallandale Beach, Florida, EE.UU.' },
  { id: 'santa-anita-park', code: 'SA', name: 'Santa Anita Park', flag: '🇺🇸', location: 'Arcadia, California, EE.UU.' },
  { id: 'laurel-park', code: 'LRL', name: 'Laurel Park', flag: '🇺🇸', location: 'Laurel, Maryland, EE.UU.' },
  { id: 'keeneland', code: 'KEE', name: 'Keeneland', flag: '🇺🇸', location: 'Lexington, Kentucky, EE.UU.' },
  { id: 'aqueduct-racetrack', code: 'AQU', name: 'Aqueduct Racetrack', flag: '🇺🇸', location: 'Queens, New York, EE.UU.' },
  { id: 'belmont-park', code: 'BEL', name: 'Belmont Park', flag: '🇺🇸', location: 'Elmont, New York, EE.UU.' },
  { id: 'woodbine', code: 'WO', name: 'Woodbine Racetrack', flag: '🇨🇦', location: 'Toronto, Ontario, Canadá' },
  { id: 'tampa-bay-downs', code: 'TAM', name: 'Tampa Bay Downs', flag: '🇺🇸', location: 'Tampa, Florida, EE.UU.' },
  { id: 'parx-racing', code: 'PRX', name: 'Parx Racing', flag: '🇺🇸', location: 'Bensalem, Pennsylvania, EE.UU.' }
];

// Hipódromos Secundarios clasificados por franja horaria (Hora de Venezuela VET = UTC-4)
// DAY: 11:30 am - 5:15 pm | BOTH: 2:00 pm - 8:30 pm | NIGHT: 5:00 pm - 11:59 pm
const SECONDARY_TRACKS = [
  // Tarde / Noche (BOTH)
  { id: 'churchill-downs', code: 'CD', name: 'Churchill Downs', flag: '🇺🇸', location: 'Louisville, Kentucky, EE.UU.', schedule: 'BOTH' },
  { id: 'del-mar', code: 'DMR', name: 'Del Mar', flag: '🇺🇸', location: 'Del Mar, California, EE.UU.', schedule: 'BOTH' },
  { id: 'horseshoe-indianapolis', code: 'IND', name: 'Horseshoe Indianapolis', flag: '🇺🇸', location: 'Shelbyville, Indiana, EE.UU.', schedule: 'BOTH' },
  { id: 'presque-isle', code: 'PID', name: 'Presque Isle Downs', flag: '🇺🇸', location: 'Erie, Pennsylvania, EE.UU.', schedule: 'BOTH' },
  { id: 'hawthorne', code: 'HAW', name: 'Hawthorne Race Course', flag: '🇺🇸', location: 'Stickney/Cicero, Illinois, EE.UU.', schedule: 'BOTH' },
  // Nocturnos (NIGHT: >= 5:00 pm VET)
  { id: 'charles-town', code: 'CT', name: 'Charles Town Races', flag: '🇺🇸', location: 'Charles Town, West Virginia, EE.UU.', schedule: 'NIGHT' },
  { id: 'penn-national', code: 'PEN', name: 'Penn National', flag: '🇺🇸', location: 'Grantville, Pennsylvania, EE.UU.', schedule: 'NIGHT' },
  { id: 'mountaineer-park', code: 'MNR', name: 'Mountaineer Park', flag: '🇺🇸', location: 'New Cumberland, West Virginia, EE.UU.', schedule: 'NIGHT' },
  { id: 'remington-park', code: 'RP', name: 'Remington Park', flag: '🇺🇸', location: 'Oklahoma City, Oklahoma, EE.UU.', schedule: 'NIGHT' },
  { id: 'delta-downs', code: 'DED', name: 'Delta Downs', flag: '🇺🇸', location: 'Vinton, Louisiana, EE.UU.', schedule: 'NIGHT' },
  { id: 'evangeline-downs', code: 'EVD', name: 'Evangeline Downs', flag: '🇺🇸', location: 'Opelousas, Louisiana, EE.UU.', schedule: 'NIGHT' },
  { id: 'turfway-park', code: 'TP', name: 'Turfway Park', flag: '🇺🇸', location: 'Florence, Kentucky, EE.UU.', schedule: 'NIGHT' },
  { id: 'los-alamitos', code: 'LRC', name: 'Los Alamitos', flag: '🇺🇸', location: 'Cypress, California, EE.UU.', schedule: 'NIGHT' },
  // Diurnos (DAY: 11:30 am - 5:15 pm VET)
  { id: 'saratoga', code: 'SAR', name: 'Saratoga Race Course', flag: '🇺🇸', location: 'Saratoga Springs, New York, EE.UU.', schedule: 'DAY' },
  { id: 'delaware-park', code: 'DEL', name: 'Delaware Park', flag: '🇺🇸', location: 'Wilmington, Delaware, EE.UU.', schedule: 'DAY' },
  { id: 'finger-lakes', code: 'FL', name: 'Finger Lakes', flag: '🇺🇸', location: 'Farmington, New York, EE.UU.', schedule: 'DAY' },
  { id: 'thistledown', code: 'TDN', name: 'Thistledown', flag: '🇺🇸', location: 'North Randall, Ohio, EE.UU.', schedule: 'DAY' },
  { id: 'monmouth-park', code: 'MTH', name: 'Monmouth Park', flag: '🇺🇸', location: 'Oceanport, New Jersey, EE.UU.', schedule: 'DAY' },
  { id: 'mahoning-valley', code: 'MVR', name: 'Mahoning Valley', flag: '🇺🇸', location: 'Youngstown, Ohio, EE.UU.', schedule: 'DAY' },
  { id: 'oaklawn-park', code: 'OP', name: 'Oaklawn Park', flag: '🇺🇸', location: 'Hot Springs, Arkansas, EE.UU.', schedule: 'DAY' },
  { id: 'fair-grounds', code: 'FG', name: 'Fair Grounds', flag: '🇺🇸', location: 'New Orleans, Louisiana, EE.UU.', schedule: 'DAY' }
];

/**
 * Ordena los hipódromos secundarios según la hora actual en Venezuela (UTC-4)
 * para priorizar los diurnos entre 11am-5pm y los nocturnos desde las 5pm en adelante.
 */
function getTimePrioritizedSecondaryTracks() {
  const vetHour = (new Date().getUTCHours() - 4 + 24) % 24;
  const isEveningVet = (vetHour >= 17 || vetHour < 2); // 5:00 PM a 1:59 AM VET

  const weight = (track) => {
    if (isEveningVet) {
      if (track.schedule === 'NIGHT') return 1;
      if (track.schedule === 'BOTH') return 2;
      return 3;
    } else {
      if (track.schedule === 'DAY') return 1;
      if (track.schedule === 'BOTH') return 2;
      return 3;
    }
  };

  return [...SECONDARY_TRACKS].sort((a, b) => weight(a) - weight(b));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Obtiene la URL firmada de Roberts Stream desde 1st.tv y extrae el manifiesto H5Live de RCNCDN.
 */
async function resolveFirstTvTrackM3u8(trackCode) {
  const params = new URLSearchParams();
  params.append('action', 'vcl_get_track_video_popup');
  params.append('track', trackCode);
  params.append('user', 'User1234');

  const ajaxRes = await fetch('https://1st.tv/wp-admin/admin-ajax.php', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://1st.tv',
      'Referer': 'https://1st.tv/',
      'Cookie': currentFirstTvCookie
    },
    body: params.toString(),
    timeout: 10000
  });

  if (!ajaxRes.ok) {
    throw new Error(`HTTP ${ajaxRes.status} from 1st.tv AJAX`);
  }

  const ajaxData = await ajaxRes.json();
  if (!ajaxData || !ajaxData.success || !ajaxData.data || !ajaxData.data.url) {
    // Nota: 1st.tv devuelve { logged_out: true } también cuando un código de hipódromo no tiene evento activo ese día.
    // Solo disparar expiración de sesión si el hipódromo base 'GP' devuelve error de sesión.
    if (trackCode === 'GP' && (ajaxData?.data?.error === 'not_logged_in' || ajaxData?.data?.logged_out)) {
      throw new Error('FIRST_TV_SESSION_EXPIRED');
    }
    return null;
  }

  const flashUrl = ajaxData.data.url;
  const liveUrl = flashUrl
    .replace('streamflash.php', 'streamlive.php')
    .replace(/&optp=[^&]+/, '');

  const liveRes = await fetch(liveUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://stream.robertsstream.com/'
    },
    timeout: 10000
  });

  if (!liveRes.ok) {
    return null;
  }

  const html = await liveRes.text();
  if (html.includes('geoblock') || html.includes('Request Rejected')) {
    return null;
  }

  const matches = [...html.matchAll(/sources\[(\d+)\]\s*=\s*\{[\s\S]*?'url'\s*:\s*"([^"]+)"[\s\S]*?'streamname'\s*:\s*'([^']+)'[\s\S]*?'params'\s*:\s*\{\s*'h'\s*:\s*'([^']+)'\s*,\s*'e'\s*:\s*'([^']+)'/g)];
  if (matches.length === 0) {
    return null;
  }

  function pickMatchByOrder(orderList) {
    for (const br of orderList) {
      const found = matches.find(m => m[1] === br || (m[3] && (m[3].includes(`_${br}?`) || m[3].includes(`_${br}&`) || m[3].endsWith(`_${br}`))));
      if (found) return found;
    }
    return matches[matches.length - 1] || matches[0];
  }

  function toM3u8(matchItem) {
    const [, , rtmpUrl, streamname, h, e] = matchItem;
    return `https://ws.rcncdn.com/h5live/http/playlist.m3u8?url=${encodeURIComponent(rtmpUrl)}&stream=${encodeURIComponent(streamname)}&h=${h}&e=${e}`;
  }

  // Por defecto (AUTO / LIGHT / Multicanal) priorizar 400–550 kbps (~50 KB/s) para que en enlaces de ~1 Mbps
  // de Venezuela nunca congele el video ni sature el ancho de banda cuando el usuario tiene YouTube abierto.
  const lightUrl = toM3u8(pickMatchByOrder(['400', '550', '771', '878', '1308', '1200', '1000', '1800', '2200']));
  const mediumUrl = toM3u8(pickMatchByOrder(['771', '878', '550', '400', '1308', '1200', '1000']));
  const fullUrl = toM3u8(pickMatchByOrder(['1308', '1200', '1000', '878', '771', '1800', '2200', '400']));

  variantUrlMap.set(lightUrl, {
    LIGHT: lightUrl,
    MEDIUM: mediumUrl,
    FULL: fullUrl
  });

  return lightUrl;
}

function resolveRcnQualityUrl(baseM3u8Url, qualityMode = 'AUTO', gridCount = 1) {
  const variants = variantUrlMap.get(baseM3u8Url);
  if (!variants) return baseM3u8Url;
  const grid = parseInt(gridCount, 10) || 1;
  // Si hay más de 1 pantalla activa o está en modo AUTO / LIGHT, usar siempre la variante ultraligera (400 kbps)
  if (grid > 1 || qualityMode === 'LIGHT' || qualityMode === 'AUTO' || !qualityMode) {
    return variants.LIGHT || baseM3u8Url;
  }
  if (qualityMode === 'MEDIUM') {
    return variants.MEDIUM || variants.LIGHT || baseM3u8Url;
  }
  if (qualityMode === 'FULL') {
    return variants.FULL || variants.MEDIUM || baseM3u8Url;
  }
  return variants.LIGHT || baseM3u8Url;
}

/**
 * Verifica si el stream fMP4 de RCNCDN está transmitiendo bytes reales en vivo en este instante.
 */
async function probeRcnStreamIsLive(m3u8Url) {
  try {
    const res = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://ws.rcncdn.com/'
      },
      timeout: 6000
    });
    if (!res.ok) return false;
    const text = await res.text();
    const rawLine = text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
    if (!rawLine) return false;
    const mp4Url = rawLine.startsWith('http')
      ? rawLine
      : `https://ws.rcncdn.com/h5live/http/${rawLine.replace(/^\/+/, '')}`;

    return await new Promise((resolve) => {
      const client = mp4Url.startsWith('https') ? https : http;
      const req = client.get(mp4Url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://ws.rcncdn.com/'
        }
      }, (streamRes) => {
        if (streamRes.statusCode !== 200) {
          streamRes.resume();
          return resolve(false);
        }
        let received = 0;
        streamRes.on('data', (chunk) => {
          received += chunk.length;
          if (received >= 4096) {
            req.destroy();
            resolve(true);
          }
        });
        streamRes.on('end', () => resolve(received >= 4096));
        streamRes.on('error', () => resolve(false));
      });
      req.on('error', () => resolve(false));
      setTimeout(() => {
        req.destroy();
        resolve(false);
      }, 3800);
    });
  } catch (err) {
    return false;
  }
}

async function checkSingleTrack(trackDef, activeStreams) {
  const now = Date.now();
  const cached = trackStateCache.get(trackDef.id);

  // Si ya se verificó recientemente, reutilizar estado en caché sin hacer peticiones externas
  if (cached) {
    const statusTtl = cached.onAir ? LIVE_STATUS_TTL_MS : OFFAIR_STATUS_TTL_MS;
    if ((now - cached.lastProbeAt) < statusTtl && (!cached.onAir || now < cached.tokenExpiresAt)) {
      if (cached.onAir && cached.streamData) {
        activeStreams[trackDef.id] = cached.streamData;
      }
      return 'CACHED'; // No hizo falta petición de red
    }
  }

  let m3u8Url = cached && cached.m3u8Url && (now < cached.tokenExpiresAt) ? cached.m3u8Url : null;
  let tokenExpiresAt = cached ? cached.tokenExpiresAt : 0;
  let didFirstTvAjax = false;

  if (!m3u8Url) {
    m3u8Url = await resolveFirstTvTrackM3u8(trackDef.code);
    tokenExpiresAt = now + TOKEN_TTL_MS;
    didFirstTvAjax = true;
  }

  if (!m3u8Url) {
    trackStateCache.set(trackDef.id, {
      m3u8Url: null,
      tokenExpiresAt: 0,
      lastProbeAt: now,
      onAir: false,
      streamData: null
    });
    return didFirstTvAjax ? 'FIRST_TV_AJAX' : 'CDN_PROBE_ONLY';
  }

  const isLive = await probeRcnStreamIsLive(m3u8Url);
  if (isLive) {
    const streamData = {
      id: trackDef.id,
      name: trackDef.name,
      trackName: trackDef.name,
      flag: trackDef.flag,
      location: trackDef.location,
      streamUrl: m3u8Url,
      type: 'hls',
      onAir: true,
      statusText: 'Carreras en Vivo • 1/ST TV HD Oficial',
      nextRace: 'En Directo • 1/ST HD'
    };
    trackStateCache.set(trackDef.id, {
      m3u8Url,
      tokenExpiresAt,
      lastProbeAt: now,
      onAir: true,
      streamData
    });
    activeStreams[trackDef.id] = streamData;
    console.log(`✅ [1/ST TV Bridge] Señal HD EN VIVO activa para '${trackDef.id}' (${trackDef.name})`);
  } else {
    trackStateCache.set(trackDef.id, {
      m3u8Url,
      tokenExpiresAt,
      lastProbeAt: now,
      onAir: false,
      streamData: null
    });
  }

  return didFirstTvAjax ? 'FIRST_TV_AJAX' : 'CDN_PROBE_ONLY';
}

/**
 * Obtiene los hipódromos en vivo desde 1st.tv con caché inteligente por franja horaria (Diurna vs. Nocturna) y pausas humanas.
 * @param {Object} existingPublicStreams - Canales que ya tienen señal pública activa.
 */
async function fetchFirstTvLiveStreams(existingPublicStreams = {}) {
  const activeStreams = {};

  if (!firstTvEnabled || !currentFirstTvCookie) {
    return activeStreams;
  }

  if (Date.now() < circuitPausedUntil) {
    for (const [, val] of trackStateCache.entries()) {
      if (val.onAir && val.streamData && Date.now() < val.tokenExpiresAt) {
        activeStreams[val.streamData.id] = val.streamData;
      }
    }
    return activeStreams;
  }

  try {
    // 1. Verificar siempre los hipódromos prioritarios (GP, SA, LRL, KEE, AQU, BEL, WO, TAM, PRX)
    for (const track of PRIORITY_TRACKS) {
      if (existingPublicStreams[track.id] && existingPublicStreams[track.id].type === 'hls') continue;
      try {
        const callType = await checkSingleTrack(track, activeStreams);
        if (callType === 'FIRST_TV_AJAX') {
          await sleep(1200 + Math.floor(Math.random() * 600));
        }
      } catch (err) {
        if (err.message === 'FIRST_TV_SESSION_EXPIRED') {
          console.warn('⚠️ [1/ST TV Bridge] Cookie de sesión 1st.tv expirada. Pausando consultas por 30 min.');
          circuitPausedUntil = Date.now() + 30 * 60 * 1000;
          return activeStreams;
        }
      }
    }

    // 2. Poblar en activeStreams los secundarios que ya estén en caché como onAir
    const orderedSecondary = getTimePrioritizedSecondaryTracks();
    for (const track of orderedSecondary) {
      if (existingPublicStreams[track.id] && existingPublicStreams[track.id].type === 'hls') continue;
      const cached = trackStateCache.get(track.id);
      if (cached && cached.onAir && cached.streamData && Date.now() < cached.tokenExpiresAt) {
        activeStreams[track.id] = cached.streamData;
      }
    }

    // 3. Escanear secundarios priorizando la franja horaria actual (Diurna vs. Nocturna):
    //    - Si ya tiene token válido de 6h en caché, probar el CDN ws.rcncdn.com cuesta 0 peticiones a 1st.tv.
    //    - Si requiere pedir token nuevo a 1st.tv, limitar a máx. 5 tokens nuevos por ciclo con pausa humana.
    const maxNewTokensPerCycle = 5;
    let newTokensFetched = 0;

    for (const track of orderedSecondary) {
      if (existingPublicStreams[track.id] && existingPublicStreams[track.id].type === 'hls') continue;

      const cached = trackStateCache.get(track.id);
      const hasValidToken = Boolean(cached && cached.m3u8Url && Date.now() < cached.tokenExpiresAt);

      if (!hasValidToken && newTokensFetched >= maxNewTokensPerCycle) {
        continue;
      }

      try {
        const callType = await checkSingleTrack(track, activeStreams);
        if (callType === 'FIRST_TV_AJAX') {
          newTokensFetched++;
          await sleep(1400 + Math.floor(Math.random() * 700));
        }
      } catch (err) {
        if (err.message === 'FIRST_TV_SESSION_EXPIRED') {
          circuitPausedUntil = Date.now() + 30 * 60 * 1000;
          break;
        }
      }
    }

    startupSyncCompleted = true;
  } catch (err) {
    console.error('⚠️ [1/ST TV Bridge] Error general:', err.message);
  }

  return activeStreams;
}

function updateFirstTvCookie(newCookie) {
  if (newCookie && typeof newCookie === 'string') {
    currentFirstTvCookie = newCookie.trim();
    circuitPausedUntil = 0;
    trackStateCache.clear();
    variantUrlMap.clear();
    console.log('🔑 [1/ST TV Bridge] Cookie de sesión actualizada manualmente.');
  }
}

module.exports = {
  fetchFirstTvLiveStreams,
  updateFirstTvCookie,
  resolveRcnQualityUrl
};
