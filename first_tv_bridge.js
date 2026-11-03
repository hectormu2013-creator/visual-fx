const fetch = require('node-fetch');
const https = require('https');
const http = require('http');
const { saveToCloud, loadFromCloud } = require('./supabase_sync');

// Cookie de sesión WordPress de 1st.tv (configurable por variable de entorno FIRST_TV_COOKIE)
const DEFAULT_FIRST_TV_COOKIE = [
  'wordpress_logged_in_b6990e60552c4f503541a16b265584be=Hectormu2013%7C1793816472%7CxgpUVPchNoSGYMleLZrOHHTYrGTgn3jXpzHMuuc5KAy%7C688b385b7b350fcf32c537307c6ae303edb9e78edbb5f530ae718626ef14dc62',
  'wordpress_sec_b6990e60552c4f503541a16b265584be=Hectormu2013%7C1793816472%7CxgpUVPchNoSGYMleLZrOHHTYrGTgn3jXpzHMuuc5KAy%7C6429d0e502743d9f14b2b954b627055419cf69866f6f7ddb40e89ba9a95c5742'
].join('; ');

let currentFirstTvCookie = process.env.FIRST_TV_COOKIE || DEFAULT_FIRST_TV_COOKIE;
let currentAuth0Cookie = process.env.FIRST_TV_AUTH0_COOKIE || '';
let firstTvEnabled = process.env.FIRST_TV_ENABLED !== 'false';
let circuitPausedUntil = 0;
let lastSessionError = null;

// Caché de tokens (los tokens tkendtime de 1st.tv duran 12 horas; renovamos cada 6 horas)
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
// Caché de estado En Vivo en CDN (35 min si está en vivo, 10 min si está fuera de aire; no toca 1st.tv si ya tiene token)
const LIVE_STATUS_TTL_MS = 35 * 60 * 1000;
const OFFAIR_STATUS_TTL_MS = 10 * 60 * 1000;

const trackStateCache = new Map();
const robertsLiveUrlCache = new Map();
const variantUrlMap = new Map();
const recentDiagnostics = [];
let lastRobertsScript = '';
let startupSyncCompleted = false;

function recordDiag(trackCode, step, detail) {
  recentDiagnostics.push({ t: new Date().toISOString().slice(11, 19), trackCode, step, detail });
  if (recentDiagnostics.length > 25) recentDiagnostics.shift();
}

