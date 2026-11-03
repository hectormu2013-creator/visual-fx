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

// Orden de preferencia de Capital OTB (NY + Costa Este primero)
const CAPITAL_OTB_FAVORITES = [
  'aqueduct-racetrack',
  'belmont-park',
  'saratoga',
  'finger-lakes',
  'parx-racing',
  'mahoning-valley',
  'thistledown',
  'horseshoe-indianapolis',
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

// Hipódromos Sudamericanos y del Caribe favoritos en Venezuela
const LATAM_FAVORITES = [
  'la-rinconada',
  'hipodromo-valencia',
  'hipodromo-camarero',
  'hipodromo-palermo',
  'hipodromo-san-isidro',
  'hipodromo-monterrico',
  'turf-movil',
  'hipodromo-las-piedras'
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
  const usedComboKeys = new Set();

  function addPresetIfUnique(id, name, flag, location, candidateTracks, badgeLabel) {
    const validIds = [];
    for (const t of candidateTracks) {
      const tid = typeof t === 'string' ? t : t?.id;
      if (tid && catalogMap.has(tid) && !validIds.includes(tid)) {
        validIds.push(tid);
      }
      if (validIds.length === 4) break;
    }
    // Rellenar hasta 4 si faltan pistas
    if (validIds.length < 4) {
      for (const fallback of venTodaySorted.concat(activeIndividual)) {
        if (!validIds.includes(fallback.id)) validIds.push(fallback.id);
        if (validIds.length === 4) break;
      }
    }
    if (validIds.length === 0) return;

    const comboKey = normalizeCombinationKey(validIds);
    // Capital OTB siempre se agrega primero; los demás preconfigurados solo si aportan una combinación distinta
    if (id !== 'capital-otb' && usedComboKeys.has(comboKey)) {
      return;
    }
    usedComboKeys.add(comboKey);

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
      officialSource: badgeLabel || 'Mosaico Multicanal 4 en 1',
      statusText: `4 en 1: ${summary}`,
      nextRace: `Incluye: ${summary}`
    });
  }

  // Preset 1: Capital OTB TV Network (Pistas del Día NY / Costa Este)
  addPresetIfUnique(
    'capital-otb',
    'Capital OTB TV Network',
    '🇺🇸',
    'Multicanal 4 en 1 • Jornada del Día',
    cotbSorted.slice(0, 4),
    'Capital OTB Multicanal'
  );

  // Preset 2: Multicanal Favoritos USA (Gulfstream, Laurel, Parx, Finger Lakes / NYRA)
  addPresetIfUnique(
    'multicanal-favoritos-1',
    'Multicanal 1 • Favoritos USA',
    '📺',
    'Multicanal 4 en 1 • Favoritos Venezuela',
    venUsSorted.slice(0, 4),
    'Multicanal Favoritos USA'
  );

  // Preset 3: Multicanal Circuito Americano 2 (Si hay más de 4 pistas de EE.UU. activas hoy)
  if (venTodaySorted.length >= 5) {
    const altTracks = [
      venTodaySorted[0],
      venTodaySorted[1],
      venTodaySorted[4],
      venTodaySorted[5] || venTodaySorted[2]
    ].filter(Boolean);
    addPresetIfUnique(
      'multicanal-favoritos-2',
      'Multicanal 2 • Circuito USA',
      '📺',
      'Multicanal 4 en 1 • Alternativo USA',
      altTracks,
      'Multicanal Circuito USA'
    );
  }

  // Preset 4: Multicanal Mixto (USA + Suramérica/Caribe como Camarero, Palermo, Monterrico, La Rinconada)
  if (latamActive.length > 0) {
    const mixTracks = [
      ...venTodaySorted.slice(0, 2),
      ...latamActive.slice(0, 2)
    ];
    addPresetIfUnique(
      'multicanal-mixto-latam',
      'Multicanal 3 • USA + Suramérica',
      '🌎',
      'Multicanal 4 en 1 • Mixto Internacional',
      mixTracks,
      'Multicanal Mixto'
    );
  }

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
