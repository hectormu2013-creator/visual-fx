// Gestor de Multicanales Preconfigurados y Personalizados (4 en 1) para Agencias Fénix
// Prioriza los ~10 hipódromos favoritos en Venezuela y evita combinaciones duplicadas.

const { isTrackCardFinished } = require('./multicanal_director');

// Orden de preferencia de hipódromos en Venezuela (USA / Canadá / Triple7)
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
  'will-rogers-downs',      // 17. Will Rogers Downs
  'mountaineer-park',       // 18. Mountaineer Park
  'charles-town',           // 19. Charles Town
  'delta-downs',            // 20. Delta Downs
  'evangeline-downs',       // 21. Evangeline Downs
  'remington-park',         // 22. Remington Park
  'lone-star-park',         // 23. Lone Star Park
  'penn-national',          // 24. Penn National
  'zia-park',               // 25. Zia Park
  'los-alamitos',           // 26. Los Alamitos
  'turfway-park',           // 27. Turfway Park
  'turf-paradise',          // 28. Turf Paradise
  'presque-isle',           // 29. Presque Isle Downs
  'oaklawn-park',           // 30. Oaklawn Park
  'fair-grounds',           // 31. Fair Grounds
  'sam-houston',            // 32. Sam Houston
  'monmouth-park',          // 33. Monmouth Park
  'delaware-park',          // 34. Delaware Park
  'colonial-downs',         // 35. Colonial Downs
  'hawthorne',              // 36. Hawthorne
  // Carretas / Internacional Triple7
  'meadowlands',
  'woodbine-harness',
  'hoosier-park',
  'yonkers-raceway',
  'pocono-downs',
  'northfield-park',
  'dayton-raceway',
  'dover-downs',
  'australia-flemington'
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
    // 1. Primero elegir de preferredIds los que están EN VIVO con video directo (type !== 'iframe')
    for (const t of preferredIds) {
      const tid = typeof t === 'string' ? t : t?.id;
      const ch = tid ? catalogMap.get(tid) : null;
      if (ch && ch.onAir && ch.type !== 'iframe' && !validIds.includes(tid)) {
        validIds.push(tid);
      }
      if (validIds.length === 4) break;
    }
    // 2. Si faltan para llegar a 4, completar con pistas EN VIVO con video directo (type !== 'iframe') del fallbackPool
    if (validIds.length < 4) {
      for (const fb of fallbackPool) {
        const tid = typeof fb === 'string' ? fb : fb?.id;
        const ch = tid ? catalogMap.get(tid) : null;
        if (ch && ch.onAir && ch.type !== 'iframe' && !validIds.includes(tid)) {
          validIds.push(tid);
        }
        if (validIds.length === 4) break;
      }
    }
    // 3. Si aún faltan, aceptar cualquier pista EN VIVO (incluyendo iframe) de preferredIds o fallbackPool
    if (validIds.length < 4) {
      for (const t of [...preferredIds, ...fallbackPool]) {
        const tid = typeof t === 'string' ? t : t?.id;
        const ch = tid ? catalogMap.get(tid) : null;
        if (ch && ch.onAir && !validIds.includes(tid)) {
          validIds.push(tid);
        }
        if (validIds.length === 4) break;
      }
    }
    // 4. Si hay menos de 4 hipódromos en vivo en todo el sistema, completar con los preferidos programados del día
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

  // Programación oficial: 3 Multicanales Automáticos (Multivisual 1, Multivisual 2 y Capital OTB)
  const vetHour = new Date(Date.now() - 4 * 3600 * 1000).getUTCHours();
  const dayLabel = isMonWed ? 'Lun-Mié' : 'Jue-Dom';

  // Ordenar todas las pistas activas priorizando aquellas con flujo directo (HLS/fMP4) y cuya jornada NO haya terminado
  const directActiveSorted = [...activeIndividual]
    .filter(c => c.type !== 'iframe' && c.streamUrl)
    .sort((a, b) => {
      let finA = 0, finB = 0;
      try { finA = isTrackCardFinished(a.id) ? 1 : 0; } catch (e) {}
      try { finB = isTrackCardFinished(b.id) ? 1 : 0; } catch (e) {}
      if (finA !== finB) return finA - finB;
      const idxA = VENEZUELA_US_FAVORITES.indexOf(a.id);
      const idxB = VENEZUELA_US_FAVORITES.indexOf(b.id);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

  // 1. Multivisual 1: Top 4 hipódromos principales activos ahora mismo
  const multivisual1Preferred = isMonWed
    ? [
        ...directActiveSorted.slice(0, 4).map(c => c.id),
        'parx-racing', 'finger-lakes', 'horseshoe-indianapolis', 'mahoning-valley',
        'will-rogers-downs', 'zia-park', 'mountaineer-park', 'delta-downs'
      ]
    : [
        ...directActiveSorted.slice(0, 4).map(c => c.id),
        ...(vetHour >= 19
          ? ['del-mar', 'charles-town', 'delta-downs', 'evangeline-downs', 'remington-park', 'lone-star-park']
          : ['gulfstream-park', 'laurel-park', 'belmont-park', 'aqueduct-racetrack', 'tampa-bay-downs', 'woodbine'])
      ];

  const generalFallback = [
    ...directActiveSorted.map(c => c.id),
    ...venTodaySorted.map(c => c.id),
    ...activeIndividual.map(c => c.id),
    'gulfstream-park', 'laurel-park', 'parx-racing', 'finger-lakes', 'charles-town', 'delta-downs'
  ];

  // Canal 1: Multivisual 1 (Principales)
  addOfficialMultivisual(
    'multivisual-1',
    `Multivisual 1 (${dayLabel})`,
    '📺',
    `Multicanal 4 en 1 • Principales ${dayLabel}`,
    multivisual1Preferred,
    generalFallback,
    `Multivisual 1 Auto-Director`
  );

  // Obtener las 4 pistas elegidas en Multivisual 1 para que Multivisual 2 priorice las pistas #5 a #8 sin repetir
  const mv1Chosen = new Set((presets.find(p => p.id === 'multivisual-1')?.multicanalTracks) || []);
  const mv2DistinctLive = directActiveSorted.filter(c => !mv1Chosen.has(c.id)).map(c => c.id);
  const multivisual2Preferred = [
    ...mv2DistinctLive,
    'charles-town', 'delta-downs', 'evangeline-downs', 'remington-park',
    'lone-star-park', 'penn-national', 'mountaineer-park', 'zia-park',
    'will-rogers-downs', 'australia-flemington', 'meadowlands', 'woodbine-harness', 'hoosier-park'
  ];

  // Canal 2: Multivisual 2 (Simultáneo / Nocturno / Internacional Triple7)
  addOfficialMultivisual(
    'multivisual-2',
    'Multivisual 2 (Simultáneo)',
    '📡',
    'Multicanal 4 en 1 • Circuito Alterno & Nocturno',
    multivisual2Preferred,
    generalFallback,
    'Multivisual 2 Auto-Director'
  );

  // 3. Canal Oficial Capital OTB (Circuito NY / Costa Este / OTB)
  const capitalOtbPreferred = [
    ...cotbSorted.filter(c => {
      try { return !isTrackCardFinished(c.id); } catch (e) { return true; }
    }).slice(0, 4).map(c => c.id),
    'aqueduct-racetrack', 'belmont-park', 'saratoga', 'finger-lakes',
    'parx-racing', 'laurel-park', 'gulfstream-park', 'charles-town',
    'penn-national', 'tampa-bay-downs', 'horseshoe-indianapolis', 'mahoning-valley', 'woodbine'
  ];

  // Canal 3: Capital OTB (ID 'capital-otb')
  addOfficialMultivisual(
    'capital-otb',
    'Capital OTB (Costa Este)',
    '🏇',
    'Multicanal 4 en 1 • Circuito OTB NY & Este',
    capitalOtbPreferred,
    generalFallback,
    'Capital OTB Auto-Director'
  );

  // Deduplicación de compositor: si Capital OTB y Multivisual 1 tienen los mismos 4 hipódromos en distinto orden,
  // unificar el orden para compartir 1 solo compositor FFmpeg 4-en-1 en el servidor (~50% menos CPU).
  const mv1Preset = presets.find(p => p.id === 'multivisual-1');
  const cotbPreset = presets.find(p => p.id === 'capital-otb');
  if (mv1Preset && cotbPreset) {
    const k1 = normalizeCombinationKey(mv1Preset.multicanalTracks || []);
    const k2 = normalizeCombinationKey(cotbPreset.multicanalTracks || []);
    if (k1 && k1 === k2 && mv1Preset.multicanalTracks.join(',') !== cotbPreset.multicanalTracks.join(',')) {
      cotbPreset.multicanalTracks = [...mv1Preset.multicanalTracks];
      cotbPreset.multicanalSummary = mv1Preset.multicanalSummary;
      cotbPreset.statusText = `4 en 1: ${mv1Preset.multicanalSummary}`;
      cotbPreset.nextRace = `Incluye: ${mv1Preset.multicanalSummary}`;
      const sharedUrl = `/capital-otb.html?tracks=${encodeURIComponent(cotbPreset.multicanalTracks.join(','))}&title=${encodeURIComponent(cotbPreset.name)}`;
      cotbPreset.streamUrl = sharedUrl;
      cotbPreset.iframeUrl = sharedUrl;
    }
  }

  // Limpiar del catálogo cualquier multicanal viejo no activo
  const activePresetIds = new Set(presets.map(p => p.id));
  for (let i = channelsCatalog.length - 1; i >= 0; i--) {
    const ch = channelsCatalog[i];
    if (ch.isMulticanal && ch.id !== 'capital-otb' && !activePresetIds.has(ch.id)) {
      channelsCatalog.splice(i, 1);
    }
  }

  // Insertar o actualizar los 3 canales multicanal oficiales en channelsCatalog
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
