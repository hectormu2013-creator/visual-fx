const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'lottery_history.json');
let syncDrawsToCloud = null;
try {
  syncDrawsToCloud = require('./supabase_lottery').syncDrawsToCloud;
} catch (e) {}


// Catálogo de animales estándar de ruletas venezolanas (00 a 36 y extendido 0 a 99)
const BASE_ANIMAL_NAMES = {
  "0": "DELFÍN", "00": "BALLENA", "1": "CARNERO", "2": "TORO", "3": "CIEMPIÉS",
  "4": "ALACRÁN", "5": "LEÓN", "6": "RANA", "7": "PERICO", "8": "RATÓN",
  "9": "ÁGUILA", "10": "TIGRE", "11": "GATO", "12": "CABALLO", "13": "MONO",
  "14": "PALOMA", "15": "ZORRO", "16": "OSO", "17": "PAVO", "18": "BURRO",
  "19": "CHIVO", "20": "COCHINO", "21": "GALLO", "22": "CAMELLO", "23": "CEBRA",
  "24": "IGUANA", "25": "GALLINA", "26": "VACA", "27": "PERRO", "28": "ZAMURO",
  "29": "ELEFANTE", "30": "CAIMÁN", "31": "LAPA", "32": "ARDILLA", "33": "PESCADO",
  "34": "VENADO", "35": "JIRAFA", "36": "CULEBRA", "37": "TORTUGA", "38": "BÚFALO",
  "39": "LECHUZA", "40": "AVISPA", "41": "CANGREJO", "42": "PELÍCANO", "43": "PUMA",
  "44": "CHIGÜIRE", "45": "GARZA", "46": "TUCÁN", "47": "MARIPOSA", "48": "PUERCOESPÍN",
  "49": "PEREZA", "50": "CANARIO", "51": "PAVO REAL", "52": "PULPO", "53": "CARACOL",
  "54": "GRILLO", "55": "OSO HORMIGUERO", "56": "HORMIGA", "57": "PATO", "58": "FLAMINGO",
  "59": "CAMALEÓN", "60": "TIBURÓN", "61": "PANDA", "62": "CACHICAMO", "63": "GOLONDRINA",
  "64": "GAVILÁN", "65": "ARAÑA", "66": "LOBO", "67": "AVESTRUZ", "68": "JAGUAR",
  "69": "PANTERA", "70": "BISONTE", "71": "GUACAMAYA", "72": "GORILA", "73": "HIPOPÓTAMO",
  "74": "RINOCERONTE", "75": "CIGÜEÑA", "76": "NUTRIA", "77": "PINGÜINO", "78": "ANTÍLOPE",
  "79": "CALAMAR", "80": "VIZCACHA", "81": "FOCA", "82": "HURÓN", "83": "SURICATA",
  "84": "CANGURO", "85": "COLIBRÍ", "86": "BUEY", "87": "CABRA", "88": "ERIZO",
  "89": "ANGUILA", "90": "MANATÍ", "91": "MORROCOY", "92": "CISNE", "93": "GAVIOTA",
  "94": "COATÍ", "95": "ESCARABAJO", "96": "ARMADILLO", "97": "TAPIR", "98": "DINGO",
  "99": "GUACHARÍN"
};

const ANIMAL_NAMES = { ...BASE_ANIMAL_NAMES };
for (let i = 0; i <= 9; i++) {
  ANIMAL_NAMES[`0${i}`] = BASE_ANIMAL_NAMES[`${i}`] || `ANIMAL 0${i}`;
}

const ZODIAC_SIGNS = [
  "Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo",
  "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"
];

let historyStore = {};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
  }
}

function loadHistoryFromDisk() {
  ensureDataDir();
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      historyStore = JSON.parse(raw);
    } catch (e) {
      console.warn('[LotteryStats] Error leyendo lottery_history.json, iniciando nuevo almacén.');
      historyStore = {};
    }
  } else {
    historyStore = {};
  }
}

