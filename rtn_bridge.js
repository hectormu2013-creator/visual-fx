// Módulo de Integración Blindada RTN.tv (Racetrack Television Network) para Agencias Fénix
// Cumple estrictamente las 5 Reglas Universales Anti-Baneo:
// 1. Caché de 6h para sesión PHPSESSID y tokens de Robertsstream + separación de sondeo en CDN.
// 2. Concentración 100% en 1 sola IP de EE.UU. (PROHIBIDO entregar iframes directos de RTN/Roberts a las TVs de Venezuela).
// 3. Cero ráfagas, jitter humano (1.8s a 3.4s), máx. 4 llaves nuevas por ciclo y priorización Lunes-Miércoles (Parx, Finger Lakes, Indiana Grand, Mahoning Valley).
// 4. Cortacircuitos automático (Circuit Breaker de 60 min ante cualquier error de sesión o WAF).
// 5. Higiene de cabeceras de navegador real y limpieza de parámetros &optp= contra F5 BigIP.

const fetch = require('node-fetch');
const { extractRcnVariantsFromLiveUrl, probeRcnStreamIsLive } = require('./first_tv_bridge');
const { saveToCloud, loadFromCloud } = require('./supabase_sync');

let RTN_ENABLED = process.env.RTN_ENABLED === 'true';
let circuitPausedUntil = 0;
let lastRtnError = null;
let cloudRestored = false;

// 1. Caché prolongado de sesión y llaves (6 horas) + Punto de Equilibrio (Quad-View: máx 4 pistas RTN simultáneas)
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const ROBERTS_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const TRACK_LIST_TTL_MS = 20 * 60 * 1000;
const LIVE_STATUS_TTL_MS = 35 * 60 * 1000;
const OFFAIR_STATUS_TTL_MS = 15 * 60 * 1000;
const MAX_NEW_FETCHES_PER_CYCLE = 4;
const MAX_SIMULTANEOUS_RTN_TRACKS = 4;

let cachedCookieHeader = null;
let cachedCookieTimestamp = 0;
let cachedCandidateTracks = null;
let cachedCandidateTracksAt = 0;
let cachedCandidateDateStr = '';

