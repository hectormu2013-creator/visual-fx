const fs = require('fs');
const path = require('path');
const https = require('https');

// Persistencia Obligatoria en Disco
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'lottery_results.json');

const { seedBaselineHistory, recordDrawsToHistory } = require('./lottery_stats');
let syncGameToCloud = null;
try {
  syncGameToCloud = require('./supabase_lottery').syncGameToCloud;
} catch (e) {}


// Catálogo Top 10 Oficial de Loterías (Basado en Ventas Reales con Logos Oficiales Verificados)
const TOP_10_GAMES = [
  {
    id: 'guacharo-activo',
    name: 'Guácharo Activo',
    shortName: 'Guácharo',
    type: 'animalitos',
    slug1000: 'guacharo-activo',
    tuazarPattern: /guacharo\s+activo/i,
    icon: '🦜',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/guacharoactivo/logo.png',
    color: '#10b981',
    hours: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'lotto-activo',
    name: 'Lotto Activo',
    shortName: 'Lotto Activo',
    type: 'animalitos',
    slug1000: 'lotto-activo',
    tuazarPattern: /lotto\s+activo/i,
    icon: '🐾',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/lottoactivo/logo.png',
    color: '#06b6d4',
    hours: ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'la-granjita',
    name: 'La Granjita',
    shortName: 'La Granjita',
    type: 'animalitos',
    slug1000: 'la-granjita',
    tuazarPattern: /la\s+granjita/i,
    icon: '🐸',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/granjita/logo.png',
    color: '#84cc16',
    hours: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'guacharito-millonario',
    name: 'Guacharito Millonario',
    shortName: 'Guacharito',
    type: 'animalitos',
    slug1000: 'guacharito-millonario',
    tuazarPattern: /guacharito/i,
    icon: '🐥',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/guacharitomillonario/logo.png',
    color: '#f59e0b',
    hours: ['08:30 AM', '09:30 AM', '10:30 AM', '11:30 AM', '12:30 PM', '01:30 PM', '02:30 PM', '03:30 PM', '04:30 PM', '05:30 PM', '06:30 PM', '07:30 PM']
  },
  {
    id: 'triple-zulia',
    name: 'Triple Zulia',
    shortName: 'Zulia',
    type: 'triples',
    slug1000: 'triple-zulia',
    tuazarPattern: /triple\s+zulia/i,
    icon: '🎰',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplezulia/logo.png',
    color: '#3b82f6',
    hours: ['12:45 PM', '04:45 PM', '07:05 PM']
  },
  {
    id: 'la-ricachona',
    name: 'La Ricachona',
    shortName: 'Ricachona',
    type: 'animalitos',
    slug1000: 'la-ricachona',
    tuazarPattern: /la\s+ricachona/i,
    icon: '💰',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/laricachona/logo.png',
    color: '#ec4899',
    hours: ['08:10 AM', '09:10 AM', '10:10 AM', '11:10 AM', '12:10 PM', '01:10 PM', '02:10 PM', '03:10 PM', '04:10 PM', '05:10 PM', '06:10 PM', '07:10 PM']
  },
  {
    id: 'triple-tachira',
    name: 'Triple Táchira',
    shortName: 'Táchira',
    type: 'triples',
    slug1000: 'triple-tachira',
    tuazarPattern: /triple\s+t[aá]chira/i,
    icon: '🎯',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/tripletachira/logo.png',
    color: '#eab308',
    hours: ['01:15 PM', '04:45 PM', '10:10 PM']
  },
  {
    id: 'selva-plus',
    name: 'Selva Plus',
    shortName: 'Selva Plus',
    type: 'animalitos',
    slug1000: 'selva-plus',
    tuazarPattern: /selva\s+plus/i,
    icon: '🌿',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/selvaplus/logo.png',
    color: '#14b8a6',
    hours: ['09:30 AM', '10:30 AM', '11:30 AM', '12:30 PM', '01:30 PM', '02:30 PM', '03:30 PM', '04:30 PM', '05:30 PM', '06:30 PM', '07:30 PM']
  },
  {
    id: 'triple-chance',
    name: 'Triple Chance',
    shortName: 'Chance',
    type: 'triples',
    slug1000: 'triple-chance',
    tuazarPattern: /chance/i,
    icon: '🎲',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplechance/logo.png',
    color: '#8b5cf6',
    hours: ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'triple-chance-1',
    name: 'TRIPLE CHANCE (9 AM - 2 PM)',
    shortName: 'Chance 1',
    type: 'triples',
    slug1000: 'triple-chance',
    tuazarPattern: /chance/i,
    icon: '🎲',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplechance/logo.png',
    color: '#8b5cf6',
    hours: ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM']
  },
  {
    id: 'triple-chance-2',
    name: 'TRIPLE CHANCE (3 PM - 7 PM)',
    shortName: 'Chance 2',
    type: 'triples',
    slug1000: 'triple-chance',
    tuazarPattern: /chance/i,
    icon: '🎲',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplechance/logo.png',
    color: '#8b5cf6',
    hours: ['03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'triple-zamorano',
    name: 'Triple Zamorano',
    shortName: 'Zamorano',
    type: 'triples',
    slug1000: 'triple-zamorano',
    tuazarPattern: /zamorano/i,
    icon: '🐎',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplezamorano/logo.png',
    color: '#f97316',
    hours: ['12:00 PM', '04:00 PM', '07:00 PM']
  },
  {
    id: 'triple-caracas',
    name: 'Triple Caracas',
    shortName: 'Caracas',
    type: 'triples',
    slug1000: 'triple-caracas',
    tuazarPattern: /triple\s+caracas/i,
    icon: '🏛️',
    logoUrl: 'https://api.1000resultados.com/public/images/lottery/triplecaracas/logo.png',
    color: '#ef4444',
    hours: ['01:00 PM', '04:30 PM', '07:00 PM']
  },
  {
    id: 'ruleta-activa',
    name: 'Ruleta Activa',
    shortName: 'Ruleta Activa',
    type: 'animalitos',
    slug1000: 'ruleta-activa',
    tuazarPattern: /ruleta\s+activa/i,
    icon: '🎡',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/ruletaactiva/logo.png',
    color: '#0ea5e9',
    hours: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
  },
  {
    id: 'granjita-plus',
    name: 'La Granjita Plus',
    shortName: 'Granjita Plus',
    type: 'animalitos',
    slug1000: 'granjita-plus',
    tuazarPattern: /granjita\s+plus/i,
    icon: '🌟',
    logoUrl: 'https://api.1000resultados.com/public/images/animals/granjitaplus/logo.png',
    color: '#84cc16',
    hours: ['08:10 AM', '09:10 AM', '10:10 AM', '11:10 AM', '12:10 PM', '01:10 PM', '02:10 PM', '03:10 PM', '04:10 PM', '05:10 PM', '06:10 PM', '07:10 PM']
  }
];

// Estado en memoria
const CATALOG_FILE = path.join(DATA_DIR, 'lottery_catalog.json');
let lotteryCatalog = [];
let resultsStore = {};
let listeners = [];
let sourceAlternator = 0; // 0: TuAzar -> 1000Res, 1: 1000Res -> TuAzar
let schedulerTimer = null;

// Cargar catálogo de loterías desde disco o inicializar con TOP_10_GAMES
function loadCatalogFromDisk() {
  ensureDataDir();
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
      lotteryCatalog = JSON.parse(raw);
    } else {
      lotteryCatalog = JSON.parse(JSON.stringify(TOP_10_GAMES));
      saveCatalogToDisk();
    }
  } catch (err) {
    console.error('[LotteryEngine] Error leyendo lottery_catalog.json:', err);
    lotteryCatalog = JSON.parse(JSON.stringify(TOP_10_GAMES));
  }
}

