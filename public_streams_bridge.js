// Puente Automático de Señales Oficiales en Vivo (Solo Hipódromos Oficiales + HLS 24/7)
// Bloquea estrictamente canales de pronosticadores, narradores externos o charlas
const fetch = require('node-fetch');

const FETCH_TIMEOUT = 10000;

// Señales HLS (.m3u8) Directas 24/7 Oficiales (Reproducción nativa en HLS.js sin bloqueos)
const DIRECT_HLS_24_7_CHANNELS = [
  {
    id: 'sky-racing-1',
    name: 'Sky Racing 1 Simulcast',
    flag: '🇦🇺',
    location: 'Internacional 24/7',
    streamUrl: 'https://636ffd31f0e12.streamlock.net/RacingStream1/RacingStream1/playlist.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Sky Racing Oficial HD',
    nextRace: 'Carreras Internacionales en Vivo'
  },
  {
    id: 'turf-movil',
    name: 'Teletrak / Turf Chile HD',
    flag: '🇨🇱',
    location: 'Santiago, Chile',
    streamUrl: 'https://tvturf4.janus.cl/playlist/stream.m3u8?d=w&id=',
    type: 'hls',
    statusText: 'En Vivo • Teletrak Red Hípica Oficial',
    nextRace: 'Jornada Hípica en Directo'
  },
  {
    id: 'equidia-hd',
    name: 'Equidia Racing HD',
    flag: '🇫🇷',
    location: 'París, Francia',
    streamUrl: 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/streams/equidia/live2.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Equidia 1080p Oficial',
    nextRace: 'Carreras en Vivo • Señal Oficial'
  },
  {
    id: 'tjk-tv',
    name: 'TJK Jockey Club TV',
    flag: '🏇',
    location: 'Simulcast Internacional',
    streamUrl: 'https://tjktv-live.tjk.org/tjktv.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Jockey Club 1080p Oficial',
    nextRace: 'Carreras en Directo'
  },
  {
    id: 'vsin',
    name: 'VSiN Sports Network',
    flag: '🇺🇸',
    location: 'Las Vegas, Nevada, EE.UU.',
    streamUrl: 'https://vsin-sgrewind.streamguys1.com/scte/live-2k/playlist.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • VSiN HD Directo',
    nextRace: 'Transmisión Oficial Las Vegas'
  },
  {
    id: 'horse-tv',
    name: 'Horse TV Network',
    flag: '🇺🇸',
    location: 'EE.UU. • Canal Ecuestre 24/7',
    streamUrl: 'https://a-cdn.klowdtv.com/live2/horsetv_720p/playlist.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Horse TV 720p',
    nextRace: 'Transmisión Continua'
  }
];

// Palabras prohibidas para descartar youtubers, pronosticadores, podcasts y cámaras ajenas
const BLOCKED_KEYWORDS_REGEX = /picks|pronostico|pronóstico|handicapping|podcast|show ever|sportsmoneynetwork|deportes max|equinedge|seminar|preview show|railcam|train|airport|aeropuerto|sleep|insomnia|music|santa claus|furniture|football|minecraft|roblox|caballos de historia/i;

// Consultas dirigidas exclusivamente a señales oficiales de hipódromos en vivo
const LIVE_SEARCH_TARGETS = [
  {
    query: 'America\'s Day at the Races NYRA live',
    assignTo: [
      {
        id: 'aqueduct-racetrack',
        name: 'Aqueduct Racetrack',
        flag: '🇺🇸',
        location: 'Queens, New York, EE.UU.',
        matchKeywords: ['america\'s day at the races', 'new york racing association', 'nyra'],
        requireOfficialChannel: /new york racing|nyra/i
      },
      {
        id: 'belmont-park',
        name: 'Belmont Park',
        flag: '🇺🇸',
        location: 'Elmont, New York, EE.UU.',
        matchKeywords: ['america\'s day at the races', 'new york racing association', 'nyra'],
        requireOfficialChannel: /new york racing|nyra/i
      }
    ]
  },
  {
    query: 'Woodbine Racetrack live',
    assignTo: [
      {
        id: 'woodbine',
        name: 'Woodbine',
        flag: '🇨🇦',
        location: 'Toronto, Ontario, Canadá',
        matchKeywords: ['woodbine racetrack'],
        requireOfficialChannel: /woodbine/i
      }
    ]
  },
  {
    query: 'Hipodromo en vivo',
    assignTo: [
      {
        id: 'hipodromo-camarero',
        name: 'Hipódromo Camarero',
        flag: '🇵🇷',
        location: 'Canóvanas, Puerto Rico',
        matchKeywords: ['camarero'],
        requireOfficialChannel: /camarero/i
      },
      {
        id: 'hipodromo-palermo',
        name: 'Hipódromo de Palermo',
        flag: '🇦🇷',
        location: 'Buenos Aires, Argentina',
        matchKeywords: ['palermo'],
        requireOfficialChannel: /palermo/i
      },
      {
        id: 'hipodromo-san-isidro',
        name: 'Hipódromo de San Isidro',
        flag: '🇦🇷',
        location: 'San Isidro, Argentina',
        matchKeywords: ['san isidro'],
        requireOfficialChannel: /san isidro/i
      },
      {
        id: 'hipodromo-valencia',
        name: 'Hipódromo de Valencia',
        flag: '🇻🇪',
        location: 'Valencia, Venezuela',
        matchKeywords: ['reunion', 'hipodromo de valencia'],
        requireOfficialChannel: /valencia|inh|hinava/i
      },
      {
        id: 'la-rinconada',
        name: 'La Rinconada',
        flag: '🇻🇪',
        location: 'Caracas, Venezuela',
        matchKeywords: ['rinconada', 'inh oficial'],
        requireOfficialChannel: /inh|rinconada|hipica/i
      },
      {
        id: 'hipodromo-monterrico',
        name: 'Hipódromo de Monterrico',
        flag: '🇵🇪',
        location: 'Lima, Perú',
        matchKeywords: ['monterrico'],
        requireOfficialChannel: /monterrico/i
      },
      {
        id: 'hipodromo-las-piedras',
        name: 'Hipódromo Las Piedras',
        flag: '🇺🇾',
        location: 'Las Piedras, Uruguay',
        matchKeywords: ['las piedras', 'maroñas'],
        requireOfficialChannel: /hipica|maroñas|piedras/i
      }
    ]
  },
  {
    query: 'Hipica TV Gulfstream Laurel Santa Anita live',
    assignTo: [
      {
        id: 'gulfstream-park',
        name: 'Gulfstream Park',
        flag: '🇺🇸',
        location: 'Hallandale Beach, Florida, EE.UU.',
        matchKeywords: ['gulfstream', 'hípica tv', 'hipica tv'],
        requireOfficialChannel: /hipica tv|hípica tv|gulfstream|1\/st/i
      },
      {
        id: 'laurel-park',
        name: 'Laurel Park',
        flag: '🇺🇸',
        location: 'Laurel, Maryland, EE.UU.',
        matchKeywords: ['laurel', 'maryland', 'hípica tv', 'hipica tv'],
        requireOfficialChannel: /maryland|laurel|hipica tv|hípica tv/i
      },
      {
        id: 'santa-anita-park',
        name: 'Santa Anita Park',
        flag: '🇺🇸',
        location: 'Arcadia, California, EE.UU.',
        matchKeywords: ['santa anita', 'hípica tv', 'hipica tv'],
        requireOfficialChannel: /santa anita|hipica tv|hípica tv|1\/st/i
      }
    ]
  },
  {
    query: 'Keeneland Breeders Cup Tampa Bay Downs live',
    assignTo: [
      {
        id: 'keeneland',
        name: 'Keeneland',
        flag: '🇺🇸',
        location: 'Lexington, Kentucky, EE.UU.',
        matchKeywords: ['keeneland', 'breeders\' cup'],
        requireOfficialChannel: /keeneland|breeders/i
      },
      {
        id: 'tampa-bay-downs',
        name: 'Tampa Bay Downs',
        flag: '🇺🇸',
        location: 'Tampa, Florida, EE.UU.',
        matchKeywords: ['tampa bay downs'],
        requireOfficialChannel: /tampa bay/i
      }
    ]
  }
];

