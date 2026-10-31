const { fetchRtnLiveStreams } = require('./rtn_bridge');
const { fetchPublicLiveStreams } = require('./public_streams_bridge');

// Estado del Ingestor Máster
const masterState = {
  activeStreams: new Map(),
  lastCheck: null,
  healthyChannelsCount: 0
};

let syncInProgress = false;

async function syncRtnStreams(channelsCatalog) {
  // Evitar sincronizaciones solapadas
  if (syncInProgress) {
    console.warn('⏳ [Master Ingest] Sincronización anterior aún en curso, se omite este ciclo.');
    return;
  }
  syncInProgress = true;
  try {
    // 1. Obtener señales desde RTN (si está habilitado) y desde el puente de señales públicas en vivo
    const bridgeStreams = (process.env.RTN_ENABLED === 'true') ? await fetchRtnLiveStreams() : {};
    const publicStreams = await fetchPublicLiveStreams();

    // Combinar dando prioridad a RTN si existe, o usando la señal pública en vivo como respaldo
    const combinedStreams = { ...publicStreams, ...bridgeStreams };

    // 2. Resetear el estado onAir previo salvo los canales fijados manualmente por el Administrador
    channelsCatalog.forEach(c => {
      if (!c.manualOverride) {
        c.onAir = false;
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
          onAir: true
        };
        channelsCatalog.push(chInCatalog);
      }
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

  // Actualizar señales en vivo cada 10 minutos
  setInterval(() => syncRtnStreams(channelsCatalog), 10 * 60 * 1000);
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
  updateChannelSource
};