function saveCatalogToDisk() {
  ensureDataDir();
  try {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(lotteryCatalog, null, 2), 'utf8');
  } catch (err) {
    console.error('[LotteryEngine] Error guardando lottery_catalog.json:', err);
  }
}

function getLotteryCatalog() {
  if (!lotteryCatalog || lotteryCatalog.length === 0) {
    loadCatalogFromDisk();
  }
  return lotteryCatalog;
}

function addLotteryToCatalog(gameData) {
  loadCatalogFromDisk();
  const rawId = (gameData.name || 'nueva-loteria').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  let finalId = gameData.id || rawId;
  let counter = 1;
  while (lotteryCatalog.some(g => g.id === finalId)) {
    finalId = `${rawId}-${counter++}`;
  }

  const newGame = {
    id: finalId,
    name: gameData.name ? gameData.name.trim().toUpperCase() : 'NUEVA LOTERÍA',
    shortName: gameData.shortName ? gameData.shortName.trim() : (gameData.name || 'Lotería'),
    type: gameData.type === 'triples' ? 'triples' : 'animalitos',
    icon: gameData.icon || (gameData.type === 'triples' ? '🎰' : '🐾'),
    color: gameData.color || '#10b981',
    logoUrl: gameData.logoUrl || '',
    hours: Array.isArray(gameData.hours) && gameData.hours.length > 0 ? gameData.hours : [
      "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
      "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM"
    ]
  };

  lotteryCatalog.push(newGame);
  saveCatalogToDisk();

  if (typeof syncGameToCloud === 'function') {
    syncGameToCloud(newGame).catch(err => {
      console.warn(`[LotteryEngine] Error asíncrono guardando juego en Supabase (${newGame.id}):`, err.message);
    });
  }

  return { success: true, game: newGame, catalog: lotteryCatalog };
}

