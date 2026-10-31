// Puente Automático de Señales Públicas en Vivo (YouTube Live Oficial + Señales HLS .m3u8 24/7)
// Opera de forma 100% autónoma sin depender de RTN.tv
const fetch = require('node-fetch');

const FETCH_TIMEOUT = 10000;

// Señales HLS (.m3u8) Directas 24/7 Verificadas (Reproducción nativa en HLS.js sin bloqueos)
const DIRECT_HLS_24_7_CHANNELS = [
  {
    id: 'vsin',
    name: 'VSiN Sports Network',
    flag: '🇺🇸',
    location: 'Las Vegas, Nevada, EE.UU.',
    streamUrl: 'https://vsin-sgrewind.streamguys1.com/scte/live-2k/playlist.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • VSiN HD Directo',
    nextRace: 'Apuestas y Análisis en Directo'
  },
  {
    id: 'sky-racing-1',
    name: 'Sky Racing 1 Simulcast',
    flag: '🇦🇺',
    location: 'Internacional 24/7',
    streamUrl: 'https://636ffd31f0e12.streamlock.net/RacingStream1/RacingStream1/playlist.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Sky Racing HD',
    nextRace: 'Carreras Internacionales en Vivo'
  },
  {
    id: 'turf-movil',
    name: 'Teletrak / Turf Chile HD',
    flag: '🇨🇱',
    location: 'Santiago, Chile',
    streamUrl: 'https://tvturf4.janus.cl/playlist/stream.m3u8?d=w&id=',
    type: 'hls',
    statusText: 'En Vivo • Teletrak Red Hípica HD',
    nextRace: 'Jornada Hípica en Directo'
  },
  {
    id: 'equidia-hd',
    name: 'Equidia Racing HD',
    flag: '🇫🇷',
    location: 'París, Francia',
    streamUrl: 'https://raw.githubusercontent.com/Paradise-91/ParaTV/main/streams/equidia/live2.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Equidia 1080p HD',
    nextRace: 'Carreras en Vivo • Señal Oficial'
  },
  {
    id: 'tjk-tv',
    name: 'TJK Jockey Club TV',
    flag: '🏇',
    location: 'Simulcast Internacional',
    streamUrl: 'https://tjktv-live.tjk.org/tjktv.m3u8',
    type: 'hls',
    statusText: 'En Vivo 24/7 • Jockey Club 1080p HD',
    nextRace: 'Carreras en Directo'
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

// Consultas dirigidas para detectar transmisiones EN VIVO reales (sp=EgJAAQ%3D%3D = filtro LIVE de YouTube)
const LIVE_SEARCH_TARGETS = [
  {
    query: 'America\'s Day at the Races NYRA live',
    assignTo: [
      { id: 'aqueduct-racetrack', name: 'Aqueduct Racetrack', flag: '🇺🇸', location: 'Queens, New York, EE.UU.', matchKeywords: ['america', 'nyra', 'aqueduct', 'belmont', 'saratoga'] },
      { id: 'belmont-park', name: 'Belmont Park', flag: '🇺🇸', location: 'Elmont, New York, EE.UU.', matchKeywords: ['america', 'nyra', 'belmont', 'aqueduct'] }
    ]
  },
  {
    query: 'Hipodromo en vivo',
    assignTo: [
      { id: 'hipodromo-valencia', name: 'Hipódromo de Valencia', flag: '🇻🇪', location: 'Valencia, Venezuela', matchKeywords: ['valencia'] },
      { id: 'hipodromo-camarero', name: 'Hipódromo Camarero', flag: '🇵🇷', location: 'Canóvanas, Puerto Rico', matchKeywords: ['camarero'] },
      { id: 'hipodromo-palermo', name: 'Hipódromo de Palermo', flag: '🇦🇷', location: 'Buenos Aires, Argentina', matchKeywords: ['palermo'] },
      { id: 'la-rinconada', name: 'La Rinconada', flag: '🇻🇪', location: 'Caracas, Venezuela', matchKeywords: ['rinconada', 'inh'] },
      { id: 'hipodromo-monterrico', name: 'Hipódromo de Monterrico', flag: '🇵🇪', location: 'Lima, Perú', matchKeywords: ['monterrico'] },
      { id: 'hipodromo-las-piedras', name: 'Hipódromo Las Piedras', flag: '🇺🇾', location: 'Las Piedras, Uruguay', matchKeywords: ['piedras', 'maroñas', 'uruguay'] }
    ]
  },
  {
    query: 'Woodbine Racetrack live',
    assignTo: [
      { id: 'woodbine', name: 'Woodbine', flag: '🇨🇦', location: 'Toronto, Ontario, Canadá', matchKeywords: ['woodbine'] }
    ]
  },
  {
    query: 'Keeneland Breeders Cup live',
    assignTo: [
      { id: 'keeneland', name: 'Keeneland', flag: '🇺🇸', location: 'Lexington, Kentucky, EE.UU.', matchKeywords: ['keeneland', 'breeders', 'horse racing'] },
      { id: 'churchill-downs', name: 'Churchill Downs', flag: '🇺🇸', location: 'Louisville, Kentucky, EE.UU.', matchKeywords: ['churchill', 'breeders', 'keeneland', 'horse racing'] }
    ]
  },
  {
    query: 'Gulfstream Park live',
    assignTo: [
      { id: 'gulfstream-park', name: 'Gulfstream Park', flag: '🇺🇸', location: 'Hallandale Beach, Florida, EE.UU.', matchKeywords: ['gulfstream', 'hipica', 'horse racing', 'breeders', 'live'] }
    ]
  },
  {
    query: 'Laurel Park Santa Anita Parx live horse racing',
    assignTo: [
      { id: 'laurel-park', name: 'Laurel Park', flag: '🇺🇸', location: 'Laurel, Maryland, EE.UU.', matchKeywords: ['laurel', 'maryland', 'horse racing', 'live'] },
      { id: 'santa-anita-park', name: 'Santa Anita Park', flag: '🇺🇸', location: 'Arcadia, California, EE.UU.', matchKeywords: ['santa anita', 'quigley', 'horse racing', 'breeders'] },
      { id: 'parx-racing', name: 'Parx Racing', flag: '🇺🇸', location: 'Bensalem, Pennsylvania, EE.UU.', matchKeywords: ['parx', 'philadelphia', 'horse racing', 'live'] }
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
  console.log('🌐 [Public Streams Bridge] Sincronizando señales hípicas abiertas (YouTube Live + HLS 24/7)...');

  // 1. Cargar canales HLS (.m3u8) 24/7 verificados
  for (const hlsCh of DIRECT_HLS_24_7_CHANNELS) {
    activeStreams[hlsCh.id] = {
      ...hlsCh,
      trackName: hlsCh.name,
      onAir: true
    };
  }

  // 2. Detectar hipódromos transmitiendo en vivo ahora mismo
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
        if (/railcam|train|airport|aeropuerto|sleep|insomnia|music|santa claus|furniture|football|minecraft|roblox/i.test(combined)) {
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
          statusText: `En Vivo • ${matchedVideo.channel || 'Señal Abierta HD'}`,
          nextRace: matchedVideo.title.substring(0, 58)
        };
        console.log(`✅ [Public Streams] '${target.name}' EN VIVO -> [${matchedVideo.videoId}] ${matchedVideo.title}`);
      }
    }
  }

  return activeStreams;
}

module.exports = {
  fetchPublicLiveStreams
};
