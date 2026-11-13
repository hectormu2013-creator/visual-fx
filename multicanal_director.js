// multicanal_director.js - Motor Capital OTB: Compositor 4-en-1 en Servidor (1 solo flujo ligero)
// + Director Automático de Carrera (Pantalla Completa en MTP=0 + Carrera + 1 min Resultados Oficiales -> Regreso a 4 en 1)

const fetch = require('node-fetch');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const {
  recordBytesSent,
  onStreamConnectionOpen,
  onStreamConnectionClose,
  registerExclusiveDeviceStream
} = require('./bandwidth_tracker');
const { getRacingScheduleStatus } = require('./schedule_manager');
const { parseTrackCodeFromSyntheticUrl, getMillicastDiagnostics } = require('./millicast_bridge');

const FILLER_24_7_IDS = new Set(['vsin', 'horse-tv', 'sky-racing-1', 'equidia-hd', 'tjk-tv', 'turf-movil']);

/**
 * Resuelve siempre 4 pistas priorizando estrictamente las que están EN VIVO (onAir = true) ahora mismo.
 */
function resolveFourMulticanalTracks(catalogMap, requestedTrackIds = []) {
  const vetDate = new Date(Date.now() - 4 * 3600 * 1000);
  const vetDay = vetDate.getUTCDay();
  const defaultOrder = (vetDay >= 1 && vetDay <= 3)
    ? ['parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley', 'zia-park', 'mountaineer-park', 'thistledown', 'turf-paradise', 'presque-isle']
    : ['gulfstream-park', 'laurel-park', 'belmont-park', 'aqueduct-racetrack', 'santa-anita-park', 'tampa-bay-downs', 'churchill-downs', 'woodbine', 'del-mar', 'parx-racing'];

  const fixedFourIds = [];

  // 1. Priorizar siempre pistas EN VIVO con flujo de video directo (type !== 'iframe') en el orden oficial del día
  for (const tid of defaultOrder) {
    const ch = catalogMap.get(tid);
    if (ch && ch.onAir && ch.type !== 'iframe' && ch.streamUrl && !fixedFourIds.includes(tid)) {
      fixedFourIds.push(tid);
    }
    if (fixedFourIds.length === 4) return fixedFourIds;
  }

  // 2. Completar con cualquier otra pista individual EN VIVO con video directo (type !== 'iframe') en el catálogo
  for (const [tid, ch] of catalogMap.entries()) {
    if (ch && ch.onAir && ch.type !== 'iframe' && ch.streamUrl && !FILLER_24_7_IDS.has(tid) && !fixedFourIds.includes(tid)) {
      fixedFourIds.push(tid);
    }
    if (fixedFourIds.length === 4) return fixedFourIds;
  }

  // 3. Si aún faltan, aceptar pistas EN VIVO de cualquier tipo (incluyendo iframe)
  for (const tid of [...defaultOrder, ...(requestedTrackIds || [])]) {
    const ch = tid ? catalogMap.get(tid) : null;
    if (ch && ch.onAir && !fixedFourIds.includes(tid)) {
      fixedFourIds.push(tid);
    }
    if (fixedFourIds.length === 4) return fixedFourIds;
  }

  // 4. Solo si hay menos de 4 hipódromos en vivo en total, rellenar con los oficiales del día
  for (const tid of [...defaultOrder, ...(requestedTrackIds || [])]) {
    if (tid && catalogMap.has(tid) && !fixedFourIds.includes(tid)) {
      fixedFourIds.push(tid);
    }
    if (fixedFourIds.length === 4) break;
  }

  return fixedFourIds;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.19041.4780';

// Mapeo de ID de canal Visual-FX a código oficial Equibase (USA/CAN)
const TRACK_ID_TO_EQB_CODE = {
  'parx-racing': 'PRX',
  'finger-lakes': 'FL',
  'horseshoe-indianapolis': 'IND',
  'mahoning-valley': 'MVR',
  'mountaineer-park': 'MNR',
  'thistledown': 'TDN',
  'presque-isle': 'PID',
  'turf-paradise': 'TUP',
  'zia-park': 'ZIA',
  'gulfstream-park': 'GP',
  'laurel-park': 'LRL',
  'santa-anita-park': 'SA',
  'aqueduct-racetrack': 'AQU',
  'belmont-park': 'BEL',
  'saratoga': 'SAR',
  'tampa-bay-downs': 'TAM',
  'woodbine': 'WO',
  'keeneland': 'KEE',
  'churchill-downs': 'CD',
  'del-mar': 'DMR',
  'oaklawn-park': 'OP',
  'fair-grounds': 'FG',
  'delaware-park': 'DEL',
  'monmouth-park': 'MTH',
  'colonial-downs': 'CNL',
  'charles-town': 'CT',
  'penn-national': 'PEN',
  'remington-park': 'RP',
  'delta-downs': 'DED',
  'evangeline-downs': 'EVD',
  'turfway-park': 'TP',
  'hawthorne': 'HAW',
  'los-alamitos': 'LRC',
  'ellis-park': 'ELP',
  'kentucky-downs': 'KD',
  'sam-houston': 'HOU'
};

// Caché de Cartelera Oficial del Día (Post Times) por trackId
// { dateKey, fetchedAt, races: [{ raceNumber, purse, raceType, distance, surface, starters, postTimeEt, postTimestampMs }] }
const raceCardCache = new Map();

// Caché de Resultados Oficiales y Dividendos del Día por trackId
// { dateKey, fetchedAt, completedRaces: Map<raceNumber, { raceNumber, top3: [{pgm, horse, win, place, show}], exotics: [{type, nums, payoff}], detectedAt }> }
const raceSummaryCache = new Map();

// Estado del Director Automático por pista para controlar la ventana de Carrera + 1 minuto de Resultados
// Map<trackId, { raceNumber, startedAtMs, resultsPostedAtMs, holdUntilMs }>
const activeRaceHoldState = new Map();

// Hubs compartidos 1-a-N del Compositor 2x2 de FFmpeg por combinación de 4 pistas
const compositeHubs = new Map();

const RACE_CARD_TTL_MS = 20 * 60 * 1000;      // 20 minutos para horarios de salida
const SUMMARY_TTL_MS = 35 * 1000;             // 35 segundos para detectar llegada oficial y dividendos
const PRE_POST_TAKEOVER_SEC = 45;             // Tomar pantalla completa 45s antes del Post Time (MTP = 0 / Partida)
const DEFAULT_RACE_RUN_DURATION_SEC = 155;    // ~2m35s duración promedio mientras corre la carrera
const POST_RESULTS_HOLD_SEC = 60;             // 1 minuto exacto mostrando resultados/dividendos antes de volver al 4 en 1
const MAX_TOTAL_FULLSCREEN_SEC = 260;         // Tope de seguridad (4m20s máx en pantalla completa por carrera)

function getUsEasternDateParts() {
  // EE.UU. Eastern Time: UTC-4 (EDT) o UTC-5 (EST). En noviembre/invierno EST es UTC-5, Venezuela es UTC-4.
  // Usamos Intl.DateTimeFormat en America/New_York para exactitud total con horario de verano/invierno.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) {
    parts[p.type] = p.value;
  }
  const mm = parts.month;
  const dd = parts.day;
  const yyyy = parts.year;
  const yy = yyyy.slice(-2);
  return {
    mmddyy: `${mm}${dd}${yy}`,
    dateKey: `${yyyy}-${mm}-${dd}`,
    year: parseInt(yyyy, 10),
    month: parseInt(mm, 10),
    day: parseInt(dd, 10),
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10)
  };
}

