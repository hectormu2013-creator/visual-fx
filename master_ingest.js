const { fetchRtnLiveStreams } = require('./rtn_bridge');
const { fetchPublicLiveStreams } = require('./public_streams_bridge');
const { fetchFirstTvLiveStreams } = require('./first_tv_bridge');
const { syncMulticanalChannels } = require('./multicanal_manager');
const { getRacingScheduleStatus } = require('./schedule_manager');

// Estado del Ingestor Máster
const masterState = {
  activeStreams: new Map(),
  lastCheck: null,
  healthyChannelsCount: 0
};

let syncInProgress = false;

async function syncRtnStreams(channelsCatalog, forceManual = false) {
  const schedStatus = getRacingScheduleStatus();
  // Pre-calentar catálogo 15 min antes de abrir horario; fuera de horario no hacer peticiones a 1st.tv
  const preWarmStatus = getRacingScheduleStatus(Date.now() + 15 * 60 * 1000);
  if (!forceManual && !schedStatus.isRacingAllowed && !preWarmStatus.isRacingAllowed) {
    console.log(`🌙 [Master Ingest] Fuera de horario hípico (${schedStatus.statusReason}). Ingesta pausada (0 MB).`);
    return;
  }

  // Evitar sincronizaciones solapadas
  if (syncInProgress) {
    console.warn('⏳ [Master Ingest] Sincronización anterior aún en curso, se omite este ciclo.');
    return;
  }
  syncInProgress = true;
  try {
    // 1. Obtener señales desde el puente de señales públicas, 1/ST TV y RTN (si está habilitado)
    //    Solo excluir de RTN las pistas que ya tengan flujo de video directo (type !== 'iframe'),
    //    para que el video directo H.264 de RTN siempre reemplace a los embeds de YouTube (iframe).
    const publicStreams = await fetchPublicLiveStreams();
    const directPublicOnly = Object.fromEntries(
      Object.entries(publicStreams || {}).filter(([, val]) => val && val.type && val.type !== 'iframe')
    );
    const firstTvStreams = await fetchFirstTvLiveStreams(directPublicOnly);
    const bridgeStreams = (process.env.RTN_ENABLED === 'true')
      ? await fetchRtnLiveStreams({ ...directPublicOnly, ...firstTvStreams })
      : {};

    // Combinar señales activas verificadas (RTN y 1/ST TV tienen prioridad de flujo directo sobre iframes públicos)
    const combinedStreams = { ...publicStreams, ...firstTvStreams, ...bridgeStreams };

    // 2. Resetear el estado onAir y URL previa de los canales sin actividad hoy salvo los fijados manualmente
    channelsCatalog.forEach(c => {
      if (!c.manualOverride && !c.isMulticanal && !combinedStreams[c.id]) {
        c.onAir = false;
        c.activeToday = false;
        const offairUrl = `/offair.html?track=${encodeURIComponent(c.name || c.id)}&flag=${encodeURIComponent(c.flag || '🏇')}&loc=${encodeURIComponent(c.location || '')}`;
        c.streamUrl = offairUrl;
        c.iframeUrl = offairUrl;
      }
    });

    for (const [chId, data] of Object.entries(combinedStreams)) {
      masterState.activeStreams.set(chId, {
        id: chId,
        name: data.name || chId,
        streamUrl: data.streamUrl,
        type: data.type,
        status: 'ONLINE',
        lastUpdate: new Date().toISOString()
      });

      let chInCatalog = channelsCatalog.find(c => c.id === chId);
      if (chInCatalog) {
        if (!chInCatalog.manualOverride) {
          chInCatalog.streamUrl = data.streamUrl;
          chInCatalog.iframeUrl = data.streamUrl;
          chInCatalog.type = data.type || 'iframe';
          chInCatalog.onAir = true;
          chInCatalog.activeToday = data.activeToday !== undefined ? Boolean(data.activeToday) : true;
          if (data.statusText) chInCatalog.statusText = data.statusText;
          if (data.race) {
            chInCatalog.nextRace = `Carrera ${data.race} ${data.mtp ? `(MTP ${data.mtp})` : ''}`;
          } else if (data.nextRace) {
            chInCatalog.nextRace = data.nextRace;
          }
        }
      } else {
        // Agregar dinámicamente cualquier nuevo hipódromo en vivo (ej. Valencia, Camarero, Monterrico)
        chInCatalog = {
          id: chId,
          name: data.name || data.trackName || chId,
          flag: data.flag || "🏇",
          location: data.location || "Live Simulcast",
          type: data.type || "iframe",
          aliases: [chId],
          streamUrl: data.streamUrl,
          iframeUrl: data.streamUrl,
          officialSource: data.statusText || "Official Live Stream",
          statusText: data.statusText || "Carreras en Vivo • Señal HD Directo",
          nextRace: data.race ? `Carrera ${data.race} ${data.mtp ? `(MTP ${data.mtp})` : ''}` : (data.nextRace || "Siguiente Carrera en Vivo"),
          onAir: true,
          activeToday: data.activeToday !== undefined ? Boolean(data.activeToday) : true
        };
        channelsCatalog.push(chInCatalog);
      }
    }

    // 3. Sincronizar los Multicanales Preconfigurados y Personalizados (Capital OTB, Favoritos USA, Mixto, etc.)
    const activeMulticanales = syncMulticanalChannels(channelsCatalog);
    for (const mc of activeMulticanales) {
      masterState.activeStreams.set(mc.id, {
        id: mc.id,
        name: mc.name,
        streamUrl: mc.streamUrl,
        type: mc.type,
        status: 'ONLINE',
        lastUpdate: new Date().toISOString()
      });
    }

    masterState.healthyChannelsCount = channelsCatalog.filter(c => c.onAir).length;
    masterState.lastCheck = new Date().toISOString();
    console.log(`📡 [Master Ingest] Sincronización exitosa (${masterState.healthyChannelsCount} señales EN VIVO activas).`);
  } catch (e) {
    console.error('⚠️ [Master Ingest] Error en chequeo automático:', e.message);
  } finally {
    syncInProgress = false;
  }
}

