// Puente Automático de Señales Públicas en Vivo (YouTube Live Oficial / Simulcast Abierto)
// Actúa como respaldo inmediato mientras RTN.tv está desactivado y suma hipódromos latinoamericanos en vivo
const fetch = require('node-fetch');

const FETCH_TIMEOUT = 10000;

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
  console.log('🌐 [Public Streams Bridge] Buscando transmisiones hípicas oficiales EN VIVO (YouTube Live / Simulcast Abierto)...');

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
