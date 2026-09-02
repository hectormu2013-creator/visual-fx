const { fetchRtnLiveStreams } = require('./rtn_bridge');

// Estado del Ingestor Máster
const masterState = {
  activeStreams: new Map(),
  lastCheck: null,
  healthyChannelsCount: 0
};

async function syncRtnStreams(channelsCatalog) {
  try {
    // 1. Resetear el estado onAir previo
    channelsCatalog.forEach(c => {
      // YouTube streams u oficiales siempre permanecen onAir si no son de RTN
      if (!c.officialSource || !c.officialSource.includes('NYRA') && !c.officialSource.includes('RTN')) {
        c.onAir = true;
      } else {
        c.onAir = false;
      }
    });

    const bridgeStreams = await fetchRtnLiveStreams();
    for (const [chId, data] of Object.entries(bridgeStreams)) {
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
        chInCatalog.streamUrl = data.streamUrl;
        chInCatalog.iframeUrl = data.streamUrl;
        chInCatalog.type = data.type;
        chInCatalog.onAir = true;
        if (data.race) chInCatalog.nextRace = `Carrera ${data.race} ${data.mtp ? `(MTP ${data.mtp})` : ''}`;
      } else {
        // Agregar dinámicamente cualquier nuevo hipódromo de RTN en vivo
        chInCatalog = {
          id: chId,
          name: data.name || data.trackName || chId,
          flag: "🏇",
          location: "RTN.tv Live Simulcast",
          type: data.type || "iframe",
          aliases: [chId],
          streamUrl: data.streamUrl,
          iframeUrl: data.streamUrl,
          officialSource: "RTN.tv Live Official",
          statusText: "Carreras en Vivo • RTN HD Directo",
          nextRace: data.race ? `Carrera ${data.race} ${data.mtp ? `(MTP ${data.mtp})` : ''}` : "Siguiente Carrera en Vivo",
          onAir: true
        };
        channelsCatalog.push(chInCatalog);
      }
    }
    masterState.healthyChannelsCount = masterState.activeStreams.size;
    masterState.lastCheck = new Date().toISOString();
    console.log(`📡 [Master Ingest RTN] Sincronización exitosa (${Object.keys(bridgeStreams).length} señales EN VIVO activas).`);
  } catch (e) {
    console.error('⚠️ [Master Ingest RTN] Error en chequeo automático:', e.message);
  }
}

function initMasterIngest(channelsCatalog) {
  console.log('📡 [Master Ingest RTN] Motor Relay Oficial RTN.tv Iniciado para Agencias Fénix.');

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

  // Sincronización inicial inmediata
  syncRtnStreams(channelsCatalog);

  // Ejecutar verificación y puente RTN cada 3 minutos
  setInterval(() => syncRtnStreams(channelsCatalog), 180000);
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