/**
 * Convierte una hora "1:30 PM ET" del día actual en America/New_York a timestamp UTC en milisegundos.
 */
function parseEtPostTimeToEpochMs(postTimeStr) {
  if (!postTimeStr) return null;
  const m = String(postTimeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const etNow = getUsEasternDateParts();
  const nowMs = Date.now();
  const etCurrentSecOfDay = (etNow.hour * 3600) + (etNow.minute * 60) + etNow.second;
  const targetSecOfDay = (hour * 3600) + (minute * 60);
  const diffSec = targetSecOfDay - etCurrentSecOfDay;
  return nowMs + (diffSec * 1000);
}

/**
 * Descarga y parsea la cartelera oficial del día (RaceCardIndex) desde Equibase CDN (sin autenticación).
 */
async function fetchTrackRaceCard(trackId) {
  const eqbCode = TRACK_ID_TO_EQB_CODE[trackId];
  if (!eqbCode) return [];

  const { mmddyy, dateKey } = getUsEasternDateParts();
  const cached = raceCardCache.get(trackId);
  if (cached && cached.dateKey === dateKey && (Date.now() - cached.fetchedAt) < RACE_CARD_TTL_MS) {
    return cached.races;
  }

  const country = (trackId === 'woodbine') ? 'CAN' : 'USA';
  const url = `https://www.equibase.com/static/entry/RaceCardIndex${eqbCode}${mmddyy}${country}-EQB.html`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: 6500
    });
    if (!res.ok) {
      raceCardCache.set(trackId, { dateKey, fetchedAt: Date.now(), races: [] });
      return [];
    }
    const html = await res.text();
    const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const races = [];

    for (const tr of trMatches) {
      const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!tdMatches || tdMatches.length < 7) continue;

      const cells = tdMatches.map(td =>
        td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
      );
      const raceNum = parseInt(cells[0], 10);
      const postTimeEt = cells[6] || '';
      if (!raceNum || Number.isNaN(raceNum) || !/\d{1,2}:\d{2}\s*(AM|PM)/i.test(postTimeEt)) {
        continue;
      }

      const postTimestampMs = parseEtPostTimeToEpochMs(postTimeEt);
      races.push({
        raceNumber: raceNum,
        purse: cells[1] || '',
        raceType: cells[2] || '',
        distance: cells[3] || '',
        surface: cells[4] || '',
        starters: cells[5] || '',
        postTimeEt: postTimeEt.replace(/\s*ET$/i, '').trim(),
        postTimestampMs
      });
    }

    races.sort((a, b) => a.raceNumber - b.raceNumber);
    raceCardCache.set(trackId, { dateKey, fetchedAt: Date.now(), races });
    return races;
  } catch (e) {
    return cached ? cached.races : [];
  }
}