// Catálogo completo de hipódromos soportados por 1/ST TV (H5Live ~2s)
// activeDays: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
const ALL_FIRST_TV_TRACKS = [
  // Principales fin de semana / jueves a domingo
  { id: 'gulfstream-park', code: 'GP', name: 'Gulfstream Park', flag: '🇺🇸', location: 'Hallandale Beach, Florida, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'santa-anita-park', code: 'SA', name: 'Santa Anita Park', flag: '🇺🇸', location: 'Arcadia, California, EE.UU.', schedule: 'BOTH', activeDays: [0, 4, 5, 6] },
  { id: 'laurel-park', code: 'LRL', name: 'Laurel Park', flag: '🇺🇸', location: 'Laurel, Maryland, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'aqueduct-racetrack', code: 'AQU', name: 'Aqueduct Racetrack', flag: '🇺🇸', location: 'Queens, New York, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'belmont-park', code: 'BEL', name: 'Belmont Park', flag: '🇺🇸', location: 'Elmont, New York, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'woodbine', code: 'WO', name: 'Woodbine Racetrack', flag: '🇨🇦', location: 'Toronto, Ontario, Canadá', schedule: 'BOTH', activeDays: [0, 4, 5, 6] },
  { id: 'keeneland', code: 'KEE', name: 'Keeneland', flag: '🇺🇸', location: 'Lexington, Kentucky, EE.UU.', schedule: 'DAY', activeDays: [0, 3, 4, 5, 6] },
  { id: 'churchill-downs', code: 'CD', name: 'Churchill Downs', flag: '🇺🇸', location: 'Louisville, Kentucky, EE.UU.', schedule: 'BOTH', activeDays: [0, 3, 4, 5, 6] },
  { id: 'del-mar', code: 'DMR', name: 'Del Mar', flag: '🇺🇸', location: 'Del Mar, California, EE.UU.', schedule: 'BOTH', activeDays: [0, 4, 5, 6] },
  { id: 'tampa-bay-downs', code: 'TAM', name: 'Tampa Bay Downs', flag: '🇺🇸', location: 'Tampa, Florida, EE.UU.', schedule: 'DAY', activeDays: [0, 3, 5, 6] },
  { id: 'saratoga', code: 'SAR', name: 'Saratoga Race Course', flag: '🇺🇸', location: 'Saratoga Springs, New York, EE.UU.', schedule: 'DAY', activeDays: [0, 3, 4, 5, 6] },

  // Hipódromos activos Lunes, Martes y Miércoles (además de resto de semana)
  { id: 'parx-racing', code: 'PRX', name: 'Parx Racing', flag: '🇺🇸', location: 'Bensalem, Pennsylvania, EE.UU.', schedule: 'DAY', activeDays: [1, 2, 3] },
  { id: 'finger-lakes', code: 'FL', name: 'Finger Lakes', flag: '🇺🇸', location: 'Farmington, New York, EE.UU.', schedule: 'DAY', activeDays: [1, 2, 3] },
  { id: 'horseshoe-indianapolis', code: 'IND', name: 'Indiana Grand (Horseshoe)', flag: '🇺🇸', location: 'Shelbyville, Indiana, EE.UU.', schedule: 'BOTH', activeDays: [1, 2, 3, 4] },
  { id: 'mahoning-valley', code: 'MVR', name: 'Mahoning Valley', flag: '🇺🇸', location: 'Youngstown, Ohio, EE.UU.', schedule: 'DAY', activeDays: [1, 2, 3, 4, 6] },
  { id: 'thistledown', code: 'TDN', name: 'Thistledown', flag: '🇺🇸', location: 'North Randall, Ohio, EE.UU.', schedule: 'DAY', activeDays: [1, 2, 3, 4] },
  { id: 'presque-isle', code: 'PID', name: 'Presque Isle Downs', flag: '🇺🇸', location: 'Erie, Pennsylvania, EE.UU.', schedule: 'BOTH', activeDays: [1, 2, 3, 4] },
  { id: 'turf-paradise', code: 'TUP', name: 'Turf Paradise', flag: '🇺🇸', location: 'Phoenix, Arizona, EE.UU.', schedule: 'BOTH', activeDays: [1, 2, 3, 4, 5, 6] },
  { id: 'zia-park', code: 'ZIA', name: 'Zia Park', flag: '🇺🇸', location: 'Hobbs, New Mexico, EE.UU.', schedule: 'BOTH', activeDays: [0, 1, 2] },
  { id: 'mountaineer-park', code: 'MNR', name: 'Mountaineer Park', flag: '🇺🇸', location: 'New Cumberland, West Virginia, EE.UU.', schedule: 'NIGHT', activeDays: [0, 1, 2, 3] },

  // Otros hipódromos diurnos y nocturnos de la semana
  { id: 'delaware-park', code: 'DEL', name: 'Delaware Park', flag: '🇺🇸', location: 'Wilmington, Delaware, EE.UU.', schedule: 'DAY', activeDays: [3, 4, 5, 6] },
  { id: 'hawthorne', code: 'HAW', name: 'Hawthorne Race Course', flag: '🇺🇸', location: 'Stickney/Cicero, Illinois, EE.UU.', schedule: 'BOTH', activeDays: [0, 4, 5, 6] },
  { id: 'charles-town', code: 'CT', name: 'Charles Town Races', flag: '🇺🇸', location: 'Charles Town, West Virginia, EE.UU.', schedule: 'NIGHT', activeDays: [3, 4, 5, 6] },
  { id: 'penn-national', code: 'PEN', name: 'Penn National', flag: '🇺🇸', location: 'Grantville, Pennsylvania, EE.UU.', schedule: 'NIGHT', activeDays: [3, 4, 5] },
  { id: 'remington-park', code: 'RP', name: 'Remington Park', flag: '🇺🇸', location: 'Oklahoma City, Oklahoma, EE.UU.', schedule: 'NIGHT', activeDays: [3, 4, 5, 6] },
  { id: 'delta-downs', code: 'DED', name: 'Delta Downs', flag: '🇺🇸', location: 'Vinton, Louisiana, EE.UU.', schedule: 'NIGHT', activeDays: [2, 3, 4, 5, 6] },
  { id: 'evangeline-downs', code: 'EVD', name: 'Evangeline Downs', flag: '🇺🇸', location: 'Opelousas, Louisiana, EE.UU.', schedule: 'NIGHT', activeDays: [3, 4, 5, 6] },
  { id: 'turfway-park', code: 'TP', name: 'Turfway Park', flag: '🇺🇸', location: 'Florence, Kentucky, EE.UU.', schedule: 'NIGHT', activeDays: [3, 4, 5, 6] },
  { id: 'los-alamitos', code: 'LRC', name: 'Los Alamitos', flag: '🇺🇸', location: 'Cypress, California, EE.UU.', schedule: 'NIGHT', activeDays: [0, 5, 6] },
  { id: 'monmouth-park', code: 'MTH', name: 'Monmouth Park', flag: '🇺🇸', location: 'Oceanport, New Jersey, EE.UU.', schedule: 'DAY', activeDays: [0, 5, 6] },
  { id: 'oaklawn-park', code: 'OP', name: 'Oaklawn Park', flag: '🇺🇸', location: 'Hot Springs, Arkansas, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'fair-grounds', code: 'FG', name: 'Fair Grounds', flag: '🇺🇸', location: 'New Orleans, Louisiana, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 5, 6] },
  { id: 'colonial-downs', code: 'CNL', name: 'Colonial Downs', flag: '🇺🇸', location: 'New Kent, Virginia, EE.UU.', schedule: 'DAY', activeDays: [4, 5, 6] },
  { id: 'kentucky-downs', code: 'KD', name: 'Kentucky Downs', flag: '🇺🇸', location: 'Franklin, Kentucky, EE.UU.', schedule: 'DAY', activeDays: [0, 4, 6] },
  { id: 'ellis-park', code: 'ELP', name: 'Ellis Park', flag: '🇺🇸', location: 'Henderson, Kentucky, EE.UU.', schedule: 'DAY', activeDays: [0, 1, 5, 6] }
];

/**
 * Separa los hipódromos en Prioritarios del Día (según día de semana y hora en Venezuela UTC-4)
 * y Secundarios ordenados por franja horaria.
 */
function getCategorizedTracksForNow() {
  const vetDate = new Date(Date.now() - 4 * 3600 * 1000);
  const vetDay = vetDate.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  const vetHour = vetDate.getUTCHours();
  // En EE.UU. las carreras nocturnas (Charles Town, Mountaineer, Remington, Penn National) inician a las 7:00 PM EST = 8:00 PM Venezuela (vetHour >= 20)
  const isEveningVet = (vetHour >= 20 || vetHour < 2);

  // Lunes a Miércoles (1, 2, 3): Prioridad absoluta a los 4 hipódromos principales que venden los sistemas de Fénix
  const MON_WED_TOP_4 = ['parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley'];
  const VEN_TOP_FAVS = (vetDay >= 1 && vetDay <= 3)
    ? ['parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley', 'thistledown', 'mountaineer-park', 'presque-isle', 'turf-paradise']
    : ['gulfstream-park', 'laurel-park', 'saratoga', 'belmont-park', 'aqueduct-racetrack', 'tampa-bay-downs', 'santa-anita-park', 'woodbine', 'parx-racing', 'finger-lakes'];

  const timeWeight = (track) => {
    const monWedIdx = (vetDay >= 1 && vetDay <= 3) ? MON_WED_TOP_4.indexOf(track.id) : -1;
    if (monWedIdx !== -1 && !isEveningVet) {
      return monWedIdx * 0.1; // #1 Parx (0.0), #2 Finger Lakes (0.1), #3 Indiana Grand (0.2), #4 Mahoning Valley (0.3)
    }
    const favBonus = VEN_TOP_FAVS.includes(track.id) ? -0.4 : 0;
    if (isEveningVet) {
      if (track.schedule === 'NIGHT') return 1 + favBonus;
      if (track.schedule === 'BOTH') return 2 + favBonus;
      return 3 + favBonus;
    } else {
      if (track.schedule === 'DAY') return 1 + favBonus;
      if (track.schedule === 'BOTH') return 2 + favBonus;
      return 3 + favBonus;
    }
  };

  const todayActive = [];
  const otherTracks = [];

  for (const t of ALL_FIRST_TV_TRACKS) {
    if (t.activeDays && t.activeDays.includes(vetDay)) {
      todayActive.push(t);
    } else {
      otherTracks.push(t);
    }
  }

  todayActive.sort((a, b) => timeWeight(a) - timeWeight(b));
  otherTracks.sort((a, b) => timeWeight(a) - timeWeight(b));

  return {
    priorityTracks: todayActive.slice(0, 12),
    secondaryTracks: [...todayActive.slice(12), ...otherTracks]
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Si se dispone de la cookie SSO de auth.1st.com (currentAuth0Cookie), renueva silenciosamente
 * la sesión de WordPress en 1st.tv sin requerir contraseña ni captcha.
 */
async function refreshFirstTvSessionViaAuth0() {
  if (!currentAuth0Cookie) return false;
  try {
    console.log('🔄 [1/ST TV Bridge] Intentando renovación silenciosa SSO vía auth.1st.com...');
    const r1 = await fetch('https://1st.tv/wp-login.php', {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const wpInitCookies = (r1.headers.raw()['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const authUrl = r1.headers.get('location');
    if (!authUrl || !authUrl.includes('auth.1st.com')) return false;

    const r2 = await fetch(authUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': currentAuth0Cookie
      },
      timeout: 10000
    });
    const newAuth0Set = r2.headers.raw()['set-cookie'] || [];
    if (newAuth0Set.length > 0) {
      const mergedMap = new Map();
      for (const part of currentAuth0Cookie.split(';')) {
        const idx = part.indexOf('=');
        if (idx > 0) mergedMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
      for (const c of newAuth0Set) {
        const kv = c.split(';')[0];
        const idx = kv.indexOf('=');
        if (idx > 0) mergedMap.set(kv.slice(0, idx).trim(), kv.slice(idx + 1).trim());
      }
      currentAuth0Cookie = Array.from(mergedMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const cbUrl = r2.headers.get('location');
    if (!cbUrl || !cbUrl.includes('1st.tv') || !cbUrl.includes('code=')) {
      return false;
    }

    const r3 = await fetch(cbUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': wpInitCookies
      },
      timeout: 10000
    });
    const wpCookies = (r3.headers.raw()['set-cookie'] || [])
      .map(c => c.split(';')[0])
      .filter(kv => kv.startsWith('wordpress_logged_in_') || kv.startsWith('wordpress_sec_'));

    if (wpCookies.length >= 2) {
      currentFirstTvCookie = wpCookies.join('; ');
      lastSessionError = null;
      console.log('✅ [1/ST TV Bridge] Sesión 1st.tv renovada automáticamente vía Auth0 SSO.');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('⚠️ [1/ST TV Bridge] Falló renovación SSO Auth0:', err.message);
    return false;
  }
}

/**
 * Extrae las variantes H5Live (LIGHT, MEDIUM, FULL) desde la URL de Roberts Stream (sin tocar 1st.tv ni RTN).
 */
async function extractRcnVariantsFromLiveUrl(trackCode, liveUrl, customReferer = null) {
  const refererHeader = customReferer || ((liveUrl && /rtn/i.test(liveUrl))
    ? 'https://online.rtn.tv/index.php'
    : 'https://1st.tv/');
  const liveRes = await fetch(liveUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': refererHeader
    },
    timeout: 10000
  });

  if (!liveRes.ok) {
    recordDiag(trackCode, 'ROBERTS_HTTP_ERR', liveRes.status);
    return null;
  }

  const html = await liveRes.text();
  if (html.includes('geoblock') || html.includes('Request Rejected')) {
    recordDiag(trackCode, 'ROBERTS_WAF_GEOBLOCK', html.slice(0, 120));
    return null;
  }

  const matches = [...html.matchAll(/sources\[['"]?(\d+)['"]?\]\s*=\s*\{[\s\S]*?['"]?url['"]?\s*:\s*['"]([^'"]+)['"][\s\S]*?['"]?streamname['"]?\s*:\s*['"]([^'"]+)['"][\s\S]*?['"]?(?:params|security)['"]?\s*:\s*\{\s*['"]?h['"]?\s*:\s*['"]([^'"]+)['"]\s*,\s*['"]?e['"]?\s*:\s*['"]?([^'"}\s,]+)['"]?/g)];
  if (matches.length === 0) {
    // Intentar regex secundario para bloques h5live / rtmp en NanoPlayer
    const altMatches = [...html.matchAll(/['"]?url['"]?\s*:\s*['"](rtmp:\/\/[^'"]+)['"][\s\S]{1,350}?['"]?streamname['"]?\s*:\s*['"]([^'"]+)['"][\s\S]{1,350}?['"]?h['"]?\s*:\s*['"]([^'"]+)['"][\s\S]{1,200}?['"]?e['"]?\s*:\s*['"]?(\d+)['"]?/gi)];
    for (const am of altMatches) {
      const brMatch = am[2].match(/_(\d+)(?:\?|$)/);
      const br = brMatch ? brMatch[1] : '800';
      matches.push([am[0], br, am[1], am[2], am[3], am[4]]);
    }
  }
  if (matches.length === 0) {
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim()).filter(Boolean).join('\n---SCRIPT---\n');
    lastRobertsScript = scripts.slice(0, 16000);
    const bodyText = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const diagSample = (scripts.length > 20 ? scripts : bodyText).slice(0, 700);
    recordDiag(trackCode, 'ROBERTS_NO_SOURCES', `len=${html.length} sample=${diagSample}`);
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

  const lightMatch = pickMatchByOrder(['400', '550', '771', '878', '1308', '1200', '1000', '1800', '2200']);
  const lightUrl = toM3u8(lightMatch);
  const mediumUrl = toM3u8(pickMatchByOrder(['771', '878', '550', '400', '1308', '1200', '1000']));
  const fullUrl = toM3u8(pickMatchByOrder(['1308', '1200', '1000', '878', '771', '1800', '2200', '400']));
  const eUnixSec = parseInt(lightMatch[5], 10) || 0;
  const rcnExpiresAt = eUnixSec > 0 ? (eUnixSec * 1000) : (Date.now() + 20 * 60 * 1000);

  const prefix = extractStreamPrefix(lightUrl);
  const variantObj = {
    LIGHT: lightUrl,
    MEDIUM: mediumUrl,
    FULL: fullUrl,
    rcnExpiresAt,
    trackCode,
    liveUrl,
    prefix
  };

  variantUrlMap.set(lightUrl, variantObj);
  variantUrlMap.set(mediumUrl, variantObj);
  variantUrlMap.set(fullUrl, variantObj);
  if (prefix) variantUrlMap.set(`prefix:${prefix}`, variantObj);

  recordDiag(trackCode, 'ROBERTS_OK', `sources=${matches.length},e=${eUnixSec}`);
  return { lightUrl, variantObj };
}

/**
 * Obtiene la URL firmada de Roberts Stream desde 1st.tv (con caché de 6h) y extrae el manifiesto H5Live de RCNCDN.
 */
async function resolveFirstTvTrackM3u8(trackCode, isRetry = false) {
  const now = Date.now();
  const cachedRoberts = robertsLiveUrlCache.get(trackCode);
  if (cachedRoberts && now < cachedRoberts.expiresAt) {
    const extracted = await extractRcnVariantsFromLiveUrl(trackCode, cachedRoberts.liveUrl);
    if (extracted) {
      return { m3u8Url: extracted.lightUrl, didAjax: false };
    }
  }

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
    recordDiag(trackCode, 'AJAX_HTTP_ERR', ajaxRes.status);
    throw new Error(`HTTP ${ajaxRes.status} from 1st.tv AJAX`);
  }

  const ajaxData = await ajaxRes.json();
  if (!ajaxData || !ajaxData.success || !ajaxData.data || !ajaxData.data.url) {
    recordDiag(trackCode, 'AJAX_NO_URL', JSON.stringify(ajaxData).slice(0, 100));
    console.warn(`[1/ST TV Bridge Diag] ${trackCode} ajaxData sin URL:`, JSON.stringify(ajaxData).slice(0, 200));
    if (ajaxData?.data?.error === 'not_logged_in' || ajaxData?.data?.logged_out) {
      if (!isRetry && currentAuth0Cookie) {
        const refreshed = await refreshFirstTvSessionViaAuth0();
        if (refreshed) {
          return await resolveFirstTvTrackM3u8(trackCode, true);
        }
      }
      lastSessionError = `Sesión 1st.tv expirada (${new Date().toISOString()})`;
      throw new Error('FIRST_TV_SESSION_EXPIRED');
    }
    return { m3u8Url: null, didAjax: true };
  }

  const flashUrl = ajaxData.data.url;
  const liveUrl = flashUrl
    .replace('streamflash.php', 'streamlive.php')
    .replace(/&optp=[^&]+/, '');

  // Guardar liveUrl (válida por 12h en Roberts Stream) durante 6h para no volver a tocar 1st.tv por este hipódromo
  robertsLiveUrlCache.set(trackCode, {
    liveUrl,
    expiresAt: now + TOKEN_TTL_MS
  });

  const extracted = await extractRcnVariantsFromLiveUrl(trackCode, liveUrl);
  return { m3u8Url: extracted ? extracted.lightUrl : null, didAjax: true };
}

function extractStreamPrefix(m3u8Url) {
  try {
    const decoded = decodeURIComponent(m3u8Url || '');
    const m = decoded.match(/stream=([a-zA-Z0-9_]+?)_\d+\?/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function resolveRcnQualityUrl(baseM3u8Url, qualityMode = 'AUTO', gridCount = 1) {
  let variants = variantUrlMap.get(baseM3u8Url);
  if (!variants) {
    const prefix = extractStreamPrefix(baseM3u8Url);
    if (prefix) variants = variantUrlMap.get(`prefix:${prefix}`);
  }
  if (!variants) return baseM3u8Url;
  const grid = parseInt(gridCount, 10) || 1;
  if (grid > 1 || qualityMode === 'LIGHT' || qualityMode === 'AUTO' || !qualityMode) {
    return variants.LIGHT || variants.MEDIUM || variants.FULL || baseM3u8Url;
  }
  if (qualityMode === 'MEDIUM') {
    return variants.MEDIUM || variants.LIGHT || variants.FULL || baseM3u8Url;
  }
  if (qualityMode === 'FULL') {
    return variants.FULL || variants.MEDIUM || variants.LIGHT || baseM3u8Url;
  }
  return variants.LIGHT || variants.MEDIUM || baseM3u8Url;
}

/**
 * Si un token h/e de ws.rcncdn.com expiró mientras una TV está viendo la carrera,
 * refresca el token directamente desde Roberts Stream (liveUrl en caché) sin tocar 1st.tv.
 */
async function refreshRcnUrlIfNeeded(baseM3u8Url, qualityMode = 'AUTO', gridCount = 1, forceRefresh = false) {
  let variants = variantUrlMap.get(baseM3u8Url);
  if (!variants) {
    const prefix = extractStreamPrefix(baseM3u8Url);
    if (prefix) variants = variantUrlMap.get(`prefix:${prefix}`);
  }
  if (variants && variants.liveUrl && (forceRefresh || (variants.rcnExpiresAt && Date.now() >= variants.rcnExpiresAt - 60000))) {
    try {
      await extractRcnVariantsFromLiveUrl(variants.trackCode || 'RCN', variants.liveUrl);
    } catch (e) {}
  }
  return resolveRcnQualityUrl(baseM3u8Url, qualityMode, gridCount);
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
        const vetDayNow = new Date(Date.now() - 4 * 3600 * 1000).getUTCDay();
        cached.streamData.activeToday = Boolean(trackDef.activeDays && trackDef.activeDays.includes(vetDayNow));
        activeStreams[trackDef.id] = cached.streamData;
      }
      return 'CACHED'; // No hizo falta petición de red
    }
  }

  let m3u8Url = null;
  let didFirstTvAjax = false;
  const cachedVariants = cached && cached.m3u8Url ? variantUrlMap.get(cached.m3u8Url) : null;
  const rcnStillValid = Boolean(cachedVariants && cachedVariants.rcnExpiresAt && now < (cachedVariants.rcnExpiresAt - 60000));

  if (cached && cached.m3u8Url && rcnStillValid) {
    m3u8Url = cached.m3u8Url;
  } else {
    const resolved = await resolveFirstTvTrackM3u8(trackDef.code);
    m3u8Url = resolved ? resolved.m3u8Url : null;
    didFirstTvAjax = Boolean(resolved && resolved.didAjax);
  }

  const robertsEntry = robertsLiveUrlCache.get(trackDef.code);
  const tokenExpiresAt = robertsEntry ? robertsEntry.expiresAt : (now + TOKEN_TTL_MS);

  if (!m3u8Url) {
    trackStateCache.set(trackDef.id, {
      m3u8Url: null,
      tokenExpiresAt,
      lastProbeAt: now,
      onAir: false,
      streamData: null
    });
    return didFirstTvAjax ? 'FIRST_TV_AJAX' : 'CDN_PROBE_ONLY';
  }

  const variants = variantUrlMap.get(m3u8Url) || { LIGHT: m3u8Url, MEDIUM: m3u8Url, FULL: m3u8Url };
  const uniqueCandidates = [...new Set([variants.LIGHT, variants.MEDIUM, variants.FULL].filter(Boolean))];
  let verifiedUrl = null;

  for (const candidateUrl of uniqueCandidates) {
    const ok = await probeRcnStreamIsLive(candidateUrl);
    if (ok) {
      verifiedUrl = candidateUrl;
      break;
    }
  }

  if (verifiedUrl) {
    if (verifiedUrl !== variants.LIGHT) {
      variants.LIGHT = verifiedUrl;
      if (verifiedUrl === variants.FULL) {
        variants.MEDIUM = verifiedUrl;
      }
    }
    m3u8Url = verifiedUrl;
    const vetDayNow = new Date(Date.now() - 4 * 3600 * 1000).getUTCDay();
    const streamData = {
      id: trackDef.id,
      name: trackDef.name,
      trackName: trackDef.name,
      flag: trackDef.flag,
      location: trackDef.location,
      streamUrl: m3u8Url,
      type: 'hls',
      onAir: true,
      activeToday: Boolean(trackDef.activeDays && trackDef.activeDays.includes(vetDayNow)),
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
    const brMatch = decodeURIComponent(m3u8Url).match(/_(\d+)\?/);
    recordDiag(trackDef.code, 'LIVE_OK', brMatch ? `${brMatch[1]}k` : 'OK');
    console.log(`✅ [1/ST TV Bridge] Señal HD EN VIVO activa para '${trackDef.id}' (${trackDef.name}) [${brMatch ? brMatch[1] + ' kbps' : 'OK'}]`);
  } else {
    recordDiag(trackDef.code, 'PROBE_OFFAIR', '0 bytes live');
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

  // Sincronizar desde Supabase si existe una llave más reciente guardada en la nube
  try {
    const cloudSession = await loadFromCloud('first_tv_session');
    if (cloudSession && cloudSession.cookie && cloudSession.cookie !== currentFirstTvCookie) {
      currentFirstTvCookie = cloudSession.cookie;
      if (cloudSession.auth0Cookie) currentAuth0Cookie = cloudSession.auth0Cookie;
      circuitPausedUntil = 0;
      lastSessionError = null;
      console.log('☁️ [1/ST TV Bridge] Cookie de sesión 1st.tv sincronizada desde Supabase.');
    }
  } catch (e) {}

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
    const { priorityTracks, secondaryTracks: orderedSecondary } = getCategorizedTracksForNow();

    // 1. Verificar siempre los hipódromos prioritarios según el día de la semana y hora en Venezuela (UTC-4)
    for (const track of priorityTracks) {
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
    for (const track of orderedSecondary) {
      if (existingPublicStreams[track.id] && existingPublicStreams[track.id].type === 'hls') continue;
      const cached = trackStateCache.get(track.id);
      if (cached && cached.onAir && cached.streamData && Date.now() < cached.tokenExpiresAt) {
        activeStreams[track.id] = cached.streamData;
      }
    }

    // 3. Escanear secundarios priorizando la franja horaria actual (Diurna vs. Nocturna):
    //    - Si ya tiene liveUrl válida de 6h en robertsLiveUrlCache, consultar Roberts/RCNCDN cuesta 0 peticiones a 1st.tv.
    //    - Si requiere pedir token nuevo a 1st.tv, limitar a máx. 5 tokens nuevos por ciclo con pausa humana.
    const maxNewTokensPerCycle = 5;
    let newTokensFetched = 0;

    for (const track of orderedSecondary) {
      if (existingPublicStreams[track.id] && existingPublicStreams[track.id].type === 'hls') continue;

      const robertsCached = robertsLiveUrlCache.get(track.code);
      const hasValidRobertsToken = Boolean(robertsCached && Date.now() < robertsCached.expiresAt);

      if (!hasValidRobertsToken && newTokensFetched >= maxNewTokensPerCycle) {
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

function updateFirstTvCookie(newCookie, newAuth0Cookie) {
  if (newCookie && typeof newCookie === 'string') {
    currentFirstTvCookie = newCookie.trim();
  }
  if (newAuth0Cookie && typeof newAuth0Cookie === 'string') {
    currentAuth0Cookie = newAuth0Cookie.trim();
  }
  circuitPausedUntil = 0;
  lastSessionError = null;
  trackStateCache.clear();
  robertsLiveUrlCache.clear();
  variantUrlMap.clear();
  saveToCloud('first_tv_session', {
    cookie: currentFirstTvCookie,
    auth0Cookie: currentAuth0Cookie,
    updatedAt: new Date().toISOString()
  }).catch(() => {});
  console.log('🔑 [1/ST TV Bridge] Cookie de sesión 1st.tv actualizada en caliente y persistida en Supabase.');
}

function getFirstTvStatus() {
  return {
    enabled: firstTvEnabled,
    hasCookie: Boolean(currentFirstTvCookie),
    hasAuth0Cookie: Boolean(currentAuth0Cookie),
    circuitPausedUntil: circuitPausedUntil > Date.now() ? new Date(circuitPausedUntil).toISOString() : null,
    lastSessionError,
    cachedTracksCount: trackStateCache.size,
    robertsCachedCount: robertsLiveUrlCache.size,
    liveTracks: Array.from(trackStateCache.entries()).filter(([, v]) => v.onAir).map(([k]) => k),
    recentDiagnostics,
    lastRobertsScript
  };
}

module.exports = {
  fetchFirstTvLiveStreams,
  updateFirstTvCookie,
  getFirstTvStatus,
  resolveRcnQualityUrl,
  refreshRcnUrlIfNeeded,
  extractRcnVariantsFromLiveUrl,
  probeRcnStreamIsLive
};
