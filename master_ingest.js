const { fetchRtnLiveStreams } = require('./rtn_bridge');

// Estado del Ingestor Máster
const masterState = {
  activeStreams: new Map(),
  lastCheck: null,
  healthyChannelsCount: 0
};

async function syncRtnStreams(channelsCatalog) {
  try {
    const bridgeStreams = await fetchRtnLiveStreams();
    for (const [chId, data] of Object.entries(bridgeStreams)) {
      if (masterState.activeStreams.has(chId)) {
        const current = masterState.activeStreams.get(chId);
        current.streamUrl = data.streamUrl;
        current.type = data.type;
        current.lastUpdate = new Date().toISOString();
        
        const chInCatalog = channelsCatalog.find(c => c.id === chId);
        if (chInCatalog) {
          chInCatalog.streamUrl = data.streamUrl;
          chInCatalog.iframeUrl = data.streamUrl;
          chInCatalog.type = data.type;
        }
      }
    }
    masterState.lastCheck = new Date().toISOString();
    console.log(`📡 [Master Ingest RTN] Sincronización finalizada exitosamente (${Object.keys(bridgeStreams).length} señales activas).`);
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
