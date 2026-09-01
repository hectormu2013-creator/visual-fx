// Módulo de Integración Automática RTN.tv (Racetrack Television Network) para Agencias Fénix
const fetch = require('node-fetch');

// Credenciales Oficiales RTN.tv
const RTN_CREDS = {
  loginUrl: 'https://online.rtn.tv/index.php',
  username: process.env.RTN_USER || 'Hector_mu2001@yahoo.com',
  password: process.env.RTN_PASS || 'K!Z9qz$ew2SamCp'
};

// Mapeo de Nombres de Hipódromos RTN a IDs de Visual-FX
const RTN_TRACK_MAP = {
  'aqueduct': 'aqueduct-racetrack',
  'belmont park': 'belmont-park',
  'cal racing': 'cal-racing',
  'capital otb': 'capital-otb',
  'churchill downs': 'churchill-downs',
  'colonial downs': 'colonial-downs',
  'del mar': 'del-mar',
  'delaware park': 'delaware-park',
  'ellis park': 'ellis-park',
  'evangeline downs': 'evangeline-downs',
  'evangeline': 'evangeline-downs',
  'finger lakes': 'finger-lakes',
  'gulfstream park': 'gulfstream-park',
  'gulfstream': 'gulfstream-park',
  'hawthorne': 'hawthorne',
  'palermo': 'hipodromo-palermo',
  'horseshoe indianapolis': 'horseshoe-indianapolis',
  'indiana': 'horseshoe-indianapolis',
  'keeneland': 'keeneland',
  'kentucky downs': 'kentucky-downs',
  'la rinconada': 'la-rinconada',
  'laurel park': 'laurel-park',
  'laurel': 'laurel-park',
  'los alamitos': 'los-alamitos',
  'monmouth park': 'monmouth-park',
  'mountaineer': 'mountaineer-park',
  'mountaineer park': 'mountaineer-park',
  'parx racing': 'parx-racing',
  'parx': 'parx-racing',
  'presque isle': 'presque-isle',
  'santa anita': 'santa-anita-park',
  'saratoga': 'saratoga',
  'tampa bay': 'tampa-bay-downs',
  'thistledown': 'thistledown',
  'jack thistledown': 'thistledown',
  'vsin': 'vsin',
  'woodbine': 'woodbine'
};

async function fetchRtnLiveStreams() {
  console.log('📡 [RTN Bridge] Conectando a RTN.tv con credenciales de Fénix...');
  const activeStreams = {};

  try {
    // 1. Iniciar Sesión en RTN.tv
    const bodyParams = new URLSearchParams();
    bodyParams.append('submitted', 'submitted');
    bodyParams.append('login', RTN_CREDS.username);
    bodyParams.append('password', RTN_CREDS.password);

    const loginRes = await fetch(RTN_CREDS.loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: bodyParams.toString()
    });

    const rawCookies = loginRes.headers.get('set-cookie') || '';
    const cookieHeader = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');

    if (!cookieHeader || !cookieHeader.includes('PHPSESSID')) {
      console.error('⚠️ [RTN Bridge] No se pudo obtener la cookie de sesión de RTN.tv.');
      return activeStreams;
    }

    // 2. Obtener Lista de Hipódromos en Transmisión Hoy
    const dateNow = new Date();
    const yearStr = dateNow.getFullYear();
    const monthStr = String(dateNow.getMonth() + 1).padStart(2, '0');
    const dayStr = String(dateNow.getDate()).padStart(2, '0');
    const isoDateStr = `${yearStr}-${monthStr}-${dayStr}`;

    const trackListParams = new URLSearchParams();
    trackListParams.append('pageQueue', 'page_selecttrack|page_live');
    trackListParams.append('racedate', isoDateStr);
    trackListParams.append('today', 'true');

    const tracksRes = await fetch(RTN_CREDS.loginUrl, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: trackListParams.toString()
    });

    const tracksHtml = await tracksRes.text();

    // 3. Extraer metadata de cada hipódromo activo usando Regex en data-linkInfo
    const linkInfoMatches = tracksHtml.match(/data-linkInfo=(['"])([\s\S]*?)\1/gi) || [];

    for (const matchStr of linkInfoMatches) {
      try {
        const jsonText = matchStr.replace(/^data-linkInfo=['"]/, '').replace(/['"]$/, '');
        const info = JSON.parse(jsonText);
        if (!info.trackName) continue;

        const trackNameLower = (info.trackName || '').toLowerCase().trim();

        // Buscar correspondencia con Visual-FX
        let matchedId = null;
        for (const [key, val] of Object.entries(RTN_TRACK_MAP)) {
          if (trackNameLower.includes(key)) {
            matchedId = val;
            break;
          }
        }

        if (matchedId) {
          // 4. Solicitar el reproductor en vivo para este hipódromo
          const playerParams = new URLSearchParams();
          playerParams.append('pageQueue', 'page_live');
          playerParams.append('trackName', info.trackName);
          playerParams.append('format', info.format || 'flash');
          playerParams.append('breed', info.breed || 'NotGH');
          playerParams.append('tc3', info.tc3 || '');
          playerParams.append('tc2', info.tc2 || '');
          playerParams.append('racedate', info.racedate || isoDateStr);
          playerParams.append('asfFileName', info.asfFileName || '');
          if (info.tfid) playerParams.append('tfid', info.tfid);

          const playerRes = await fetch(RTN_CREDS.loginUrl, {
            method: 'POST',
            headers: {
              'Cookie': cookieHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: playerParams.toString()
          });

          const playerHtml = await playerRes.text();
          const iframeMatch = playerHtml.match(/iframe\s+src=['"]([^'"]+)['"]/i);

          if (iframeMatch && iframeMatch[1]) {
            const streamUrl = iframeMatch[1].replace(/&amp;/g, '&');
            activeStreams[matchedId] = {
              streamUrl,
              type: 'iframe',
              trackName: info.trackName
            };
            console.log(`✅ [RTN Bridge] Señal obtenida para '${matchedId}' (${info.trackName}): ${streamUrl.substring(0, 75)}...`);
          }
        }
      } catch (err) {
        // Ignorar errores de parseo individuales
      }
    }
  } catch (e) {
    console.error('❌ [RTN Bridge] Error consultando transmisiones RTN.tv:', e.message);
  }

  return activeStreams;
}

module.exports = {
  fetchRtnLiveStreams
};