// Caché de URLs firmadas de Robertsstream (válidas por 12h, renovadas cada 6h sin tocar RTN)
const robertsUrlCache = new Map();
// Caché de estado En Vivo verificado en el CDN RCNCDN
const rtnTrackStateCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const FETCH_LIMITS = { timeout: 15000, size: 5 * 1024 * 1024 };

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Mapeo Oficial Exclusivo de Hipódromos Comercializados en los Sistemas de Agencias Fénix
// (Excluye galgos, arneses/trote y pistas internacionales no vendidas)
const RTN_TRACK_MAP = {
  'parx': { id: 'parx-racing', name: 'Parx Racing', flag: '🇺🇸', location: 'Bensalem, Pennsylvania, EE.UU.' },
  'philadelphia': { id: 'parx-racing', name: 'Parx Racing', flag: '🇺🇸', location: 'Bensalem, Pennsylvania, EE.UU.' },
  'finger lakes': { id: 'finger-lakes', name: 'Finger Lakes', flag: '🇺🇸', location: 'Farmington, New York, EE.UU.' },
  'horseshoe indianapolis': { id: 'horseshoe-indianapolis', name: 'Indiana Grand (Horseshoe)', flag: '🇺🇸', location: 'Shelbyville, Indiana, EE.UU.' },
  'indiana grand': { id: 'horseshoe-indianapolis', name: 'Indiana Grand (Horseshoe)', flag: '🇺🇸', location: 'Shelbyville, Indiana, EE.UU.' },
  'indiana': { id: 'horseshoe-indianapolis', name: 'Indiana Grand (Horseshoe)', flag: '🇺🇸', location: 'Shelbyville, Indiana, EE.UU.' },
  'mahoning': { id: 'mahoning-valley', name: 'Mahoning Valley', flag: '🇺🇸', location: 'Youngstown, Ohio, EE.UU.' },
  'thistledown': { id: 'thistledown', name: 'Thistledown', flag: '🇺🇸', location: 'North Randall, Ohio, EE.UU.' },
  'mountaineer': { id: 'mountaineer-park', name: 'Mountaineer Park', flag: '🇺🇸', location: 'New Cumberland, West Virginia, EE.UU.' },
  'presque isle': { id: 'presque-isle', name: 'Presque Isle Downs', flag: '🇺🇸', location: 'Erie, Pennsylvania, EE.UU.' },
  'turf paradise': { id: 'turf-paradise', name: 'Turf Paradise', flag: '🇺🇸', location: 'Phoenix, Arizona, EE.UU.' },
  'gulfstream': { id: 'gulfstream-park', name: 'Gulfstream Park', flag: '🇺🇸', location: 'Hallandale Beach, Florida, EE.UU.' },
  'laurel': { id: 'laurel-park', name: 'Laurel Park', flag: '🇺🇸', location: 'Laurel, Maryland, EE.UU.' },
  'aqueduct': { id: 'aqueduct-racetrack', name: 'Aqueduct Racetrack', flag: '🇺🇸', location: 'Queens, New York, EE.UU.' },
  'belmont': { id: 'belmont-park', name: 'Belmont Park', flag: '🇺🇸', location: 'Elmont, New York, EE.UU.' },
  'saratoga': { id: 'saratoga', name: 'Saratoga', flag: '🇺🇸', location: 'Saratoga Springs, New York, EE.UU.' },
  'tampa bay': { id: 'tampa-bay-downs', name: 'Tampa Bay Downs', flag: '🇺🇸', location: 'Tampa, Florida, EE.UU.' },
  'santa anita': { id: 'santa-anita-park', name: 'Santa Anita Park', flag: '🇺🇸', location: 'Arcadia, California, EE.UU.' },
  'del mar': { id: 'del-mar', name: 'Del Mar', flag: '🇺🇸', location: 'Del Mar, California, EE.UU.' },
  'woodbine': { id: 'woodbine', name: 'Woodbine', flag: '🇨🇦', location: 'Toronto, Ontario, Canadá' },
  'keeneland': { id: 'keeneland', name: 'Keeneland', flag: '🇺🇸', location: 'Lexington, Kentucky, EE.UU.' },
  'churchill': { id: 'churchill-downs', name: 'Churchill Downs', flag: '🇺🇸', location: 'Louisville, Kentucky, EE.UU.' },
  'delaware': { id: 'delaware-park', name: 'Delaware Park', flag: '🇺🇸', location: 'Wilmington, Delaware, EE.UU.' },
  'monmouth': { id: 'monmouth-park', name: 'Monmouth Park', flag: '🇺🇸', location: 'Oceanport, New Jersey, EE.UU.' },
  'charles town': { id: 'charles-town', name: 'Charles Town Races', flag: '🇺🇸', location: 'Charles Town, West Virginia, EE.UU.' },
  'penn national': { id: 'penn-national', name: 'Penn National', flag: '🇺🇸', location: 'Grantville, Pennsylvania, EE.UU.' },
  'remington': { id: 'remington-park', name: 'Remington Park', flag: '🇺🇸', location: 'Oklahoma City, Oklahoma, EE.UU.' },
  'delta downs': { id: 'delta-downs', name: 'Delta Downs', flag: '🇺🇸', location: 'Vinton, Louisiana, EE.UU.' },
  'evangeline': { id: 'evangeline-downs', name: 'Evangeline Downs', flag: '🇺🇸', location: 'Opelousas, Louisiana, EE.UU.' },
  'turfway': { id: 'turfway-park', name: 'Turfway Park', flag: '🇺🇸', location: 'Florence, Kentucky, EE.UU.' },
  'oaklawn': { id: 'oaklawn-park', name: 'Oaklawn Park', flag: '🇺🇸', location: 'Hot Springs, Arkansas, EE.UU.' },
  'fair grounds': { id: 'fair-grounds', name: 'Fair Grounds', flag: '🇺🇸', location: 'New Orleans, Louisiana, EE.UU.' },
  'hawthorne': { id: 'hawthorne', name: 'Hawthorne Race Course', flag: '🇺🇸', location: 'Stickney/Cicero, Illinois, EE.UU.' },
  'colonial': { id: 'colonial-downs', name: 'Colonial Downs', flag: '🇺🇸', location: 'New Kent, Virginia, EE.UU.' },
  'kentucky downs': { id: 'kentucky-downs', name: 'Kentucky Downs', flag: '🇺🇸', location: 'Franklin, Kentucky, EE.UU.' },
  'ellis park': { id: 'ellis-park', name: 'Ellis Park', flag: '🇺🇸', location: 'Henderson, Kentucky, EE.UU.' },
  'los alamitos': { id: 'los-alamitos', name: 'Los Alamitos', flag: '🇺🇸', location: 'Cypress, California, EE.UU.' },
  'zia park': { id: 'zia-park', name: 'Zia Park', flag: '🇺🇸', location: 'Hobbs, New Mexico, EE.UU.' },
  'sam houston': { id: 'sam-houston', name: 'Sam Houston Race Park', flag: '🇺🇸', location: 'Houston, Texas, EE.UU.' },
  'la rinconada': { id: 'la-rinconada', name: 'La Rinconada', flag: '🇻🇪', location: 'Caracas, Venezuela' }
};