function initMasterIngest(channelsCatalog) {
  console.log('📡 [Master Ingest] Motor de Señales en Vivo Iniciado para Agencias Fénix.');

  // Garantizar desde el milisegundo 0 que multivisual-1 y capital-otb existan y estén onAir en el catálogo
  try {
    syncMulticanalChannels(channelsCatalog);
  } catch (e) {}

  channelsCatalog.forEach(ch => {
    masterState.activeStreams.set(ch.id, {
      id: ch.id,
      name: ch.name,
      streamUrl: ch.streamUrl || ch.iframeUrl,
      type: ch.type,
      status: 'ONLINE',
      lastUpdate: new Date().toISOString()
    });
  });

  masterState.healthyChannelsCount = masterState.activeStreams.size;
  masterState.lastCheck = new Date().toISOString();

  // Sincronización inicial inmediata (usa Public Streams si RTN está apagado)
  syncRtnStreams(channelsCatalog);

  // Actualizar señales en vivo cada 4 minutos (respetando los cachés internos de 18m/35m)
  setInterval(() => syncRtnStreams(channelsCatalog), 4 * 60 * 1000);
}

function getMasterState() {
  const streams = [];
  for (const [id, val] of masterState.activeStreams.entries()) {
    streams.push(val);
  }
  return {
    lastCheck: masterState.lastCheck,
    totalHealthy: masterState.healthyChannelsCount,
    streams
  };
}

function updateChannelSource(channelId, newStreamUrl, type = 'hls') {
  if (masterState.activeStreams.has(channelId)) {
    const item = masterState.activeStreams.get(channelId);
    item.streamUrl = newStreamUrl;
    item.type = type;
    item.lastUpdate = new Date().toISOString();
    console.log(`📡 [Master Ingest] Conmutada señal de ${channelId} -> ${newStreamUrl}`);
  }
}

module.exports = {
  initMasterIngest,
  getMasterState,
  updateChannelSource,
  syncRtnStreams
};
