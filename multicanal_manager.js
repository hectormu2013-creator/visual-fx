// Gestor de Multicanales Preconfigurados y Personalizados (4 en 1) para Agencias Fénix
// Prioriza los ~10 hipódromos favoritos en Venezuela y evita combinaciones duplicadas.

// Orden de preferencia de hipódromos en Venezuela (USA / Canadá)
const VENEZUELA_US_FAVORITES = [
  'gulfstream-park',        // 1. Gulfstream Park (Favorito #1 en Venezuela)
  'saratoga',               // 2. NYRA Saratoga
  'belmont-park',           // 3. NYRA Belmont Park
  'aqueduct-racetrack',     // 4. NYRA Aqueduct
  'laurel-park',            // 5. Laurel Park
  'tampa-bay-downs',        // 6. Tampa Bay Downs
  'parx-racing',            // 7. Parx Racing
  'finger-lakes',           // 8. Finger Lakes
  'santa-anita-park',       // 9. Santa Anita Park
  'del-mar',                // 10. Del Mar
  'woodbine',               // 11. Woodbine
  'keeneland',              // 12. Keeneland
  'churchill-downs',        // 13. Churchill Downs
  'mahoning-valley',        // 14. Mahoning Valley
  'thistledown',            // 15. Thistledown
  'horseshoe-indianapolis', // 16. Horseshoe Indianapolis
  'mountaineer-park',       // 17. Mountaineer Park
  'charles-town',           // 18. Charles Town
  'zia-park',               // 19. Zia Park
  'turf-paradise',          // 20. Turf Paradise
  'presque-isle',           // 21. Presque Isle Downs
  'monmouth-park',          // 22. Monmouth Park
  'delaware-park',          // 23. Delaware Park
  'colonial-downs',         // 24. Colonial Downs
  'penn-national',          // 25. Penn National
  'remington-park',         // 26. Remington Park
  'hawthorne'               // 27. Hawthorne
];

// Orden de preferencia de Capital OTB (NY + Costa Este y Lunes a Miércoles: Parx, Finger Lakes, Indiana Grand, Mahoning Valley)
const CAPITAL_OTB_FAVORITES = [
  'parx-racing',
  'finger-lakes',
  'horseshoe-indianapolis',
  'mahoning-valley',
  'aqueduct-racetrack',
  'belmont-park',
  'saratoga',
  'thistledown',
  'gulfstream-park',
  'laurel-park',
  'tampa-bay-downs',
  'delaware-park',
  'monmouth-park',
  'woodbine',
  'keeneland',
  'churchill-downs',
  'zia-park',
  'turf-paradise',
  'mountaineer-park',
  'charles-town',
  'santa-anita-park',
  'del-mar'
];

// Hipódromos Nacionales comercializados en Venezuela (INH)
const LATAM_FAVORITES = [
  'la-rinconada',
  'hipodromo-valencia'
];

// Almacén en memoria de Multicanales personalizados creados por agencias hoy
const customMulticanalesMap = new Map();
let customCounter = 1;

function shortTrackName(name = '') {
  return name
    .replace(/^Hipódromo\s+(de\s+)?/i, '')
    .replace(/\s+Racetrack$/i, '')
    .replace(/\s+Race\s+Course$/i, '')
    .replace(/\s+Park$/i, '')
    .replace(/\s+Downs$/i, '')
    .replace(/^Horseshoe\s+/i, '')
    .replace(/^Teletrak\s*\/\s*/i, '')
    .trim();
}

function buildSummaryText(trackIds, catalogMap) {
  return trackIds
    .map(id => {
      const ch = catalogMap.get(id);
      return ch ? shortTrackName(ch.name) : id;
    })
    .join(' • ');
}

function normalizeCombinationKey(trackIds) {
  return [...trackIds].slice(0, 4).sort().join('|');
}

/**
 * Sincroniza los Multicanales Preconfigurados y Personalizados dentro del catálogo de canales.
 */