function saveHistoryToDisk() {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyStore, null, 2), 'utf8');
  } catch (e) {
    console.error('[LotteryStats] Error guardando historial:', e);
  }
}

// Funciones de Hash y PRNG determinístico para cálculos independientes por cada lotería
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Generador de fechas pasadas YYYY-MM-DD
function getPastDateStrings(daysCount = 30) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    dates.push(formatter.format(d));
  }
  return dates;
}

// Inicializar y sembrar histórico de 30 días estrictamente individual por cada lotería
function seedBaselineHistory(catalog, forceReseed = false) {
  loadHistoryFromDisk();
  const pastDates = getPastDateStrings(30);
  let seeded = false;

  for (const game of catalog) {
    if (!historyStore[game.id] || forceReseed) {
      historyStore[game.id] = {};
    }

    const isAnimal = (!game.type || game.type === 'animalitos') && !game.id.includes('triple');

    // Determinar pool de números propios de esta lotería
    let validPool = [];
    if (isAnimal) {
      let maxNum = 36;
      if (game.id === 'guacharito-millonario' || game.id === 'la-ricachona' || game.id === 'animalitos-la-ricachona') {
        maxNum = 70;
      } else if (game.id === 'mega-animal-40') {
        maxNum = 40;
      } else if (game.id.includes('centena')) {
        maxNum = 99;
      }

      validPool = ['00', '0'];
      for (let n = 1; n <= maxNum; n++) {
        validPool.push(String(n).padStart(2, '0'));
      }
    }

    pastDates.forEach((dateStr) => {
      if (!historyStore[game.id][dateStr] || forceReseed) {
        seeded = true;
        historyStore[game.id][dateStr] = [];

        // Semilla única y aislada por lotería y fecha: NUNCA se repite entre juegos diferentes
        const seedVal = hashString(`${game.id}::${dateStr}::salt2026`);
        const rng = mulberry32(seedVal);

        if (isAnimal) {
          // Barajar el pool sin reemplazo para ese día (1 sorteo por hora con números variados)
          const dayShuffled = [...validPool];
          for (let i = dayShuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [dayShuffled[i], dayShuffled[j]] = [dayShuffled[j], dayShuffled[i]];
          }

          game.hours.forEach((hour, hIdx) => {
            const numStr = dayShuffled[hIdx % dayShuffled.length];
            const cleanKey = numStr.replace(/^0+/, '') || '0';
            const animalName = ANIMAL_NAMES[numStr] || ANIMAL_NAMES[cleanKey] || `ANIMAL ${numStr}`;

            historyStore[game.id][dateStr].push({
              time: hour,
              number: numStr,
              name: animalName,
              isPending: false
            });
          });
        } else {
          // Triples y Terminales (independiente por cada lotería)
          game.hours.forEach(hour => {
            const tA = Math.floor(rng() * 1000).toString().padStart(3, '0');
            const tB = Math.floor(rng() * 1000).toString().padStart(3, '0');
            const tC = Math.floor(rng() * 1000).toString().padStart(3, '0');
            const signIdx = Math.floor(rng() * ZODIAC_SIGNS.length);

            historyStore[game.id][dateStr].push({
              time: hour,
              tripleA: tA,
              tripleB: tB,
              tripleC: tC,
              signo: ZODIAC_SIGNS[signIdx],
              isPending: false
            });
          });
        }
      }
    });
  }

  // Sobreponer sorteos reales de hoy y días recientes desde lottery_results.json
  try {
    const resultsPath = path.join(DATA_DIR, 'lottery_results.json');
    if (fs.existsSync(resultsPath)) {
      const liveResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      for (const [dt, byGame] of Object.entries(liveResults)) {
        for (const [gId, gData] of Object.entries(byGame)) {
          if (Array.isArray(gData?.draws)) {
            const valid = gData.draws.filter(d => !d.isPending && (d.number || d.tripleA));
            if (valid.length > 0) {
              if (!historyStore[gId]) historyStore[gId] = {};
              if (!historyStore[gId][dt]) historyStore[gId][dt] = [];
              valid.forEach(vDraw => {
                const existingIdx = historyStore[gId][dt].findIndex(x => x.time === vDraw.time);
                const drawObj = {
                  time: vDraw.time,
                  number: vDraw.number || null,
                  name: vDraw.name || (vDraw.number ? (ANIMAL_NAMES[vDraw.number] || `ANIMAL ${vDraw.number}`) : null),
                  tripleA: vDraw.tripleA || null,
                  tripleB: vDraw.tripleB || null,
                  tripleC: vDraw.tripleC || null,
                  signo: vDraw.signo || null,
                  isPending: false
                };
                if (existingIdx >= 0) {
                  historyStore[gId][dt][existingIdx] = drawObj;
                } else {
                  historyStore[gId][dt].push(drawObj);
                }
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[LotteryStats] No se pudieron sobreponer resultados reales:', err.message);
  }

  if (seeded || forceReseed) {
    saveHistoryToDisk();
    console.log('[LotteryStats] Histórico base de 30 días recalculado individualmente por cada lotería.');
  }
}

// Registrar o actualizar sorteos reales de hoy en el histórico permanente
function recordDrawsToHistory(gameId, dateStr, draws) {
  if (!gameId || !dateStr || !draws) return;
  if (!historyStore[gameId]) historyStore[gameId] = {};
  if (!historyStore[gameId][dateStr]) historyStore[gameId][dateStr] = [];

  const completedDraws = draws.filter(d => !d.isPending && (d.number || d.tripleA));
  if (completedDraws.length === 0) return;

  historyStore[gameId][dateStr] = completedDraws.map(d => ({
    time: d.time,
    number: d.number || null,
    name: d.name || null,
    tripleA: d.tripleA || null,
    tripleB: d.tripleB || null,
    tripleC: d.tripleC || null,
    signo: d.signo || null,
    isManual: Boolean(d.isManual)
  }));

  saveHistoryToDisk();

  // Sincronización transparente con Supabase en segundo plano
  if (typeof syncDrawsToCloud === 'function') {
    try {
      const isTriples = gameId.includes('triple') || completedDraws.some(d => d.tripleA || d.tripleB || d.signo);
      const gameType = isTriples ? 'triples' : 'animalitos';
      syncDrawsToCloud(gameId, dateStr, completedDraws, gameType).catch(err => {
        console.warn(`[LotteryStats] Error asíncrono sincronizando con Supabase (${gameId}):`, err.message);
      });
    } catch (err) {}
  }
}

// 1. Obtener Números Más Premiados (Calientes) de los últimos 30 días
function getHotNumbers(gameId, limit = 5) {
  if (!historyStore || Object.keys(historyStore).length === 0) loadHistoryFromDisk();
  const gameHistory = historyStore[gameId];
  if (!gameHistory) return [];

  const counts = {};
  const names = {};

  for (const dateStr of Object.keys(gameHistory)) {
    const dayDraws = gameHistory[dateStr] || [];
    for (const d of dayDraws) {
      if (d.number) {
        counts[d.number] = (counts[d.number] || 0) + 1;
        if (d.name) names[d.number] = d.name;
      } else if (d.tripleA) {
        const lastTwo = d.tripleA.slice(-2);
        counts[lastTwo] = (counts[lastTwo] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(counts)
    .map(([num, count]) => {
      const cleanKey = num.replace(/^0+/, '') || '0';
      return {
        number: num,
        name: names[num] || ANIMAL_NAMES[num] || ANIMAL_NAMES[cleanKey] || `ANIMAL ${num}`,
        occurrences: count
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);

  return sorted.slice(0, limit);
}

// 2. Obtener Números Menos Salidos / Atrasados de los últimos 30 días
function getColdNumbers(gameId, limit = 5) {
  if (!historyStore || Object.keys(historyStore).length === 0) loadHistoryFromDisk();
  const gameHistory = historyStore[gameId];
  if (!gameHistory) return [];

  const dates = Object.keys(gameHistory).sort().reverse();
  const occurrencesMap = {};
  const lastSeenDaysAgo = {};
  const names = {};

  const isAnimal = !gameId.includes('triple');
  let max = 36;
  if (gameId === 'guacharito-millonario' || gameId === 'la-ricachona' || gameId === 'animalitos-la-ricachona') {
    max = 70;
  } else if (gameId === 'mega-animal-40') {
    max = 40;
  } else if (gameId.includes('centena')) {
    max = 99;
  }

  const allNumbers = [];
  if (isAnimal) {
    allNumbers.push('00');
    for (let i = 0; i <= max; i++) allNumbers.push(i.toString().padStart(2, '0'));
  } else {
    for (let i = 0; i <= 99; i++) allNumbers.push(i.toString().padStart(2, '0'));
  }

  // Contar ocurrencias totales en los últimos 30 días
  for (const dateStr of Object.keys(gameHistory)) {
    const dayDraws = gameHistory[dateStr] || [];
    for (const d of dayDraws) {
      if (d.number) {
        const nKey = d.number.toString().padStart(2, '0');
        occurrencesMap[nKey] = (occurrencesMap[nKey] || 0) + 1;
        if (d.name) names[nKey] = d.name;
      }
    }
  }

  for (const num of allNumbers) {
    let daysAgo = 30;
    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const draws = gameHistory[dateStr] || [];
      const found = draws.some(d => {
        if (isAnimal) return d.number === num || parseInt(d.number) === parseInt(num);
        return (d.tripleA && d.tripleA.slice(-2) === num) || (d.tripleB && d.tripleB.slice(-2) === num);
      });
      if (found) {
        daysAgo = i;
        const matched = draws.find(d => d.number === num || parseInt(d.number) === parseInt(num));
        if (matched && matched.name) names[num] = matched.name;
        break;
      }
    }
    lastSeenDaysAgo[num] = daysAgo;
    if (!names[num]) {
      const cleanKey = num.replace(/^0+/, '') || '0';
      names[num] = ANIMAL_NAMES[num] || ANIMAL_NAMES[cleanKey] || `ANIMAL ${num}`;
    }
  }

  // Ordenar por menor cantidad de salidas en 30 días, y en caso de empate, por mayor atraso en días
  const sorted = allNumbers
    .map(num => ({
      number: num,
      name: names[num] || `ANIMAL ${num}`,
      occurrences: occurrencesMap[num] || 0,
      daysOverdue: lastSeenDaysAgo[num] !== undefined ? lastSeenDaysAgo[num] : 30
    }))
    .sort((a, b) => {
      if (a.occurrences !== b.occurrences) {
        return a.occurrences - b.occurrences;
      }
      return b.daysOverdue - a.daysOverdue;
    });

  return sorted.slice(0, limit);
}

// 3. Pronósticos y Datos del Día basados en frecuencias y tendencias
function getDailyPredictions(gameId) {
  const hot = getHotNumbers(gameId, 3);
  const cold = getColdNumbers(gameId, 2);

  return {
    calientes: hot.map(h => ({ number: h.number, name: h.name, probabilidad: 'ALTA' })),
    atrasados: cold.map(c => ({ number: c.number, name: c.name, atraso: `${c.daysOverdue} días`, aviso: 'POR REVENTAR' })),
    datosFenix: hot.length > 0 ? [hot[0].number, cold[0]?.number || '17'].filter(Boolean) : ['34', '12', '05']
  };
}

// 4. Generar elementos del Cintillo Desplazable (Marquee Feed - Por Lotería Separada)
function generateTickerFeed(catalog) {
  loadHistoryFromDisk();
  const items = [];

  // Cargar resultados reales de hoy si existen
  let todayResults = {};
  try {
    const resultsPath = path.join(DATA_DIR, 'lottery_results.json');
    if (fs.existsSync(resultsPath)) {
      const allResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      const todayStr = getPastDateStrings(1)[0];
      todayResults = allResults[todayStr] || {};
    }
  } catch (e) {}

  const gamesList = Array.isArray(catalog) ? catalog : [];

  for (const game of gamesList) {
    const isAnimal = (!game.type || game.type === 'animalitos') && !game.id.includes('triple');
    const icon = game.icon || (isAnimal ? '🐾' : '🎰');
    const displayName = `${icon} ${game.name}`;

    // 1. Sorteos del día de hoy para esta lotería específica
    const gameToday = todayResults[game.id];
    const completedToday = (gameToday?.draws || []).filter(d => !d.isPending && (d.number || d.tripleA));

    if (completedToday.length > 0) {
      const recent = completedToday.slice(-2).reverse();
      const drawsSummary = isAnimal
        ? recent.map(d => {
            const cleanKey = String(d.number).replace(/^0+/, '') || '0';
            const aName = d.name || ANIMAL_NAMES[d.number] || ANIMAL_NAMES[cleanKey] || '';
            return `${d.time} ➔ #${d.number} ${aName ? `(${aName})` : ''}`;
          }).join('  •  ')
        : recent.map(d => {
            let line = `${d.time} ➔ A: ${d.tripleA || '---'}`;
            if (d.tripleB) line += ` | B: ${d.tripleB}`;
            if (d.signo) line += ` (${d.signo})`;
            return line;
          }).join('  •  ');

      items.push({
        type: 'result',
        gameId: game.id,
        gameName: displayName,
        badge: '🕒 ÚLTIMO SORTEO',
        text: drawsSummary
      });
    }

    // 2. Números calientes de los últimos 30 días para esta lotería específica
    const hot = getHotNumbers(game.id, 2);
    if (hot.length > 0) {
      const hotStr = isAnimal
        ? hot.map(h => `#${h.number} ${h.name ? `(${h.name})` : ''} [${h.occurrences}x]`).join('  •  ')
        : hot.map(h => `Terminal #${h.number} [${h.occurrences}x]`).join('  •  ');
      items.push({
        type: 'hot',
        gameId: game.id,
        gameName: displayName,
        badge: '🔥 CALIENTE 30D',
        text: hotStr
      });
    }

    // 3. Números atrasados / por reventar para esta lotería específica
    const cold = getColdNumbers(game.id, 2);
    if (cold.length > 0) {
      const coldStr = isAnimal
        ? cold.map(c => `#${c.number} ${c.name ? `(${c.name})` : ''} [${c.daysOverdue}d atraso]`).join('  •  ')
        : cold.map(c => `Terminal #${c.number} [${c.daysOverdue}d sin salir]`).join('  •  ');
      items.push({
        type: 'cold',
        gameId: game.id,
        gameName: displayName,
        badge: '❄️ POR REVENTAR',
        text: coldStr
      });
    }

    // 4. Dato sugerido exclusivo de esta lotería
    if (hot.length > 0 && cold.length > 0) {
      const predStr = isAnimal
        ? `Fijo #${hot[0].number} (${hot[0].name})  •  Atrasado #${cold[0].number} (${cold[0].name})`
        : `Terminal Clave #${hot[0].number}  •  Sorpresa #${cold[0].number}`;
      items.push({
        type: 'prediction',
        gameId: game.id,
        gameName: displayName,
        badge: '🎯 DATO SUGERIDO',
        text: predStr
      });
    }
  }

  return items;
}

// 5. Estadísticas completas de un juego para la vista a Pantalla Completa
function getFullGameAnalytics(gameId) {
  const hot = getHotNumbers(gameId, 10);
  const cold = getColdNumbers(gameId, 10);
  const predictions = getDailyPredictions(gameId);

  return {
    gameId,
    hot,
    cold,
    predictions,
    totalDrawsAnalyzed: Object.values(historyStore[gameId] || {}).reduce((acc, draws) => acc + draws.length, 0),
    daysTracked: Object.keys(historyStore[gameId] || {}).length
  };
}

// 6. Obtener historial detallado de un juego por días o fecha específica
function getGameHistory(gameId, options = {}) {
  loadHistoryFromDisk();
  const gameHistory = historyStore[gameId];
  if (!gameHistory) return { gameId, dates: [], totalDraws: 0, history: {} };

  if (options.date) {
    const singleDayDraws = gameHistory[options.date] || [];
    return {
      gameId,
      date: options.date,
      totalDraws: singleDayDraws.length,
      draws: singleDayDraws
    };
  }

  const daysLimit = Math.min(90, Math.max(1, parseInt(options.days) || 30));
  const sortedDates = Object.keys(gameHistory).sort().reverse().slice(0, daysLimit);
  const resultHistory = {};
  let totalDraws = 0;

  for (const d of sortedDates) {
    resultHistory[d] = gameHistory[d] || [];
    totalDraws += resultHistory[d].length;
  }

  return {
    gameId,
    daysRequested: daysLimit,
    daysAvailable: sortedDates.length,
    totalDraws,
    dates: sortedDates,
    history: resultHistory
  };
}

// 7. Buscador de sorteos históricos por número o rango de fechas
function queryHistoricalDraws({ gameId, number, dateFrom, dateTo, limit = 50 }) {
  loadHistoryFromDisk();
  const results = [];
  const targetGames = gameId ? [gameId] : Object.keys(historyStore);
  const normNum = number ? number.toString().trim() : null;

  for (const gId of targetGames) {
    const gHistory = historyStore[gId] || {};
    const dates = Object.keys(gHistory).sort().reverse();

    for (const dStr of dates) {
      if (dateFrom && dStr < dateFrom) continue;
      if (dateTo && dStr > dateTo) continue;

      const dayDraws = gHistory[dStr] || [];
      for (const d of dayDraws) {
        let match = false;
        if (normNum) {
          if (d.number && (d.number === normNum || parseInt(d.number) === parseInt(normNum))) match = true;
          if (d.tripleA && (d.tripleA === normNum || d.tripleA.slice(-2) === normNum)) match = true;
          if (d.tripleB && (d.tripleB === normNum || d.tripleB.slice(-2) === normNum)) match = true;
          if (d.tripleC && (d.tripleC === normNum || d.tripleC.slice(-2) === normNum)) match = true;
        } else {
          match = true;
        }

        if (match) {
          results.push({
            gameId: gId,
            date: dStr,
            time: d.time,
            number: d.number,
            name: d.name,
            tripleA: d.tripleA,
            tripleB: d.tripleB,
            tripleC: d.tripleC,
            signo: d.signo
          });
          if (results.length >= limit) return results;
        }
      }
    }
  }

  return results;
}

// 8. Resumen global del Almacén Histórico
function getHistoryOverview() {
  loadHistoryFromDisk();
  const gamesList = Object.keys(historyStore);
  const overview = {};
  let globalTotalDraws = 0;

  for (const gId of gamesList) {
    const dates = Object.keys(historyStore[gId] || {}).sort().reverse();
    const drawsCount = dates.reduce((acc, dt) => acc + (historyStore[gId][dt]?.length || 0), 0);
    globalTotalDraws += drawsCount;
    overview[gId] = {
      daysTracked: dates.length,
      latestDate: dates[0] || null,
      oldestDate: dates[dates.length - 1] || null,
      totalDraws: drawsCount
    };
  }

  return {
    totalGames: gamesList.length,
    globalTotalDraws,
    games: overview
  };
}

module.exports = {
  seedBaselineHistory,
  recordDrawsToHistory,
  getHotNumbers,
  getColdNumbers,
  getDailyPredictions,
  generateTickerFeed,
  getFullGameAnalytics,
  getGameHistory,
  queryHistoricalDraws,
  getHistoryOverview
};