/**
 * Descarga y parsea los Resultados Oficiales y Dividendos (Win/Place/Show y Exacta/Trifecta) desde Equibase CDN.
 */
async function fetchTrackSummaryResults(trackId) {
  const eqbCode = TRACK_ID_TO_EQB_CODE[trackId];
  if (!eqbCode) return new Map();

  const { mmddyy, dateKey } = getUsEasternDateParts();
  const cached = raceSummaryCache.get(trackId);
  if (cached && cached.dateKey === dateKey && (Date.now() - cached.fetchedAt) < SUMMARY_TTL_MS) {
    return cached.completedRaces;
  }

  const isInitialLoad = !cached || cached.dateKey !== dateKey;
  const prevMap = (!isInitialLoad && cached.completedRaces) ? cached.completedRaces : new Map();
  const country = (trackId === 'woodbine') ? 'CAN' : 'USA';
  const url = `https://www.equibase.com/static/chart/summary/${eqbCode}${mmddyy}${country}-eqb.html`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: 6500
    });
    if (!res.ok) {
      raceSummaryCache.set(trackId, { dateKey, fetchedAt: Date.now(), completedRaces: prevMap });
      return prevMap;
    }

    const html = await res.text();
    const completedRaces = new Map(prevMap);

    // Dividir por bloques de "Race X"
    const sections = html.split(/Race\s+(\d+)/i);
    // sections[0] = intro, luego pares: [raceNumStr, content, raceNumStr, content...]
    for (let i = 1; i < sections.length - 1; i += 2) {
      const raceNum = parseInt(sections[i], 10);
      const block = sections[i + 1] || '';
      if (!raceNum || Number.isNaN(raceNum)) continue;

      const trMatches = block.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      const top3 = [];
      const exotics = [];

      for (const tr of trMatches) {
        const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!tdMatches || tdMatches.length < 3) continue;
        const cells = tdMatches.map(td =>
          td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
        );

        // Detectar fila de caballo (Pgm# Horse Jockey Win Place Show o Pgm# - Horse Win Place Show)
        if (cells.length >= 4 && /^\d+[A-Z]?$/.test(cells[0]) && !cells[0].includes('$')) {
          const pgm = cells[0];
          const horse = cells[1];
          // En la tabla corta son 5 celdas [pgm, horse, win, place, show]; en la tabla con jockey son 6 [pgm, horse, jockey, win, place, show]
          const win = cells.length >= 6 ? cells[3] : cells[2];
          const place = cells.length >= 6 ? cells[4] : cells[3];
          const show = cells.length >= 6 ? cells[5] : (cells[4] || '');
          if (horse && (win || place || show) && top3.length < 3) {
            top3.push({ pgm, horse, win, place, show });
          }
        } else if (cells.length === 3 && /^\$?\d/.test(cells[0]) && /exacta|trifecta|superfecta|double/i.test(cells[0])) {
          if (exotics.length < 3) {
            exotics.push({
              type: cells[0],
              nums: cells[1],
              payoff: cells[2]
            });
          }
        }
      }

      if (top3.length > 0) {
        const existing = completedRaces.get(raceNum);
        completedRaces.set(raceNum, {
          raceNumber: raceNum,
          top3,
          exotics,
          detectedAt: existing ? existing.detectedAt : (isInitialLoad ? 0 : Date.now())
        });
      }
    }

    raceSummaryCache.set(trackId, { dateKey, fetchedAt: Date.now(), completedRaces });
    return completedRaces;
  } catch (e) {
    return prevMap;
  }
}

/**
 * Evalúa el estado en tiempo real de los 4 hipódromos de un Multicanal y decide si debe estar
 * en modo MOSAIC_4 (4 hipódromos fijos) o FULLSCREEN_RACE (1 hipódromo en pantalla completa por Partida + Carrera + 1 min Resultados).
 */