function updateLotteryInCatalog(id, updateData) {
  loadCatalogFromDisk();
  const idx = lotteryCatalog.findIndex(g => g.id === id);
  if (idx === -1) return { success: false, error: 'Lotería no encontrada en el catálogo' };

  if (updateData.name) lotteryCatalog[idx].name = updateData.name.trim().toUpperCase();
  if (updateData.shortName) lotteryCatalog[idx].shortName = updateData.shortName.trim();
  if (updateData.type) lotteryCatalog[idx].type = updateData.type;
  if (updateData.icon) lotteryCatalog[idx].icon = updateData.icon;
  if (updateData.color) lotteryCatalog[idx].color = updateData.color;
  if (updateData.logoUrl !== undefined) lotteryCatalog[idx].logoUrl = updateData.logoUrl;
  if (Array.isArray(updateData.hours)) lotteryCatalog[idx].hours = updateData.hours;

  saveCatalogToDisk();

  if (typeof syncGameToCloud === 'function') {
    syncGameToCloud(lotteryCatalog[idx]).catch(err => {
      console.warn(`[LotteryEngine] Error asíncrono actualizando juego en Supabase (${id}):`, err.message);
    });
  }

  return { success: true, game: lotteryCatalog[idx], catalog: lotteryCatalog };
}

function deleteLotteryFromCatalog(id) {
  loadCatalogFromDisk();
  const initialLen = lotteryCatalog.length;
  lotteryCatalog = lotteryCatalog.filter(g => g.id !== id);
  if (lotteryCatalog.length === initialLen) {
    return { success: false, error: 'Lotería no encontrada en el catálogo' };
  }
  saveCatalogToDisk();
  return { success: true, message: `Lotería ${id} eliminada con éxito`, catalog: lotteryCatalog };
}

// Obtener fecha actual en formato YYYY-MM-DD en zona horaria de Venezuela (America/Caracas UTC-4)
function getVenezuelaDateString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

// Obtener hora actual en Venezuela en minutos desde medianoche (0 - 1439)
function getVenezuelaTimeMinutes() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.format(now).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Convertir hora tipo "08:00 AM" o "12:45 PM" a minutos desde medianoche
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return -1;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return -1;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

// Inicializar persistencia
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('[LotteryEngine] No se pudo crear directorio data:', e);
    }
  }
}

function loadResultsFromDisk() {
  ensureDataDir();
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const raw = fs.readFileSync(RESULTS_FILE, 'utf8');
      resultsStore = JSON.parse(raw) || {};
    }
  } catch (err) {
    console.error('[LotteryEngine] Error leyendo lottery_results.json:', err);
    resultsStore = {};
  }
}

function saveResultsToDisk() {
  ensureDataDir();
  try {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(resultsStore, null, 2), 'utf8');
    const today = getVenezuelaDateString();
    if (resultsStore[today]) {
      for (const gameId of Object.keys(resultsStore[today])) {
        const game = resultsStore[today][gameId];
        if (game && game.draws) {
          recordDrawsToHistory(gameId, today, game.draws);
        }
      }
    }
  } catch (err) {
    console.error('[LotteryEngine] Error guardando lottery_results.json:', err);
  }
}

// HTTP Fetch seguro con User-Agent realista
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout de conexión')); });
  });
}

// Parser: 1000Resultados
async function scrape1000Resultados(gameSlug) {
  if (!gameSlug) return null;
  try {
    const { status, html } = await fetchUrl(`https://1000resultados.com/resultados/${gameSlug}`);
    if (status !== 200) return null;

    const articleRegex = /<article[\s\S]*?<\/article>/gi;
    const articles = html.match(articleRegex) || [];
    const draws = [];

    for (const art of articles) {
      const timeMatch = art.match(/leading-none">(\d{1,2}:\d{2})<\/span>\s*<span[^>]*>([AP]M)<\/span>/i);
      let time = timeMatch ? `${timeMatch[1]} ${timeMatch[2].toUpperCase()}` : null;
      if (!time) continue;
      if (time.indexOf(':') === 1) {
        time = '0' + time;
      }

      const isPending = /en\s+espera/i.test(art);
      let number = null, name = null, tripleA = null, tripleB = null, tripleC = null, signo = null, image = null;

      if (!isPending) {
        // B64 animalitos
        const b64NumMatch = art.match(/data-b64-number="([^"]+)"/i);
        const b64NameMatch = art.match(/data-b64-name="([^"]+)"/i);
        if (b64NumMatch) {
          try { number = Buffer.from(b64NumMatch[1], 'base64').toString('utf8').trim(); } catch(e){}
        }
        if (b64NameMatch) {
          try { name = Buffer.from(b64NameMatch[1], 'base64').toString('utf8').trim(); } catch(e){}
        }

        // Triples / Terminales: A, B, C (Soporta loterías con 1, 2 o 3 triples/terminales)
        const triplesMatch = art.match(/class="text-xl font-black leading-tight">\s*([0-9]{2,4})\s*<\/div>/gi);
        if (triplesMatch && triplesMatch.length >= 1) {
          const nums = triplesMatch.map(m => m.replace(/[^0-9]/g, ''));
          tripleA = nums[0];
          if (nums.length >= 2) tripleB = nums[1];
          if (nums.length >= 3) tripleC = nums[2];
        }
        const signoMatch = art.match(/px-6 py-2 rounded-full border text-sm font-extrabold[^>]*>\s*([A-Za-z]+)\s*<\/span>/i);
        if (signoMatch) {
          signo = signoMatch[1].trim();
        }

        // Compatibilidad cruzada: si solo vino number, asignar como tripleA; si solo vino tripleA, asignar como number
        if (!tripleA && number) tripleA = number;
        if (!number && tripleA) number = tripleA;
        if (!name && signo) name = signo;

        // Imagen
        const imgMatch = art.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch) {
          image = imgMatch[1];
          if (image.includes('/api/image?url=')) {
            try {
              const raw = image.split('/api/image?url=')[1];
              image = Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8');
            } catch(e){}
          }
        }
      }

      draws.push({
        time,
        isPending,
        number,
        name,
        tripleA,
        tripleB,
        tripleC,
        signo,
        image
      });
    }

    return draws;
  } catch (err) {
    console.warn(`[LotteryEngine] 1000Resultados (${gameSlug}) error:`, err.message);
    return null;
  }
}

