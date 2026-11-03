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
    for (const t of preferredIds) {
      const tid = typeof t === 'string' ? t : t?.id;
      if (tid && catalogMap.has(tid) && !validIds.includes(tid)) {
        validIds.push(tid);
      }
      if (validIds.length === 4) break;
    }
    if (validIds.length < 4) {
      for (const fb of fallbackPool) {
        const tid = typeof fb === 'string' ? fb : fb?.id;
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

  // Programación oficial diferenciada para los 3 canales Multivisual (con Auto-Director Capital OTB)
  const mv1Preferred = isMonWed
    ? ['parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley']
    : [
        ...venTodaySorted.slice(0, 4).map(c => c.id),
        'gulfstream-park', 'laurel-park', 'belmont-park', 'aqueduct-racetrack', 'tampa-bay-downs', 'parx-racing'
      ];

  const mv2Preferred = isMonWed
    ? ['horseshoe-indianapolis', 'mountaineer-park', 'thistledown', 'presque-isle', 'turf-paradise', 'zia-park']
    : [
        'santa-anita-park', 'woodbine', 'keeneland', 'churchill-downs', 'del-mar', 'oaklawn-park', 'fair-grounds', 'saratoga'
      ];

  const mv3Preferred = isMonWed
    ? ['la-rinconada', 'gulfstream-park', 'laurel-park', 'santa-anita-park', 'tampa-bay-downs', 'woodbine']
    : [
        ...latamActive.map(c => c.id),
        'la-rinconada', 'del-mar', 'tampa-bay-downs', 'parx-racing', 'finger-lakes', 'colonial-downs', 'delaware-park'
      ];

  const generalFallback = [
    ...venTodaySorted.map(c => c.id),
    ...activeIndividual.map(c => c.id),
    'parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley', 'gulfstream-park', 'laurel-park'
  ];

  // 1. Multivisual1 (Mantiene ID 'capital-otb' para compatibilidad automática con todas las TVs existentes)
  addOfficialMultivisual(
    'capital-otb',
    'Multivisual1',
    '📺',
    'Multicanal 4 en 1 • Principal USA',
    mv1Preferred,
    generalFallback,
    'Multivisual1 Auto-Director'
  );

  // 2. Multivisual2
  addOfficialMultivisual(
    'multivisual-2',
    'Multivisual2',
    '📺',
    'Multicanal 4 en 1 • Circuito 2 USA',
    mv2Preferred,
    generalFallback,
    'Multivisual2 Auto-Director'
  );

  // 3. Multivisual3
  addOfficialMultivisual(
    'multivisual-3',
    'Multivisual3',
    '📺',
    'Multicanal 4 en 1 • Circuito 3 / Mixto',
    mv3Preferred,
    generalFallback,
    'Multivisual3 Auto-Director'
  );

  // Agregar también los Multicanales personalizados creados por agencias (si sus pistas siguen activas)
  for (const [customId, customDef] of customMulticanalesMap.entries()) {
    const validIds = customDef.tracks.filter(tid => catalogMap.has(tid));
    if (validIds.length >= 2) {
      const summary = buildSummaryText(validIds, catalogMap);
      const streamUrl = `/capital-otb.html?tracks=${encodeURIComponent(validIds.join(','))}&title=${encodeURIComponent(customDef.name)}`;
      presets.push({
        id: customId,
        name: customDef.name,
        flag: '📺',
        location: 'Multicanal 4 en 1 • Creado por Agencia',
        type: 'iframe',
        isMulticanal: true,
        isPresetMulticanal: false,
        multicanalTracks: validIds,
        multicanalSummary: summary,
        streamUrl,
        iframeUrl: streamUrl,
        onAir: true,
        activeToday: true,
        officialSource: 'Multicanal Personalizado Fénix',
        statusText: `4 en 1: ${summary}`,
        nextRace: `Incluye: ${summary}`
      });
    }
  }

  // Limpiar del catálogo cualquier multicanal dinámico viejo que ya no esté en presets
  const activePresetIds = new Set(presets.map(p => p.id));
  for (let i = channelsCatalog.length - 1; i >= 0; i--) {
    const ch = channelsCatalog[i];
    if (ch.isMulticanal && ch.id !== 'capital-otb' && !activePresetIds.has(ch.id)) {
      channelsCatalog.splice(i, 1);
    }
  }

  // Insertar o actualizar cada Multicanal en channelsCatalog
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
 * Crea o reutiliza un Multicanal de 4 pistas solicitado por una agencia.
 * Si ya existe un Multicanal con esas mismas 4 pistas, lo reutiliza para no multiplicar combinaciones.
 */
function createOrReuseMulticanal(channelsCatalog, requestedTracks = [], customTitle = '') {
  const cleanTracks = [...new Set((requestedTracks || []).map(t => String(t || '').trim()).filter(Boolean))].slice(0, 4);
  if (cleanTracks.length < 2) {
    return { success: false, error: 'Seleccione al menos 2 hipódromos (idealmente 4) para armar el Multicanal.' };
  }

  // Sincronizar primero para tener los presets al día
  syncMulticanalChannels(channelsCatalog);

  const requestedKey = normalizeCombinationKey(cleanTracks);
  const existingMulti = channelsCatalog.find(
    c => (c.isMulticanal || c.id === 'capital-otb') && c.onAir && Array.isArray(c.multicanalTracks) && normalizeCombinationKey(c.multicanalTracks) === requestedKey
  );

  // Si ya existe esa combinación de 4 hipódromos, reutilizarla ( actualizando el orden si la agencia lo pidió en orden específico )
  if (existingMulti) {
    const catalogMap = new Map(channelsCatalog.map(c => [c.id, c]));
    const summary = buildSummaryText(cleanTracks, catalogMap);
    existingMulti.multicanalTracks = cleanTracks;
    existingMulti.multicanalSummary = summary;
    existingMulti.statusText = `4 en 1: ${summary}`;
    existingMulti.nextRace = `Incluye: ${summary}`;
    existingMulti.streamUrl = `/capital-otb.html?tracks=${encodeURIComponent(cleanTracks.join(','))}&title=${encodeURIComponent(existingMulti.name)}`;
    existingMulti.iframeUrl = existingMulti.streamUrl;

    return {
      success: true,
      reused: true,
      channel: existingMulti,
      message: `Esta combinación ya estaba disponible en "${existingMulti.name}". Se seleccionó automáticamente.`
    };
  }

  // Limitar a máximo 8 multicanales personalizados en memoria para mantener la lista limpia
  if (customMulticanalesMap.size >= 8) {
    const oldestKey = customMulticanalesMap.keys().next().value;
    customMulticanalesMap.delete(oldestKey);
  }

  const num = customCounter++;
  const id = `multicanal-agencia-${num}`;
  const name = (customTitle && customTitle.trim())
    ? `Multicanal • ${customTitle.trim().slice(0, 26)}`
    : `Multicanal Personalizado #${num}`;

  customMulticanalesMap.set(id, {
    id,
    name,
    tracks: cleanTracks,
    createdAt: new Date().toISOString()
  });

  syncMulticanalChannels(channelsCatalog);
  const created = channelsCatalog.find(c => c.id === id);

  return {
    success: true,
    reused: false,
    channel: created,
    message: `Canal "${name}" creado y disponible en la lista para todas las pantallas.`
  };
}

module.exports = {
  VENEZUELA_US_FAVORITES,
  LATAM_FAVORITES,
  syncMulticanalChannels,
  createOrReuseMulticanal
};