async function evaluateMulticanalDirector(channelsCatalog, requestedTrackIds = []) {
  const catalogMap = new Map();
  for (const ch of channelsCatalog) {
    if (!ch.isMulticanal && ch.id !== 'capital-otb') {
      catalogMap.set(ch.id, ch);
    }
  }

  const fixedFourIds = resolveFourMulticanalTracks(catalogMap, requestedTrackIds);

  const now = Date.now();
  const quads = [];
  let fullscreenCandidate = null;

  for (let i = 0; i < 4; i++) {
    const trackId = fixedFourIds[i];
    const ch = catalogMap.get(trackId);
    if (!ch) continue;

    const [races, completedRaces] = await Promise.all([
      fetchTrackRaceCard(trackId),
      fetchTrackSummaryResults(trackId)
    ]);

    // Encontrar la última carrera oficial completada y la próxima carrera pendiente
    let lastCompleted = null;
    for (const [, resObj] of completedRaces.entries()) {
      if (!lastCompleted || resObj.raceNumber > lastCompleted.raceNumber) {
        lastCompleted = resObj;
      }
    }

    const rtnLiveRaceNum = ch.race ? parseInt(String(ch.race), 10) : null;
    const rtnLiveMtp = (ch.mtp !== undefined && ch.mtp !== '') ? parseInt(String(ch.mtp), 10) : null;

    const nextRace = races.find(r => {
      if (completedRaces.has(r.raceNumber)) return false;
      if (rtnLiveRaceNum && !Number.isNaN(rtnLiveRaceNum) && r.raceNumber < rtnLiveRaceNum) return false;
      if (r.postTimestampMs && (now - r.postTimestampMs) > (DEFAULT_RACE_RUN_DURATION_SEC + POST_RESULTS_HOLD_SEC + 180) * 1000) {
        return false;
      }
      return true;
    }) || null;

    let mtpMinutes = null;
    let secFromPost = null;

    if (nextRace && nextRace.postTimestampMs) {
      secFromPost = Math.round((now - nextRace.postTimestampMs) / 1000);
      mtpMinutes = Math.max(0, Math.ceil((nextRace.postTimestampMs - now) / 60000));
    }
    if (nextRace && rtnLiveRaceNum === nextRace.raceNumber && rtnLiveMtp !== null && !Number.isNaN(rtnLiveMtp)) {
      mtpMinutes = Math.max(0, rtnLiveMtp);
    }

    // Verificar ventana de Director Automático (Partida -> Carrera -> +60s de Resultados Oficiales)
    let trackPhase = 'MOSAIC';
    let holdRemainingSec = 0;
    let activeRaceInfo = null;

    // Caso A: La última carrera acaba de publicar resultados oficiales hace menos de 60 segundos (1 minuto de resultados en pantalla)
    if (lastCompleted && (now - lastCompleted.detectedAt) <= POST_RESULTS_HOLD_SEC * 1000 && ch.onAir) {
      trackPhase = 'RESULTS_HOLD';
      holdRemainingSec = Math.max(1, Math.ceil(((lastCompleted.detectedAt + POST_RESULTS_HOLD_SEC * 1000) - now) / 1000));
      const matchedRaceMeta = races.find(r => r.raceNumber === lastCompleted.raceNumber);
      activeRaceInfo = {
        raceNumber: lastCompleted.raceNumber,
        distance: matchedRaceMeta ? matchedRaceMeta.distance : '',
        surface: matchedRaceMeta ? matchedRaceMeta.surface : '',
        officialResult: lastCompleted
      };
    }
    // Caso B: La próxima carrera está dando la partida (45s antes del Post Time hasta que termina la carrera + 1 min)
    // Se valida que el MTP en vivo de RTN sea <= 1 min para no tomar pantalla completa si la carrera tiene retraso en hipódromo.
    else if (
      nextRace &&
      secFromPost !== null &&
      secFromPost >= -PRE_POST_TAKEOVER_SEC &&
      secFromPost <= (DEFAULT_RACE_RUN_DURATION_SEC + POST_RESULTS_HOLD_SEC) &&
      (mtpMinutes === null || mtpMinutes <= 1) &&
      ch.onAir
    ) {
      if (secFromPost <= DEFAULT_RACE_RUN_DURATION_SEC) {
        trackPhase = secFromPost < 10 ? 'STARTING' : 'RACING';
        holdRemainingSec = (DEFAULT_RACE_RUN_DURATION_SEC + POST_RESULTS_HOLD_SEC) - secFromPost;
      } else {
        trackPhase = 'RESULTS_HOLD';
        holdRemainingSec = (DEFAULT_RACE_RUN_DURATION_SEC + POST_RESULTS_HOLD_SEC) - secFromPost;
      }
      activeRaceInfo = {
        raceNumber: nextRace.raceNumber,
        distance: nextRace.distance,
        surface: nextRace.surface,
        postTimeEt: nextRace.postTimeEt,
        officialResult: lastCompleted && lastCompleted.raceNumber === nextRace.raceNumber ? lastCompleted : null
      };
    }

    const allRacesDone = races.length > 0 && !nextRace && completedRaces.size >= races.length;
    let statusBadge = 'SEÑAL EN VIVO';
    if (trackPhase === 'STARTING') {
      statusBadge = `🏁 ¡PARTIDA! CARRERA ${nextRace.raceNumber}`;
    } else if (trackPhase === 'RACING') {
      statusBadge = `🏇 EN CARRERA • R${nextRace.raceNumber} (${nextRace.distance})`;
    } else if (trackPhase === 'RESULTS_HOLD') {
      statusBadge = `🏆 RESULTADOS OFICIALES • R${activeRaceInfo.raceNumber} (${holdRemainingSec}s)`;
    } else if (nextRace) {
      statusBadge = `CARRERA ${nextRace.raceNumber} • MTP ${mtpMinutes} MIN (${nextRace.postTimeEt})`;
    } else if (allRacesDone) {
      statusBadge = `JORNADA FINALIZADA (${completedRaces.size} CARRERAS)`;
    }

    const quadData = {
      quadIndex: i + 1,
      id: ch.id,
      name: ch.name,
      flag: ch.flag || '🇺🇸',
      onAir: Boolean(ch.onAir),
      type: ch.type || 'hls',
      streamUrl: ch.streamUrl || ch.iframeUrl,
      proxyUrl: `/api/stream/proxy?url=${encodeURIComponent(ch.streamUrl || ch.iframeUrl)}`,
      trackPhase,
      holdRemainingSec,
      statusBadge,
      nextRace: nextRace
        ? {
            raceNumber: nextRace.raceNumber,
            distance: nextRace.distance,
            surface: nextRace.surface,
            purse: nextRace.purse,
            postTimeEt: nextRace.postTimeEt,
            mtpMinutes
          }
        : null,
      lastResult: lastCompleted
        ? {
            raceNumber: lastCompleted.raceNumber,
            top3: lastCompleted.top3,
            exotics: lastCompleted.exotics
          }
        : null
    };

    quads.push(quadData);

    if ((trackPhase === 'STARTING' || trackPhase === 'RACING' || trackPhase === 'RESULTS_HOLD') && !fullscreenCandidate) {
      fullscreenCandidate = {
        quadIndex: i + 1,
        trackId: ch.id,
        name: ch.name,
        flag: ch.flag || '🇺🇸',
        phase: trackPhase,
        holdRemainingSec,
        proxyUrl: quadData.proxyUrl,
        type: quadData.type,
        streamUrl: quadData.streamUrl,
        raceInfo: activeRaceInfo,
        lastResult: quadData.lastResult
      };
    }
  }

  return {
    mode: fullscreenCandidate ? 'FULLSCREEN_RACE' : 'MOSAIC_4',
    fullscreenTrack: fullscreenCandidate,
    quads,
    updatedAt: new Date().toISOString()
  };
}