// Parser: Lagranjita.com Terminal Granjita Oficial
async function scrapeLagranjitaTerminal() {
  try {
    const { status, html } = await fetchUrl('https://lagranjita.com/terminalgranjita');
    if (status !== 200) return null;
    const decoded = html.replace(/&quot;/g, '"');
    const blockRegex = /\{"result_id"[\s\S]*?"lotery_hour":\[\d+,"([^"]+)"\][\s\S]*?"lotery_type":\[\d+,"TERMINALES"\][\s\S]*?\}/g;
    let match;
    const draws = [];
    while ((match = blockRegex.exec(decoded)) !== null) {
      const b = match[0];
      const hourM = b.match(/"lotery_hour":\[\d+,"([^"]+)"\]/);
      const valM = b.match(/"result_value":\[\d+,([^,\]]+)\]/);
      const nameM = b.match(/"result_name":\[\d+,([^,\]]+)\]/);
      const val = (valM && valM[1] !== 'null') ? valM[1].replace(/"/g, '').trim() : null;
      const name = (nameM && nameM[1] !== 'null') ? nameM[1].replace(/"/g, '').trim() : null;
      if (hourM) {
        let time = hourM[1].trim();
        if (time.indexOf(':') === 1) time = '0' + time;
        const isDone = Boolean(val);
        draws.push({
          time,
          isPending: !isDone,
          number: val || null,
          tripleA: val || null,
          name: name || null
        });
      }
    }
    return draws.length > 0 ? draws : null;
  } catch (err) {
    console.warn('[LotteryEngine] lagranjita.com terminal error:', err.message);
    return null;
  }
}

// Parser: TuAzar Animalitos
async function scrapeTuAzarAnimalitos() {
  try {
    const { status, html } = await fetchUrl('https://tuazar.com/loteria/animalitos/resultados/');
    if (status !== 200) return null;

    const gameMap = {};
    const sections = html.split('<h2 class="lotResTit');

    for (let i = 1; i < sections.length; i++) {
      const sec = sections[i];
      const titleMatch = sec.match(/class="[^"]*">\s*([A-Z0-9\s]+)\s*<\/h2>/i) || sec.match(/>\s*([A-Z0-9\s]+)\s*<\/h2>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Buscar cuál de nuestro catálogo coincide
      const catalog = getLotteryCatalog();
      const matchedGame = catalog.find(g => {
        if (g.type !== 'animalitos') return false;
        if (g.tuazarPattern && g.tuazarPattern.test(title)) return true;
        const cleanT = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanN = (g.name || g.id).toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanS = (g.shortName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanT.includes(cleanN) || cleanN.includes(cleanT) || (cleanS && cleanT.includes(cleanS));
      }) || TOP_10_GAMES.find(g => g.type === 'animalitos' && g.tuazarPattern && g.tuazarPattern.test(title));
      if (!matchedGame) continue;

      const boxRegex = /<div class="col-xs-6 col-sm-3">([\s\S]*?)<\/div>\s*<\/div>/gi;
      let match;
      const draws = [];

      while ((match = boxRegex.exec(sec)) !== null) {
        const content = match[1];
        const timeM = content.match(/<div class="horario">\s*<span[^>]*>([^<]+)<\/span>/i);
        const nameM = content.match(/<span>\s*([0-9]+)\s*<i[^>]*>[^<]*<\/i>\s*(?:<br[^>]*>)?\s*([^<]+)<\/span>/i);
        const isPending = /en espera/i.test(content) || !nameM;
        const imgM = content.match(/<img[^>]+src="([^">]+)"/i);

        let image = null;
        if (imgM && !isPending) {
          image = imgM[1].startsWith('http') ? imgM[1] : `https://tuazar.com${imgM[1]}`;
        }

        let time = timeM ? timeM[1].trim() : null;
        if (time) {
          // Normalizar "8:00 AM" -> "08:00 AM"
          const parts = time.split(':');
          if (parts[0].length === 1) time = `0${time}`;
        }

        draws.push({
          time,
          isPending,
          number: (!isPending && nameM) ? nameM[1].trim() : null,
          name: (!isPending && nameM) ? nameM[2].trim() : null,
          image
        });
      }

      gameMap[matchedGame.id] = draws;
    }

    return gameMap;
  } catch (err) {
    console.warn('[LotteryEngine] TuAzar Animalitos error:', err.message);
    return null;
  }
}