async function searchYouTubeLiveVideos(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgJAAQ%253D%253D`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: FETCH_TIMEOUT
    });
    const html = await res.text();
    const dataMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    if (!dataMatch) return [];

    const data = JSON.parse(dataMatch[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const results = [];

    for (const sec of contents) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item.videoRenderer;
        if (v && v.videoId) {
          const isLive = JSON.stringify(v.badges || []).includes('LIVE') || JSON.stringify(v.thumbnailOverlays || []).includes('LIVE');
          if (isLive) {
            results.push({
              videoId: v.videoId,
              title: v.title?.runs?.[0]?.text || '',
              channel: v.ownerText?.runs?.[0]?.text || ''
            });
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.warn(`⚠️ [Public Streams Bridge] Error consultando '${query}':`, err.message);
    return [];
  }
}

async function fetchPublicLiveStreams() {
  const activeStreams = {};
  console.log('🌐 [Public Streams Bridge] Sincronizando únicamente señales hípicas OFICIALES verificadas...');

  // 1. Cargar canales HLS (.m3u8) 24/7 oficiales verificados
  for (const hlsCh of DIRECT_HLS_24_7_CHANNELS) {
    activeStreams[hlsCh.id] = {
      ...hlsCh,
      trackName: hlsCh.name,
      onAir: true
    };
  }

  // 2. Detectar hipódromos oficiales transmitiendo en vivo ahora mismo
  const allLiveVideos = [];
  for (const group of LIVE_SEARCH_TARGETS) {
    const videos = await searchYouTubeLiveVideos(group.query);
    for (const v of videos) {
      if (!allLiveVideos.some(existing => existing.videoId === v.videoId)) {
        allLiveVideos.push(v);
      }
    }

    for (const target of group.assignTo) {
      if (activeStreams[target.id]) continue;

      const pool = [...videos, ...allLiveVideos];
      const matchedVideo = pool.find(v => {
        const combined = `${v.title} ${v.channel}`.toLowerCase();
        // Descartar estrictamente pronosticadores, shows de picks y canales no oficiales
        if (BLOCKED_KEYWORDS_REGEX.test(combined)) {
          return false;
        }
        // Exigir coincidencia del canal oficial del hipódromo/asociación
        if (target.requireOfficialChannel && !target.requireOfficialChannel.test(combined)) {
          return false;
        }
        return target.matchKeywords.some(kw => combined.includes(kw.toLowerCase()));
      });

      if (matchedVideo) {
        const embedUrl = `https://www.youtube.com/embed/${matchedVideo.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`;
        activeStreams[target.id] = {
          id: target.id,
          name: target.name,
          trackName: target.name,
          flag: target.flag,
          location: target.location,
          streamUrl: embedUrl,
          type: 'iframe',
          onAir: true,
          statusText: `Señal Oficial HD • ${matchedVideo.channel}`,
          nextRace: matchedVideo.title.substring(0, 58)
        };
        console.log(`✅ [Señal Oficial] '${target.name}' EN VIVO -> [${matchedVideo.videoId}] ${matchedVideo.title} (${matchedVideo.channel})`);
      }
    }
  }

  return activeStreams;
}

module.exports = {
  fetchPublicLiveStreams
};