// ============================================================================
// Compositor 4-en-1 con Sincronizador de Cuadros por Cuadrante (Frame Synchronizer)
// ----------------------------------------------------------------------------
// Cada cuadrante tiene su propio decodificador independiente (ffmpeg -> rawvideo 640x360 @20fps).
// Node.js entrega al compositor exactamente 20 cuadros/seg por cuadrante desde 4 sockets TCP locales:
//   - Si el hipódromo envía video: se usa el último cuadro recibido.
//   - Si el hipódromo se congela/cae: se repite el último cuadro hasta 5s y luego una pizarra azul.
// Resultado: el mosaico NUNCA se detiene ni se pone en negro porque un solo hipódromo falle;
// solo ese cuadrante se reconecta en segundo plano (con espera progresiva anti-baneo 3s -> 20s).
// ============================================================================
const SLOT_W = 640;
const SLOT_H = 360;
const SLOT_FPS = 20;
const SLOT_FRAME_MS = 1000 / SLOT_FPS;
const SLOT_FRAME_BYTES = (SLOT_W * SLOT_H * 3) / 2;
const SLOT_HOLD_LAST_FRAME_MS = 5000;
const SLOT_STALL_KILL_MS = 9000;
// Colchón por cuadrante: las señales llegan en ráfagas de ~2s; se acumulan 2.5s y se reparten a 20fps exactos
const SLOT_PRIME_FRAMES = Math.round(SLOT_FPS * 2.5);
const SLOT_MAX_QUEUE_FRAMES = Math.round(SLOT_FPS * 4.5);

function buildSlateFrame() {
  const buf = Buffer.alloc(SLOT_FRAME_BYTES);
  const ySize = SLOT_W * SLOT_H;
  buf.fill(22, 0, ySize);
  buf.fill(138, ySize, ySize + ySize / 4);
  buf.fill(122, ySize + ySize / 4);
  return buf;
}
const SLATE_FRAME = buildSlateFrame();