function getPriorityRankForTrack(trackId) {
  const vetDate = new Date(Date.now() - 4 * 3600 * 1000);
  const vetDay = vetDate.getUTCDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  const vetHour = vetDate.getUTCHours(); // Hora en Venezuela (UTC-4)

  // De Lunes a Miércoles después de las 4:00 PM (UTC-4), Parx y Mahoning suelen haber cerrado,
  // mientras Indiana Grand (Horseshoe), Finger Lakes y Mountaineer están en plena acción.
  const monWedOrder = (vetHour >= 16)
    ? [
        'horseshoe-indianapolis',
        'finger-lakes',
        'parx-racing',
        'mahoning-valley',
        'mountaineer-park',
        'turf-paradise',
        'presque-isle',
        'thistledown',
        'zia-park',
        'delta-downs'
      ]
    : [
        'parx-racing',
        'finger-lakes',
        'horseshoe-indianapolis',
        'mahoning-valley',
        'thistledown',
        'mountaineer-park',
        'presque-isle',
        'turf-paradise',
        'zia-park',
        'delta-downs'
      ];

  const thuSunOrder = [
    'gulfstream-park',
    'laurel-park',
    'aqueduct-racetrack',
    'belmont-park',
    'saratoga',
    'tampa-bay-downs',
    'santa-anita-park',
    'woodbine',
    'keeneland',
    'churchill-downs',
    'del-mar',
    'oaklawn-park',
    'fair-grounds',
    'parx-racing',
    'finger-lakes',
    'horseshoe-indianapolis',
    'mahoning-valley'
  ];

  const list = (vetDay >= 1 && vetDay <= 3) ? monWedOrder : thuSunOrder;
  const idx = list.indexOf(trackId);
  return idx === -1 ? 99 : idx;
}

/**
 * Calcula un puntaje de urgencia según el MTP (Minutes To Post) reportado por RTN.
 * Si el hipódromo está a punto de largar carrera (0 a 12 min), recibe máxima prioridad
 * para ocupar uno de los 4 cuadrantes activos.
 */
function getMtpScore(info) {
  if (!info) return 0;
  const rawMtp = info.mtp !== undefined ? info.mtp : info.MTP;
  if (rawMtp === undefined || rawMtp === null || rawMtp === '') return 0;
  const mtpNum = parseInt(String(rawMtp).replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(mtpNum)) return 0;
  if (mtpNum <= 5) return -15;   // En el aparato / partiendo ahora mismo
  if (mtpNum <= 12) return -8;   // Próxima a largar
  if (mtpNum >= 25) return 5;    // Faltan más de 25 min para la siguiente carrera
  return 0;
}

function matchOfficialTrack(rawTrackName) {
  const lower = (rawTrackName || '').toLowerCase().trim();
  // Ignorar carreras de trote/arneses (Harness / Mohawk / Yonkers / Meadowlands) si no son purasangre
  if (lower.includes('mohawk') || lower.includes('harness') || lower.includes('yonkers')) {
    return null;
  }
  for (const [key, meta] of Object.entries(RTN_TRACK_MAP)) {
    if (lower.includes(key)) {
      return meta;
    }
  }
  return null;
}

const rtnDiagnostics = [];
function recordRtnDiag(trackCode, step, detail = '') {
  rtnDiagnostics.unshift({
    t: new Date().toISOString().slice(11, 19),
    trackCode,
    step,
    detail: String(detail).slice(0, 220)
  });
  if (rtnDiagnostics.length > 40) rtnDiagnostics.pop();
}