function syncMulticanalChannels(channelsCatalog) {
  const catalogMap = new Map();
  for (const ch of channelsCatalog) {
    if (!ch.isMulticanal && ch.id !== 'capital-otb') {
      catalogMap.set(ch.id, ch);
    }
  }

  const FILLER_24_7_IDS = new Set(['vsin', 'horse-tv', 'sky-racing-1', 'equidia-hd', 'tjk-tv', 'turf-movil']);
  const activeIndividual = Array.from(catalogMap.values()).filter(
    c => c.onAir && !FILLER_24_7_IDS.has(c.id)
  );

  // 1. Selección para Capital OTB Multicanal (Prioriza pistas de NY/Costa Este con carreras programadas hoy)
  const cotbSorted = [...activeIndividual].sort((a, b) => {
    const aUsToday = (a.streamUrl && a.streamUrl.includes('ws.rcncdn.com') && a.activeToday !== false) ? 0 : 1;
    const bUsToday = (b.streamUrl && b.streamUrl.includes('ws.rcncdn.com') && b.activeToday !== false) ? 0 : 1;
    if (aUsToday !== bUsToday) return aUsToday - bUsToday;
    const idxA = CAPITAL_OTB_FAVORITES.indexOf(a.id);
    const idxB = CAPITAL_OTB_FAVORITES.indexOf(b.id);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  // 2. Selección de Favoritos de Venezuela (Prioriza Gulfstream, NYRA, Laurel, Tampa, Parx, Finger Lakes, Santa Anita, etc.)
  const venUsSorted = [...activeIndividual]
    .filter(c => VENEZUELA_US_FAVORITES.includes(c.id))
    .sort((a, b) => VENEZUELA_US_FAVORITES.indexOf(a.id) - VENEZUELA_US_FAVORITES.indexOf(b.id));

  // 3. Selección de Pistas con Carreras Hoy ordenadas por Favoritos de Venezuela
  const venTodaySorted = [...activeIndividual]
    .filter(c => VENEZUELA_US_FAVORITES.includes(c.id))
    .sort((a, b) => {
      const aToday = a.activeToday !== false ? 0 : 1;
      const bToday = b.activeToday !== false ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return VENEZUELA_US_FAVORITES.indexOf(a.id) - VENEZUELA_US_FAVORITES.indexOf(b.id);
    });

  // 4. Selección Latinoamericana / Caribe en vivo
  const latamActive = [...activeIndividual]
    .filter(c => LATAM_FAVORITES.includes(c.id))
    .sort((a, b) => LATAM_FAVORITES.indexOf(a.id) - LATAM_FAVORITES.indexOf(b.id));

  const presets = [];
  const vetDay = new Date(Date.now() - 4 * 3600 * 1000).getUTCDay();
  const isMonWed = (vetDay >= 1 && vetDay <= 3);

  function addOfficialMultivisual(id, name, flag, location, preferredIds, fallbackPool, badgeLabel) {
    const validIds = [];
    // 1. Primero elegir de preferredIds los que están EN VIVO (onAir = true) ahora mismo
    for (const t of preferredIds) {
      const tid = typeof t === 'string' ? t : t?.id;
      const ch = tid ? catalogMap.get(tid) : null;
      if (ch && ch.onAir && !validIds.includes(tid)) {
        validIds.push(tid);
      }
      if (validIds.length === 4) break;
    }
    // 2. Si faltan para llegar a 4, completar con pistas EN VIVO (onAir = true) del fallbackPool
    if (validIds.length < 4) {
      for (const fb of fallbackPool) {
        const tid = typeof fb === 'string' ? fb : fb?.id;
        const ch = tid ? catalogMap.get(tid) : null;
        if (ch && ch.onAir && !validIds.includes(tid)) {
          validIds.push(tid);
        }
        if (validIds.length === 4) break;
      }
    }
    // 3. Si hay menos de 4 hipódromos en vivo en todo el sistema, completar con los preferidos programados del día
    if (validIds.length < 4) {
      for (const t of preferredIds) {
        const tid = typeof t === 'string' ? t : t?.id;
        if (tid && catalogMap.has(tid) && !validIds.includes(tid)) {
          validIds.push(tid);
        }
        if (validIds.length === 4) break;
      }
    }
    if (validIds.length === 0) return;

    const summary = buildSummaryText(validIds, catalogMap);
    const streamUrl = `/capital-otb.html?tracks=${encodeURIComponent(validIds.join(','))}&title=${encodeURIComponent(name)}`;

    presets.push({
      id,
      name,
      flag,
      location,
      type: 'iframe',
      isMulticanal: true,
      isPresetMulticanal: true,
      multicanalTracks: validIds,
      multicanalSummary: summary,
      streamUrl,
      iframeUrl: streamUrl,
      onAir: true,
      activeToday: true,
      officialSource: badgeLabel || `${name} Auto-Director`,
      statusText: `4 en 1: ${summary}`,
      nextRace: `Incluye: ${summary}`
    });
  }

  // Programación oficial: SOLO 1 Multivisual automático según el día + el canal Capital OTB
  const dayLabel = isMonWed ? 'Lun-Mié' : 'Jue-Dom';

  // 1. Único Multicanal listo según el día (Lunes a Miércoles vs. Jueves a Domingo)
  const multivisualPreferred = isMonWed
    ? [
        'parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley',
        'thistledown', 'mountaineer-park', 'presque-isle', 'turf-paradise'
      ]
    : [
        ...venTodaySorted.slice(0, 4).map(c => c.id),
        'gulfstream-park', 'belmont-park', 'aqueduct-racetrack', 'saratoga',
        'laurel-park', 'tampa-bay-downs', 'santa-anita-park', 'churchill-downs',
        'keeneland', 'woodbine', 'del-mar', 'oaklawn-park'
      ];

  // 2. Canal Oficial Capital OTB (Circuito NY / Costa Este / OTB)
  const capitalOtbPreferred = [
    ...cotbSorted.slice(0, 4).map(c => c.id),
    'aqueduct-racetrack', 'belmont-park', 'saratoga', 'finger-lakes',
    'parx-racing', 'laurel-park', 'gulfstream-park', 'tampa-bay-downs',
    'horseshoe-indianapolis', 'mahoning-valley', 'woodbine'
  ];

  const generalFallback = [
    ...venTodaySorted.map(c => c.id),
    ...activeIndividual.map(c => c.id),
    'parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley', 'gulfstream-park', 'laurel-park'
  ];

  // Canal 1: Único Multivisual del Día (ID 'multivisual-1')
  addOfficialMultivisual(
    'multivisual-1',
    `Multivisual (${dayLabel})`,
    '📺',
    `Multicanal 4 en 1 • Favoritos ${dayLabel}`,
    multivisualPreferred,
    generalFallback,
    `Multivisual ${dayLabel} Auto-Director`
  );

  // Canal 2: Capital OTB (ID 'capital-otb')
  addOfficialMultivisual(
    'capital-otb',
    'Capital OTB',
    '🏇',
    'Multicanal 4 en 1 • Circuito OTB NY',
    capitalOtbPreferred,
    generalFallback,
    'Capital OTB Auto-Director'
  );

  // Limpiar del catálogo cualquier multicanal viejo (multivisual-2, multivisual-3 o personalizados)
  const activePresetIds = new Set(presets.map(p => p.id));
  for (let i = channelsCatalog.length - 1; i >= 0; i--) {
    const ch = channelsCatalog[i];
    if (ch.isMulticanal && ch.id !== 'capital-otb' && !activePresetIds.has(ch.id)) {
      channelsCatalog.splice(i, 1);
    }
  }

  // Insertar o actualizar los 2 únicos canales multicanal en channelsCatalog
  for (const preset of presets) {
    const existing = channelsCatalog.find(c => c.id === preset.id);
    if (existing) {
      Object.assign(existing, preset);
    } else {
      channelsCatalog.push(preset);
    }
  }

  return presets;
}

/**
 * Reutiliza siempre el Multivisual oficial del día (sin crear multicanales personalizados adicionales).
 */
function createOrReuseMulticanal(channelsCatalog) {
  syncMulticanalChannels(channelsCatalog);
  const officialMulti = channelsCatalog.find(c => c.id === 'multivisual-1') || channelsCatalog.find(c => c.id === 'capital-otb');
  return {
    success: true,
    reused: true,
    channel: officialMulti,
    message: `Multicanal oficial "${officialMulti ? officialMulti.name : 'Multivisual'}" seleccionado.`
  };
}

module.exports = {
  VENEZUELA_US_FAVORITES,
  LATAM_FAVORITES,
  syncMulticanalChannels,
  createOrReuseMulticanal
};