function createSlotFeeder(slotIndex, tid, getSourceUrl) {
  const slot = {
    index: slotIndex,
    tid,
    queue: [],
    primed: false,
    lastShown: null,
    lastShownAt: 0,
    lastFrameAt: 0,
    decoder: null,
    decoderStartedAt: 0,
    currentUrl: null,
    failCount: 0,
    nextRetryAt: 0,
    socket: null,
    server: null,
    port: 0,
    stopped: false
  };

  const killDecoder = () => {
    slot.queue = [];
    slot.primed = false;
    if (slot.decoder) {
      const p = slot.decoder;
      slot.decoder = null;
      try { p.kill('SIGKILL'); } catch (e) {}
    }
  };

  const startDecoder = (url) => {
    if (slot.stopped || slot.decoder) return;
    const args = [
      '-loglevel', 'error',
      '-threads', '1',
      '-fflags', '+nobuffer+discardcorrupt+genpts',
      '-flags', 'low_delay',
      '-probesize', '500000',
      '-analyzeduration', '1500000',
      '-i', url,
      '-an',
      '-vf', `fps=${SLOT_FPS},scale=${SLOT_W}:${SLOT_H}:flags=bicubic,setsar=1,format=yuv420p`,
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      'pipe:1'
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    slot.decoder = proc;
    slot.decoderStartedAt = Date.now();
    slot.currentUrl = url;
    let gotFrames = false;
    let chunks = [];
    let total = 0;

    proc.stdout.on('data', (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total < SLOT_FRAME_BYTES) return;
      const buf = Buffer.concat(chunks, total);
      let off = 0;
      let produced = 0;
      while (buf.length - off >= SLOT_FRAME_BYTES) {
        slot.queue.push(Buffer.from(buf.subarray(off, off + SLOT_FRAME_BYTES)));
        off += SLOT_FRAME_BYTES;
        produced++;
      }
      if (slot.queue.length > SLOT_MAX_QUEUE_FRAMES) {
        slot.queue.splice(0, slot.queue.length - SLOT_MAX_QUEUE_FRAMES);
      }
      if (produced > 0) {
        slot.lastFrameAt = Date.now();
        if (!gotFrames) {
          gotFrames = true;
          slot.failCount = 0;
        }
      }
      const rest = buf.subarray(off);
      chunks = rest.length ? [Buffer.from(rest)] : [];
      total = rest.length;
    });

    const onEnd = () => {
      if (slot.decoder === proc) slot.decoder = null;
      if (!gotFrames) slot.failCount++;
      const backoff = Math.min(20000, 3000 * Math.pow(2, Math.min(slot.failCount, 3)));
      slot.nextRetryAt = Date.now() + (gotFrames ? 2500 : backoff);
    };
    proc.on('close', onEnd);
    proc.on('error', onEnd);
  };

  // Supervisor del cuadrante (cada 2s): arranca, reinicia por congelamiento o cambio de URL
  slot.supervisor = setInterval(() => {
    if (slot.stopped) return;
    const now = Date.now();
    const url = getSourceUrl();
    if (slot.decoder) {
      if (!url || url !== slot.currentUrl) {
        killDecoder();
        slot.nextRetryAt = now + 1500;
        return;
      }
      const refT = Math.max(slot.lastFrameAt, slot.decoderStartedAt);
      if (now - refT > SLOT_STALL_KILL_MS) {
        console.log(`🔄 [Compositor 4-en-1] Cuadrante ${slot.index + 1} (${slot.tid}) congelado ${now - refT}ms, reconectando solo ese cuadrante...`);
        killDecoder();
        slot.failCount++;
        slot.nextRetryAt = now + 2500;
      }
      return;
    }
    if (url && now >= slot.nextRetryAt) {
      startDecoder(url);
    }
  }, 2000);

  slot.getFrame = () => {
    const now = Date.now();
    if (!slot.primed && slot.queue.length >= SLOT_PRIME_FRAMES) {
      slot.primed = true;
    }
    if (slot.primed) {
      if (slot.queue.length > 0) {
        slot.lastShown = slot.queue.shift();
        slot.lastShownAt = now;
        return slot.lastShown;
      }
      // Se vació el colchón: volver a acumular sin mostrar negro
      slot.primed = false;
    }
    if (slot.lastShown && (now - slot.lastShownAt) < SLOT_HOLD_LAST_FRAME_MS) {
      return slot.lastShown;
    }
    if (slot.queue.length > 0) {
      // Primer arranque: mostrar el primer cuadro disponible mientras se llena el colchón
      return slot.queue[0];
    }
    return SLATE_FRAME;
  };

  slot.listen = () => new Promise((resolve, reject) => {
    slot.server = net.createServer((sock) => {
      if (slot.socket && slot.socket !== sock) {
        try { slot.socket.destroy(); } catch (e) {}
      }
      slot.socket = sock;
      sock.setNoDelay(true);
      sock.on('error', () => {});
      sock.on('close', () => { if (slot.socket === sock) slot.socket = null; });
    });
    slot.server.once('error', reject);
    slot.server.listen(0, '127.0.0.1', () => {
      slot.port = slot.server.address().port;
      resolve(slot.port);
    });
  });

  slot.stop = () => {
    slot.stopped = true;
    clearInterval(slot.supervisor);
    killDecoder();
    if (slot.socket) { try { slot.socket.destroy(); } catch (e) {} slot.socket = null; }
    if (slot.server) { try { slot.server.close(); } catch (e) {} slot.server = null; }
  };

  // Arranque inmediato si ya está en vivo
  const firstUrl = getSourceUrl();
  if (firstUrl) startDecoder(firstUrl);

  return slot;
}