async function restoreRtnCacheFromCloud() {
  if (cloudRestored) return;
  cloudRestored = true;
  try {
    const saved = await loadFromCloud('rtn_bridge_cache');
    if (saved && saved.cookieHeader && saved.cookieTimestamp) {
      const age = Date.now() - saved.cookieTimestamp;
      if (age > 0 && age < SESSION_TTL_MS) {
        cachedCookieHeader = saved.cookieHeader;
        cachedCookieTimestamp = saved.cookieTimestamp;
        console.log('☁️ [RTN Bridge] Sesión PHPSESSID restaurada desde Supabase (ahorro de login en RTN).');
      }
    }
    if (saved && saved.robertsUrls && typeof saved.robertsUrls === 'object') {
      const now = Date.now();
      for (const [trackId, entry] of Object.entries(saved.robertsUrls)) {
        if (entry && entry.expiresAt && entry.expiresAt > now) {
          robertsUrlCache.set(trackId, entry);
        }
      }
    }
    if (saved && saved.candidateTracks && saved.candidateDateStr && saved.candidateTracksAt) {
      if ((Date.now() - saved.candidateTracksAt) < TRACK_LIST_TTL_MS) {
        cachedCandidateTracks = saved.candidateTracks;
        cachedCandidateDateStr = saved.candidateDateStr;
        cachedCandidateTracksAt = saved.candidateTracksAt;
      }
    }
  } catch (e) {}
}