// Parser: TuAzar Triples Tradicionales
async function scrapeTuAzarTriples() {
  try {
    const { status, html } = await fetchUrl('https://tuazar.com/loteria/resultados/');
    if (status !== 200) return null;

    const gameMap = {};
    const cardRegex = /<div class="lc-card">([\s\S]*?)<div class="lc-watermark">/gi;
    let cardMatch;

    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const cardContent = cardMatch[1];
      const titleMatch = cardContent.match(/<h3 class="lc-title">\s*([^<]+)\s*<\/h3>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      const catalog = getLotteryCatalog();
      const matchedGame = catalog.find(g => {
        if (g.type !== 'triples') return false;
        if (g.tuazarPattern && g.tuazarPattern.test(title)) return true;
        const cleanT = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanN = (g.name || g.id).toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanS = (g.shortName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanT.includes(cleanN) || cleanN.includes(cleanT) || (cleanS && cleanT.includes(cleanS));
      }) || TOP_10_GAMES.find(g => g.type === 'triples' && g.tuazarPattern && g.tuazarPattern.test(title));
      if (!matchedGame) continue;

      const rowRegex = /<div class="lc-row"[^>]*>([\s\S]*?)<\/div>/gi;
      let rowMatch;
      const draws = [];

      while ((rowMatch = rowRegex.exec(cardContent)) !== null) {
        const rowContent = rowMatch[1];
        if (/lc-row--head/i.test(rowContent)) continue;

        const timeM = rowContent.match(/lc-cell--time[^>]*>\s*([^<]+)\s*<\/div>/i);
        const nums = [];
        const numRegex = /lc-cell"(?:[^>]*style="[^"]*")?>\s*([0-9]{2,4})\s*<\/div>/gi;
        let nm;
        while ((nm = numRegex.exec(rowContent)) !== null) {
          nums.push(nm[1].trim());
        }

        const signoM = rowContent.match(/<abbr title="[^"]*">([^<]+)<\/abbr>/i) || rowContent.match(/lc-cell"[^>]*>\s*([A-Z]{3,})\s*<\/div>/i);
        const signo = signoM ? signoM[1].trim() : null;

        let time = timeM ? timeM[1].trim() : null;
        if (time) {
          const parts = time.split(':');
          if (parts[0].length === 1) time = `0${time}`;
        }

        const isPending = nums.length === 0;

        draws.push({
          time,
          isPending,
          tripleA: nums[0] || null,
          tripleB: nums[1] || null,
          tripleC: nums[2] || null,
          signo: signo
        });
      }

      if (draws.length > 0) {
        gameMap[matchedGame.id] = draws;
      }
    }

    return gameMap;
  } catch (err) {
    console.warn('[LotteryEngine] TuAzar Triples error:', err.message);
    return null;
  }
}