/**
 * Compositor de Servidor 4 en 1 (1280x720 HD -> 1 solo stream fMP4 ligero compartido 1-a-N).
 */
function streamCompositeMulticanalMp4(channelsCatalog, requestedTrackIds, req, res, localPort = 3500) {
  const catalogMap = new Map();
  for (const ch of channelsCatalog) {
    if (!ch.isMulticanal && ch.id !== 'capital-otb') {
      catalogMap.set(ch.id, ch);
    }
  }

  const fixedFourIds = resolveFourMulticanalTracks(catalogMap, requestedTrackIds);
  const hubKey = fixedFourIds.join(',') || 'default';
  let hub = compositeHubs.get(hubKey);

  if (!hub) {
    hub = {
      hubKey,
      clients: new Set(),
      initSegment: null,
      latestFragment: null,
      running: false,
      ffmpegProc: null,
      idleTimer: null,
      cleanup: null,
      slots: null
    };
    compositeHubs.set(hubKey, hub);
  }

  if (hub.idleTimer) {
    clearTimeout(hub.idleTimer);
    hub.idleTimer = null;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Connection', 'keep-alive');

  const deviceId = (req.query && req.query.deviceId) || req.headers['x-device-id'] || 'tv-cotb';
  registerExclusiveDeviceStream(deviceId, res, 'multicanal:composite');
  const clientObj = { res, sentInit: false, deviceId, connCounted: true };
  onStreamConnectionOpen();

  if (hub.initSegment) {
    try {
      res.write(hub.initSegment);
      clientObj.sentInit = true;
      recordBytesSent(hub.initSegment.length, deviceId);
      if (hub.latestFragment) {
        res.write(hub.latestFragment);
        recordBytesSent(hub.latestFragment.length, deviceId);
      }
    } catch (e) {}
  }

  hub.clients.add(clientObj);

  if (!hub.running) {
    hub.running = true;

    (async () => {
      // 1. Crear los 4 alimentadores de cuadrante (persisten aunque el compositor se reinicie)
      if (!hub.slots) {
        hub.slots = fixedFourIds.map((tid, i) => createSlotFeeder(i, tid, () => {
          const ch = catalogMap.get(tid);
          if (!(ch && ch.onAir && ch.type !== 'iframe' && ch.streamUrl)) return null;
          return `http://127.0.0.1:${localPort}/api/stream/proxy?url=${encodeURIComponent(ch.streamUrl)}&deviceId=INTERNAL-COMPOSITOR-${i + 1}`;
        }));
        while (hub.slots.length < 4) {
          hub.slots.push(createSlotFeeder(hub.slots.length, 'slate', () => null));
        }
        try {
          await Promise.all(hub.slots.map(s => s.listen()));
        } catch (e) {
          console.error('[Compositor 4-en-1] Error abriendo sockets locales:', e.message);
          hub.running = false;
          return;
        }

        // 2. Reloj maestro: entrega exactamente 20 cuadros/seg por cuadrante (corrigiendo deriva del temporizador)
        hub.tickStart = Date.now();
        hub.framesSent = 0;
        hub.ticker = setInterval(() => {
          const due = Math.floor((Date.now() - hub.tickStart) / SLOT_FRAME_MS);
          let toSend = due - hub.framesSent;
          if (toSend <= 0) return;
          if (toSend > 3) {
            hub.framesSent = due - 3;
            toSend = 3;
          }
          for (let k = 0; k < toSend; k++) {
            for (const s of hub.slots) {
              if (!s.socket || s.socket.destroyed) continue;
              if (s.socket.writableLength > SLOT_FRAME_BYTES * 6) continue;
              try { s.socket.write(s.getFrame()); } catch (e) {}
            }
            hub.framesSent++;
          }
        }, 20);
      }

      if (!hub.running) return;

      // 3. Compositor xstack 2x2 alimentado por los 4 sockets rawvideo (ritmo constante garantizado)
      const ffArgs = ['-loglevel', 'warning'];
      for (const s of hub.slots) {
        ffArgs.push(
          '-f', 'rawvideo',
          '-pix_fmt', 'yuv420p',
          '-video_size', `${SLOT_W}x${SLOT_H}`,
          '-framerate', String(SLOT_FPS),
          '-thread_queue_size', '64',
          '-i', `tcp://127.0.0.1:${s.port}`
        );
      }
      ffArgs.push(
        '-filter_complex', '[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]',
        '-map', '[v]',
        '-an',
        '-threads', '2',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-profile:v', 'main',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-crf', '24',
        '-maxrate', '800k',
        '-bufsize', '1600k',
        '-g', '20',
        '-keyint_min', '20',
        '-sc_threshold', '0',
        '-flush_packets', '1',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      );

      const ffProc = spawn(ffmpegPath, ffArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
      hub.ffmpegProc = ffProc;
      hub.startedAt = Date.now();
      hub.lastFragmentAt = Date.now();

      let pendingBuf = Buffer.alloc(0);
      let ftypBox = null;
      let moovBox = null;
      let currentMoof = null;

      const cleanup = (closeClients = false) => {
        hub.running = false;
        hub.initSegment = null;
        hub.latestFragment = null;
        if (hub.healInterval) {
          clearInterval(hub.healInterval);
          hub.healInterval = null;
        }
        if (hub.ffmpegProc) {
          const proc = hub.ffmpegProc;
          hub.ffmpegProc = null;
          try { proc.kill('SIGKILL'); } catch (e) {}
        }
        if (hub.ticker) {
          clearInterval(hub.ticker);
          hub.ticker = null;
        }
        if (hub.slots) {
          for (const s of hub.slots) s.stop();
          hub.slots = null;
        }
        if (closeClients && hub.clients && hub.clients.size > 0) {
          for (const c of Array.from(hub.clients)) {
            try { c.res.end(); } catch (e) {}
          }
          hub.clients.clear();
        }
      };
      hub.cleanup = cleanup;

      // Perro guardián del compositor: solo actúa si el propio codificador se cuelga (>12s sin salida)
      hub.healInterval = setInterval(() => {
        if (!hub.running) return;
        const silence = Date.now() - (hub.lastFragmentAt || hub.startedAt || Date.now());
        if (silence > 12000) {
          console.log(`🔄 [Compositor 4-en-1] Codificador sin salida ${silence}ms en (${hubKey}), reiniciando...`);
          cleanup(true);
        }
      }, 4000);

      ffProc.stdout.on('data', (chunk) => {
        hub.lastFragmentAt = Date.now();
        pendingBuf = Buffer.concat([pendingBuf, chunk]);
        while (pendingBuf.length >= 8) {
          const boxSize = pendingBuf.readUInt32BE(0);
          const boxType = pendingBuf.slice(4, 8).toString('ascii');
          if (boxSize < 8 || boxSize > 8 * 1024 * 1024) {
            pendingBuf = Buffer.alloc(0);
            break;
          }
          if (pendingBuf.length < boxSize) break;

          const box = Buffer.from(pendingBuf.slice(0, boxSize));
          pendingBuf = pendingBuf.slice(boxSize);

          if (boxType === 'ftyp') {
            ftypBox = box;
          } else if (boxType === 'moov') {
            moovBox = box;
            if (ftypBox) {
              hub.initSegment = Buffer.concat([ftypBox, moovBox]);
              for (const c of hub.clients) {
                if (!c.sentInit && !c.res.writableEnded) {
                  try {
                    c.res.write(hub.initSegment);
                    c.sentInit = true;
                    recordBytesSent(hub.initSegment.length, c.deviceId);
                  } catch (e) {}
                }
              }
            }
          } else if (boxType === 'moof') {
            currentMoof = box;
          } else if (boxType === 'mdat' && currentMoof) {
            if (!getRacingScheduleStatus().isRacingAllowed) {
              cleanup(true);
              return;
            }
            const fragment = Buffer.concat([currentMoof, box]);
            currentMoof = null;
            hub.latestFragment = fragment;
            for (const c of hub.clients) {
              if (c.res.writableEnded) continue;
              try {
                if (!c.sentInit && hub.initSegment) {
                  c.res.write(hub.initSegment);
                  c.sentInit = true;
                  recordBytesSent(hub.initSegment.length, c.deviceId);
                }
                if (c.sentInit) {
                  c.res.write(fragment);
                  recordBytesSent(fragment.length, c.deviceId);
                }
              } catch (e) {}
            }
          }
        }
      });

      ffProc.on('close', () => {
        if (hub.ffmpegProc !== ffProc) return;
        cleanup(true);
      });
    })();
  }

  const removeClient = () => {
    if (clientObj.connCounted) {
      clientObj.connCounted = false;
      onStreamConnectionClose();
    }
    hub.clients.delete(clientObj);
    if (hub.clients.size === 0 && !hub.idleTimer) {
      hub.idleTimer = setTimeout(() => {
        if (hub.clients.size === 0 && hub.cleanup) {
          hub.cleanup();
          hub.initSegment = null;
          hub.latestFragment = null;
          compositeHubs.delete(hubKey);
        }
      }, 180000);
    }
  };

  req.on('close', removeClient);
  res.on('close', removeClient);
  res.on('error', removeClient);
}

module.exports = {
  evaluateMulticanalDirector,
  streamCompositeMulticanalMp4
};