async function persistRtnCacheToCloud() {
  try {
    const robertsUrls = {};
    for (const [k, v] of robertsUrlCache.entries()) {
      robertsUrls[k] = v;
    }
    await saveToCloud('rtn_bridge_cache', {
      cookieHeader: cachedCookieHeader,
      cookieTimestamp: cachedCookieTimestamp,
      robertsUrls,
      candidateTracks: cachedCandidateTracks,
      candidateDateStr: cachedCandidateDateStr,
      candidateTracksAt: cachedCandidateTracksAt,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {}
}

async function ensureRtnSession() {
  await restoreRtnCacheFromCloud();
  const now = Date.now();
  if (cachedCookieHeader && (now - cachedCookieTimestamp) < SESSION_TTL_MS) {
    return cachedCookieHeader;
  }

  const username = process.env.RTN_USER || '';
  const password = process.env.RTN_PASS || '';
  if (!username || !password) {
    throw new Error('MISSING_RTN_CREDENTIALS');
  }

  const bodyParams = new URLSearchParams();
  bodyParams.append('submitted', 'submitted');
  bodyParams.append('login', username);
  bodyParams.append('password', password);

  const loginRes = await fetch('https://online.rtn.tv/index.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_UA,
      'Origin': 'https://online.rtn.tv',
      'Referer': 'https://online.rtn.tv/index.php'
    },
    body: bodyParams.toString(),
    ...FETCH_LIMITS
  });

  if (!loginRes.ok) {
    throw new Error(`RTN_HTTP_${loginRes.status}`);
  }

  const loginHtml = await loginRes.text();
  if (
    loginHtml.includes('Account Has Been Disabled') ||
    loginHtml.includes('Must be a current RTN subscriber') ||
    loginHtml.includes('Invalid login') ||
    loginHtml.includes('incorrect password')
  ) {
    lastRtnError = 'Credenciales rechazadas o cuenta sin suscripción activa';
    throw new Error('RTN_ACCOUNT_REJECTED');
  }

  const rawSetCookies = (loginRes.headers.raw && loginRes.headers.raw()['set-cookie']) || [];
  const cookieHeader = rawSetCookies.map(c => c.split(';')[0]).join('; ');

  if (!cookieHeader || !cookieHeader.includes('PHPSESSID')) {
    lastRtnError = 'No se recibió PHPSESSID en el login de RTN';
    throw new Error('RTN_NO_SESSION_COOKIE');
  }

  cachedCookieHeader = cookieHeader;
  cachedCookieTimestamp = now;
  lastRtnError = null;
  await persistRtnCacheToCloud();
  console.log('🔑 [RTN Bridge] Sesión autenticada en online.rtn.tv (válida en caché por 6h).');
  return cachedCookieHeader;
}

async function fetchRtnLiveStreams(existingPublicStreams = {}) {
  const activeStreams = {};
  RTN_ENABLED = process.env.RTN_ENABLED === 'true';

  if (!RTN_ENABLED) {
    return activeStreams;
  }

  const now = Date.now();
  // Si el Circuit Breaker está activo, devolver únicamente lo que ya esté vivo en caché sin tocar RTN
  if (now < circuitPausedUntil) {
    for (const [, val] of rtnTrackStateCache.entries()) {
      if (val.onAir && val.streamData && now < val.tokenExpiresAt) {
        activeStreams[val.streamData.id] = val.streamData;
      }
    }
    return activeStreams;
  }

  try {
    // 1. Obtener o reutilizar sesión de 6h
    const cookieHeader = await ensureRtnSession();

    // Fecha actual en EE.UU./Venezuela (UTC-4)
    const vetNow = new Date(Date.now() - 4 * 3600 * 1000);
    const isoDateStr = `${vetNow.getUTCFullYear()}-${String(vetNow.getUTCMonth() + 1).padStart(2, '0')}-${String(vetNow.getUTCDate()).padStart(2, '0')}`;

    let candidateTracks = [];

    // Reutilizar cartelera del día por 45 minutos para no consultar index.php en cada ciclo
    if (
      cachedCandidateTracks &&
      cachedCandidateDateStr === isoDateStr &&
      (Date.now() - cachedCandidateTracksAt) < TRACK_LIST_TTL_MS
    ) {
      candidateTracks = cachedCandidateTracks;
    } else {
      // Pausa suave antes de consultar la cartelera del día
      await sleep(1200 + Math.floor(Math.random() * 900));

      const trackListParams = new URLSearchParams();
      trackListParams.append('pageQueue', 'page_selecttrack|page_live');
      trackListParams.append('racedate', isoDateStr);
      trackListParams.append('today', 'true');

      const tracksRes = await fetch('https://online.rtn.tv/index.php', {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': BROWSER_UA,
          'Origin': 'https://online.rtn.tv',
          'Referer': 'https://online.rtn.tv/index.php'
        },
        body: trackListParams.toString(),
        ...FETCH_LIMITS
      });

      const tracksHtml = await tracksRes.text();
      if (tracksHtml.includes('Account Has Been Disabled') || tracksHtml.includes('Must be a current RTN subscriber')) {
        console.error('🛑 [RTN Bridge] Alerta de sesión en RTN. Activando Circuit Breaker por 60 min.');
        circuitPausedUntil = Date.now() + 60 * 60 * 1000;
        cachedCookieHeader = null;
        return activeStreams;
      }

      // 2. Extraer hipódromos del día y filtrarlos estrictamente a los comercializados por Fénix
      const linkInfoMatches = tracksHtml.match(/data-linkInfo=(['"])([\s\S]*?)\1/gi) || [];
      const seenTrackIds = new Set();

      for (const matchStr of linkInfoMatches) {
        try {
          const jsonText = matchStr.replace(/^data-linkInfo=['"]/, '').replace(/['"]$/, '');
          const info = JSON.parse(jsonText);
          if (!info.trackName) continue;
          // Ignorar pistas de galgos (Greyhound = GH)
          if (info.breed && /gh|greyhound|harness/i.test(info.breed) && !/notgh|thoroughbred|tb|qh/i.test(info.breed)) {
            continue;
          }
          const meta = matchOfficialTrack(info.trackName);
          if (!meta || seenTrackIds.has(meta.id)) continue;
          seenTrackIds.add(meta.id);
          candidateTracks.push({ meta, info });
        } catch (e) {}
      }

      // Ordenar por prioridad del día/hora (UTC-4) + urgencia de partida (MTP)
      candidateTracks.sort((a, b) => {
        const scoreA = getPriorityRankForTrack(a.meta.id) + getMtpScore(a.info);
        const scoreB = getPriorityRankForTrack(b.meta.id) + getMtpScore(b.info);
        return scoreA - scoreB;
      });
      cachedCandidateTracks = candidateTracks;
      cachedCandidateTracksAt = Date.now();
      cachedCandidateDateStr = isoDateStr;
      recordRtnDiag('LIST', 'CANDIDATES', candidateTracks.map(c => `${c.meta.id}(R:${c.info.race || c.info.Race || '-'},MTP:${c.info.mtp || c.info.MTP || '-'})`).join(', '));
    }

    let newTokensRequested = 0;

    for (const { meta, info } of candidateTracks) {
      // Punto de equilibrio Quad-View (4 en 1): hasta 4 hipódromos de RTN activos al mismo tiempo
      if (Object.keys(activeStreams).length >= MAX_SIMULTANEOUS_RTN_TRACKS) {
        break;
      }

      const trackId = meta.id;

      // Si el hipódromo ya tiene señal pública HLS gratuita activa, NO tocar RTN para ese hipódromo
      if (existingPublicStreams && existingPublicStreams[trackId] && existingPublicStreams[trackId].onAir) {
        continue;
      }

      const cachedState = rtnTrackStateCache.get(trackId);

      // Si ya verificamos hace poco en el CDN, reutilizar sin hacer peticiones nuevas
      if (cachedState) {
        const ttl = cachedState.onAir ? LIVE_STATUS_TTL_MS : OFFAIR_STATUS_TTL_MS;
        if ((Date.now() - cachedState.lastProbeAt) < ttl && (!cachedState.onAir || Date.now() < cachedState.tokenExpiresAt)) {
          if (cachedState.onAir && cachedState.streamData) {
            cachedState.streamData.mtp = info.mtp || info.MTP || cachedState.streamData.mtp || '';
            cachedState.streamData.race = info.race || info.Race || cachedState.streamData.race || '';
            activeStreams[trackId] = cachedState.streamData;
          }
          continue;
        }
      }

      // Verificar si ya tenemos la URL firmada de Robertsstream en caché (dura 6h)
      let robertsEntry = robertsUrlCache.get(trackId);
      let liveUrl = (robertsEntry && Date.now() < robertsEntry.expiresAt) ? robertsEntry.liveUrl : null;
      let rawIframeUrl = (robertsEntry && Date.now() < robertsEntry.expiresAt) ? robertsEntry.rawIframeUrl : null;
      const trackCode = (info.tc3 || info.tc2 || trackId).toUpperCase();

      if (!liveUrl && !rawIframeUrl) {
        // Respetar límite estricto de llaves nuevas por ciclo para evitar ráfagas (máx 2)
        if (newTokensRequested >= MAX_NEW_FETCHES_PER_CYCLE) {
          if (cachedState && cachedState.onAir && cachedState.streamData && Date.now() < cachedState.tokenExpiresAt) {
            activeStreams[trackId] = cachedState.streamData;
          }
          continue;
        }

        // Jitter humano amplio (3.5s a 6.0s) antes de pedir el reproductor a RTN
        await sleep(3500 + Math.floor(Math.random() * 2500));
        newTokensRequested++;

        const playerParams = new URLSearchParams();
        playerParams.append('pageQueue', 'page_live');
        for (const [k, v] of Object.entries(info)) {
          if (k !== 'pageQueue' && v !== undefined && v !== null) {
            playerParams.append(k, String(v));
          }
        }
        if (!playerParams.has('format')) playerParams.append('format', 'flash');
        if (!playerParams.has('breed')) playerParams.append('breed', 'NotGH');
        if (!playerParams.has('racedate')) playerParams.append('racedate', isoDateStr);

        const playerRes = await fetch('https://online.rtn.tv/index.php', {
          method: 'POST',
          headers: {
            'Cookie': cookieHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': BROWSER_UA,
            'Origin': 'https://online.rtn.tv',
            'Referer': 'https://online.rtn.tv/index.php'
          },
          body: playerParams.toString(),
          ...FETCH_LIMITS
        });

        const playerHtml = await playerRes.text();
        const iframeMatch = playerHtml.match(/iframe\s+src=['"]([^'"]+)['"]/i);
        if (!iframeMatch || !iframeMatch[1]) {
          recordRtnDiag(trackCode, 'NO_IFRAME', `len=${playerHtml.length}`);
          rtnTrackStateCache.set(trackId, {
            onAir: false,
            lastProbeAt: Date.now(),
            tokenExpiresAt: Date.now() + OFFAIR_STATUS_TTL_MS,
            streamData: null
          });
          continue;
        }

        rawIframeUrl = iframeMatch[1].replace(/&amp;/g, '&').trim();
        if (rawIframeUrl.startsWith('//')) rawIframeUrl = `https:${rawIframeUrl}`;
        liveUrl = rawIframeUrl.replace('streamflash.php', 'streamlive.php').replace(/\|/g, '%7C');
        robertsUrlCache.set(trackId, {
          liveUrl,
          rawIframeUrl,
          expiresAt: Date.now() + ROBERTS_TOKEN_TTL_MS
        });
        await persistRtnCacheToCloud();
        recordRtnDiag(trackCode, 'IFRAME_RAW', rawIframeUrl.replace(/(usr|user)=[^&]+/gi, '$1=***'));
      }

      // 3. Extraer manifiesto H5Live (.m3u8 de ws.rcncdn.com) desde la IP de EE.UU. (NUNCA exponer liveUrl ni iframe a Venezuela)
      const candidates = [
        liveUrl || (rawIframeUrl && rawIframeUrl.replace('streamflash.php', 'streamlive.php').replace(/\|/g, '%7C'))
      ];

      let extracted = null;
      for (const candUrl of candidates) {
        if (!candUrl) continue;
        extracted = await extractRcnVariantsFromLiveUrl(trackCode, candUrl, 'https://online.rtn.tv/index.php');
        if (extracted && extracted.lightUrl) {
          break;
        }
      }

      if (!extracted || !extracted.lightUrl) {
        rtnTrackStateCache.set(trackId, {
          onAir: false,
          lastProbeAt: Date.now(),
          tokenExpiresAt: Date.now() + OFFAIR_STATUS_TTL_MS,
          streamData: null
        });
        continue;
      }

      const isStreamingLive = await probeRcnStreamIsLive(extracted.lightUrl);
      if (isStreamingLive) {
        const streamData = {
          id: trackId,
          name: meta.name,
          trackName: meta.name,
          flag: meta.flag,
          location: meta.location,
          streamUrl: extracted.lightUrl,
          type: 'hls', // Reproducido vía /api/stream/proxy desde nuestra única IP de EE.UU.
          onAir: true,
          activeToday: true,
          mtp: info.mtp || info.MTP || '',
          race: info.race || info.Race || '',
          onAirTime: info.onAirTime || '',
          statusText: 'Carreras en Vivo • Señal Oficial HD Directo',
          nextRace: info.race ? `Carrera ${info.race} ${info.mtp ? `(MTP ${info.mtp})` : ''}` : 'En Directo • HD'
        };
        activeStreams[trackId] = streamData;
        rtnTrackStateCache.set(trackId, {
          onAir: true,
          lastProbeAt: Date.now(),
          tokenExpiresAt: Date.now() + ROBERTS_TOKEN_TTL_MS,
          streamData
        });
        recordRtnDiag(trackCode, 'LIVE_OK', meta.name);
        console.log(`✅ [RTN Bridge] '${meta.name}' (${trackId}) EN VIVO vía H5Live Proxy (1 sola IP EE.UU.).`);
      } else {
        recordRtnDiag(trackCode, 'PROBE_OFFAIR', '0 bytes live');
        rtnTrackStateCache.set(trackId, {
          onAir: false,
          lastProbeAt: Date.now(),
          tokenExpiresAt: Date.now() + OFFAIR_STATUS_TTL_MS,
          streamData: null
        });
      }
    }
  } catch (err) {
    recordRtnDiag('SYS', 'ERR', err.message);
    console.error('⚠️ [RTN Bridge] Corte preventivo activado:', err.message);
    if (err.message.includes('RTN_')) {
      circuitPausedUntil = Date.now() + 60 * 60 * 1000;
      cachedCookieHeader = null;
    }
  }

  return activeStreams;
}

function getRtnStatus() {
  return {
    enabled: RTN_ENABLED,
    hasSessionCookie: Boolean(cachedCookieHeader),
    sessionAgeMin: cachedCookieTimestamp ? Math.round((Date.now() - cachedCookieTimestamp) / 60000) : null,
    circuitPausedUntil: circuitPausedUntil > Date.now() ? new Date(circuitPausedUntil).toISOString() : null,
    lastRtnError,
    robertsCachedCount: robertsUrlCache.size,
    liveTracks: Array.from(rtnTrackStateCache.entries()).filter(([, v]) => v.onAir).map(([k]) => k),
    rtnDiagnostics
  };
}

module.exports = {
  fetchRtnLiveStreams,
  getRtnStatus
};