// Sincronización Unificada con Alternancia y Fallback
async function syncGame(gameId) {
  // Si se solicita sincronizar una de las mitades de Triple Chance, derivar desde triple-chance
  if (gameId === 'triple-chance-1' || gameId === 'triple-chance-2') {
    await syncGame('triple-chance');
    return;
  }

  const catalog = getLotteryCatalog();
  const game = catalog.find(g => g.id === gameId) || TOP_10_GAMES.find(g => g.id === gameId);
  if (!game) {
    console.warn(`[LotteryEngine] syncGame: Juego ${gameId} no encontrado en catálogo.`);
    return;
  }

  const today = getVenezuelaDateString();
  if (!resultsStore[today]) {
    resultsStore[today] = {};
  }
  if (!resultsStore[today][gameId]) {
    resultsStore[today][gameId] = {
      gameId: game.id,
      id: game.id,
      name: game.name,
      shortName: game.shortName,
      type: game.type,
      icon: game.icon,
      color: game.color,
      logoUrl: game.logoUrl || '',
      lastUpdated: new Date().toISOString(),
      draws: (game.hours || []).map(h => ({ time: h, isPending: true }))
    };
  }

  const existingGame = resultsStore[today][gameId];
  let newDraws = null;
  let slug1000 = game.slug1000 || game.id;
  if (gameId === 'animalitos-la-ricachona' || gameId === 'la-ricachona') {
    slug1000 = 'la-ricachona';
  }

  // Alternancia de fuentes
  const useTuAzarFirst = (sourceAlternator % 2 === 0);
  sourceAlternator++;

  if (gameId === 'terminal-la-granjita') {
    const termDraws = await scrapeLagranjitaTerminal();
    if (termDraws && termDraws.length > 0 && !termDraws.every(d => d.isPending)) {
      newDraws = termDraws;
    } else {
      // Fallback: Tomar números oficiales de La Granjita
      const granjitaDraws = await scrape1000Resultados('la-granjita');
      if (granjitaDraws && granjitaDraws.length > 0) {
        newDraws = granjitaDraws.map(d => ({
          ...d,
          tripleA: d.number || d.tripleA,
          isPending: d.isPending
        }));
      }
    }
  } else if (useTuAzarFirst) {
    // Fuente A: TuAzar
    if (game.type === 'animalitos') {
      const tuAzarMap = await scrapeTuAzarAnimalitos();
      if (tuAzarMap && tuAzarMap[gameId]) newDraws = tuAzarMap[gameId];
    } else {
      const tuAzarMap = await scrapeTuAzarTriples();
      if (tuAzarMap && tuAzarMap[gameId]) newDraws = tuAzarMap[gameId];
    }

    // Fallback Fuente B: 1000Resultados
    if (!newDraws || newDraws.length === 0 || newDraws.every(d => d.isPending)) {
      const milResDraws = await scrape1000Resultados(slug1000);
      if (milResDraws && milResDraws.length > 0) newDraws = milResDraws;
    }
  } else {
    // Fuente A: 1000Resultados
    const milResDraws = await scrape1000Resultados(slug1000);
    if (milResDraws && milResDraws.length > 0) newDraws = milResDraws;

    // Fallback Fuente B: TuAzar
    if (!newDraws || newDraws.length === 0 || newDraws.every(d => d.isPending)) {
      if (game.type === 'animalitos') {
        const tuAzarMap = await scrapeTuAzarAnimalitos();
        if (tuAzarMap && tuAzarMap[gameId]) newDraws = tuAzarMap[gameId];
      } else {
        const tuAzarMap = await scrapeTuAzarTriples();
        if (tuAzarMap && tuAzarMap[gameId]) newDraws = tuAzarMap[gameId];
      }
    }
  }

  if (newDraws && newDraws.length > 0) {
    let hasChanges = false;

    for (const nd of newDraws) {
      if (!nd.time) continue;
      // Normalizar hora para encontrar coincidencia
      const ndMinutes = parseTimeToMinutes(nd.time);
      let targetDraw = existingGame.draws.find(d => parseTimeToMinutes(d.time) === ndMinutes);

      if (!targetDraw) {
        targetDraw = { time: nd.time, isPending: true };
        existingGame.draws.push(targetDraw);
        // Ordenar cronológicamente
        existingGame.draws.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
      }

      // Si el operador hizo anulación manual de emergencia, protegerla
      if (targetDraw.isManual) {
        continue;
      }

      if (!nd.isPending) {
        if (targetDraw.isPending || targetDraw.number !== nd.number || targetDraw.tripleA !== nd.tripleA || targetDraw.tripleC !== nd.tripleC || (!targetDraw.name && (nd.name || nd.signo))) {
          targetDraw.isPending = false;
          targetDraw.number = nd.number || null;
          targetDraw.name = nd.name || nd.signo || null;
          targetDraw.tripleA = nd.tripleA || null;
          targetDraw.tripleB = nd.tripleB || null;
          targetDraw.tripleC = nd.tripleC || null;
          targetDraw.signo = nd.signo || null;
          if (nd.image) targetDraw.image = nd.image;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      existingGame.lastUpdated = new Date().toISOString();
      if (gameId === 'la-ricachona' && resultsStore[today]?.['animalitos-la-ricachona']) {
        resultsStore[today]['animalitos-la-ricachona'].draws = JSON.parse(JSON.stringify(existingGame.draws));
        resultsStore[today]['animalitos-la-ricachona'].hours = JSON.parse(JSON.stringify(existingGame.hours || []));
        resultsStore[today]['animalitos-la-ricachona'].lastUpdated = existingGame.lastUpdated;
      } else if (gameId === 'animalitos-la-ricachona' && resultsStore[today]?.['la-ricachona']) {
        resultsStore[today]['la-ricachona'].draws = JSON.parse(JSON.stringify(existingGame.draws));
        resultsStore[today]['la-ricachona'].hours = JSON.parse(JSON.stringify(existingGame.hours || []));
        resultsStore[today]['la-ricachona'].lastUpdated = existingGame.lastUpdated;
      } else if (gameId === 'triple-chance') {
        const h1Cutoff = 14 * 60; // 02:00 PM (840 mins)
        const draws1 = existingGame.draws.filter(d => parseTimeToMinutes(d.time) <= h1Cutoff);
        const draws2 = existingGame.draws.filter(d => parseTimeToMinutes(d.time) > h1Cutoff);

        if (!resultsStore[today]['triple-chance-1']) {
          const cat1 = catalog.find(g => g.id === 'triple-chance-1') || {};
          resultsStore[today]['triple-chance-1'] = {
            gameId: 'triple-chance-1', id: 'triple-chance-1',
            name: cat1.name || 'TRIPLE CHANCE (9 AM - 2 PM)', shortName: cat1.shortName || 'Chance 1',
            type: 'triples', icon: '🎲', color: '#8b5cf6', logoUrl: cat1.logoUrl || existingGame.logoUrl || '',
            draws: [], hours: cat1.hours || []
          };
        }
        resultsStore[today]['triple-chance-1'].draws = JSON.parse(JSON.stringify(draws1));
        resultsStore[today]['triple-chance-1'].lastUpdated = existingGame.lastUpdated;

        if (!resultsStore[today]['triple-chance-2']) {
          const cat2 = catalog.find(g => g.id === 'triple-chance-2') || {};
          resultsStore[today]['triple-chance-2'] = {
            gameId: 'triple-chance-2', id: 'triple-chance-2',
            name: cat2.name || 'TRIPLE CHANCE (3 PM - 7 PM)', shortName: cat2.shortName || 'Chance 2',
            type: 'triples', icon: '🎲', color: '#8b5cf6', logoUrl: cat2.logoUrl || existingGame.logoUrl || '',
            draws: [], hours: cat2.hours || []
          };
        }
        resultsStore[today]['triple-chance-2'].draws = JSON.parse(JSON.stringify(draws2));
        resultsStore[today]['triple-chance-2'].lastUpdated = existingGame.lastUpdated;
      }
      saveResultsToDisk();
      notifyListeners({ type: 'DRAW_UPDATE', gameId, game: existingGame });
    }
  }
}

// Sincronización Completa Inicial o de Respaldo
async function syncAllTop10() {
  const catalog = getLotteryCatalog();
  console.log(`[LotteryEngine] Ejecutando sincronización de catálogo completo (${catalog.length} loterías)...`);
  for (const game of catalog) {
    await syncGame(game.id);
    // Pausa sutil de 400ms entre juegos para tráfico orgánico
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('[LotteryEngine] Sincronización de todas las loterías completada con éxito.');
}

// Temporizador Inteligente Schedule-Driven (+2 minutos post-sorteo)
function checkScheduledDraws() {
  const currentMinutes = getVenezuelaTimeMinutes();
  const catalog = getLotteryCatalog();

  for (const game of catalog) {
    const hours = game.hours || [];
    for (const hourStr of hours) {
      const drawMinutes = parseTimeToMinutes(hourStr);
      if (drawMinutes === -1) continue;

      // Regla: Primera consulta a los 2 minutos después del sorteo
      // Ventana activa: entre drawMinutes + 2 y drawMinutes + 15
      const targetMin = drawMinutes + 2;
      const today = getVenezuelaDateString();
      const existingGame = resultsStore[today]?.[game.id];
      const targetDraw = existingGame?.draws?.find(d => parseTimeToMinutes(d.time) === drawMinutes);

      // Si aún está pendiente y estamos en la ventana activa de chequeo
      if ((!targetDraw || targetDraw.isPending) && currentMinutes >= targetMin && currentMinutes <= (drawMinutes + 15)) {
        // Chequear en los minutos pares: T+2, T+4, T+6, T+8, T+10
        if ((currentMinutes - targetMin) % 2 === 0) {
          console.log(`[LotteryEngine Schedule] Disparo T+${currentMinutes - drawMinutes}m para ${game.name} (${hourStr})`);
          syncGame(game.id);
        }
      }
    }
  }
}

// API de Emergencia Manual
function setManualResult({ gameId, time, number, name, tripleA, tripleB, tripleC, signo }) {
  const catalog = getLotteryCatalog();
  const game = catalog.find(g => g.id === gameId) || TOP_10_GAMES.find(g => g.id === gameId);
  if (!game) return { success: false, error: 'Juego no encontrado' };

  const today = getVenezuelaDateString();
  if (!resultsStore[today]) resultsStore[today] = {};
  if (!resultsStore[today][gameId]) {
    resultsStore[today][gameId] = {
      gameId: game.id,
      name: game.name,
      shortName: game.shortName,
      type: game.type,
      icon: game.icon,
      color: game.color,
      logoUrl: game.logoUrl || '',
      lastUpdated: new Date().toISOString(),
      draws: (game.hours || []).map(h => ({ time: h, isPending: true }))
    };
  }

  const existingGame = resultsStore[today][gameId];
  const targetMin = parseTimeToMinutes(time);
  let targetDraw = existingGame.draws.find(d => parseTimeToMinutes(d.time) === targetMin);

  if (!targetDraw) {
    targetDraw = { time, isPending: false };
    existingGame.draws.push(targetDraw);
    existingGame.draws.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  }

  targetDraw.isPending = false;
  targetDraw.number = number || null;
  targetDraw.name = name || null;
  targetDraw.tripleA = tripleA || null;
  targetDraw.tripleB = tripleB || null;
  targetDraw.tripleC = tripleC || null;
  targetDraw.signo = signo || null;
  targetDraw.isManual = true; // Marca permanente de anulación manual

  existingGame.lastUpdated = new Date().toISOString();
  saveResultsToDisk();
  notifyListeners({ type: 'MANUAL_OVERRIDE', gameId, game: existingGame });

  return { success: true, game: existingGame };
}

// Inicializar y Observadores
function onResultsUpdate(callback) {
  listeners.push(callback);
}

function notifyListeners(event) {
  listeners.forEach(cb => {
    try { cb(event); } catch (e) { console.error('[LotteryEngine] Listener error:', e); }
  });
}

function initLotteryEngine() {
  loadCatalogFromDisk();
  loadResultsFromDisk();
  const today = getVenezuelaDateString();
  const catalog = getLotteryCatalog();
  seedBaselineHistory(catalog);

  // Asegurar estructura base para todos los juegos del catálogo
  if (!resultsStore[today]) {
    resultsStore[today] = {};
  }
  for (const game of catalog) {
    if (!resultsStore[today][game.id]) {
      resultsStore[today][game.id] = {
        gameId: game.id,
        id: game.id,
        name: game.name,
        shortName: game.shortName,
        type: game.type,
        icon: game.icon,
        logoUrl: game.logoUrl || '',
        color: game.color,
        lastUpdated: new Date().toISOString(),
        draws: (game.hours || []).map(h => ({ time: h, isPending: true }))
      };
    } else {
      resultsStore[today][game.id].id = game.id;
      resultsStore[today][game.id].gameId = game.id;
      if (game.logoUrl) resultsStore[today][game.id].logoUrl = game.logoUrl;
      if (game.icon) resultsStore[today][game.id].icon = game.icon;
      if (game.color) resultsStore[today][game.id].color = game.color;
      if (game.name) resultsStore[today][game.id].name = game.name;
    }
  }

  // Sincronizar mitades de Triple Chance al iniciar si existe el padre
  if (resultsStore[today]?.['triple-chance']?.draws) {
    const parentDraws = resultsStore[today]['triple-chance'].draws;
    const h1Cutoff = 14 * 60; // 02:00 PM
    if (resultsStore[today]['triple-chance-1']) {
      const p1 = parentDraws.filter(d => parseTimeToMinutes(d.time) <= h1Cutoff);
      if (p1.length > 0) resultsStore[today]['triple-chance-1'].draws = JSON.parse(JSON.stringify(p1));
    }
    if (resultsStore[today]['triple-chance-2']) {
      const p2 = parentDraws.filter(d => parseTimeToMinutes(d.time) > h1Cutoff && parseTimeToMinutes(d.time) <= 19 * 60 + 30);
      if (p2.length > 0) resultsStore[today]['triple-chance-2'].draws = JSON.parse(JSON.stringify(p2));
    }
  }

  saveResultsToDisk();

  // Ejecutar primera carga silenciosa al iniciar
  setTimeout(() => {
    syncAllTop10();
  }, 2000);

  // Programador: evalúa cada 30 segundos si coincide con el horario T+2 minutos
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(checkScheduledDraws, 30000);

  console.log(`[LotteryEngine] Motor de Loterías iniciado con éxito. Catálogo activo con ${catalog.length} loterías registradas.`);
}

function getTop10Results() {
  const today = getVenezuelaDateString();
  const todayData = resultsStore[today] || {};
  const catalog = getLotteryCatalog();
  return catalog.map(game => {
    const data = todayData[game.id] || {
      gameId: game.id,
      id: game.id,
      name: game.name,
      shortName: game.shortName,
      type: game.type,
      icon: game.icon,
      logoUrl: game.logoUrl || '',
      color: game.color,
      lastUpdated: new Date().toISOString(),
      draws: (game.hours || []).map(h => ({ time: h, isPending: true }))
    };
    data.id = game.id;
    data.gameId = game.id;
    data.type = game.type || data.type;
    data.hours = (game.hours && game.hours.length > 0) ? game.hours : (data.hours || []);
    data.shortName = game.shortName || data.shortName;
    data.logoUrl = game.logoUrl || data.logoUrl;
    data.icon = game.icon || data.icon;
    data.color = game.color || data.color;
    data.name = game.name || data.name;
    return data;
  });
}

module.exports = {
  TOP_10_GAMES,
  initLotteryEngine,
  getTop10Results,
  setManualResult,
  syncGame,
  syncAllTop10,
  onResultsUpdate,
  getVenezuelaDateString,
  getLotteryCatalog,
  addLotteryToCatalog,
  updateLotteryInCatalog,
  deleteLotteryFromCatalog
};
