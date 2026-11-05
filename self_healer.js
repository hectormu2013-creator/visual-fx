// self_healer.js - Perro Guardián Autónomo 24/7 para Visual-FX (Auto-Diagnóstico y Auto-Reparación)
// Ejecuta auditorías preventivas cada 5 minutos durante el horario hípico y repara automáticamente:
// 1. Bloqueos accidentales por topes antiguos de ancho de banda (Render 12 GB -> Railway 200 GB).
// 2. Caída de hipódromos en vivo durante horario pico (12:15 PM a 6:45 PM hora Venezuela UTC-4).
// 3. Enlaces firmados expirados (401) en Robertsstream / Millicast.
// 4. Sincronización de los 3 Multicanales (Multivisual1, Multivisual2 y Multivisual3).

const { getRacingScheduleStatus } = require('./schedule_manager');
const { getBandwidthSummary, updateBandwidthLimits } = require('./bandwidth_tracker');
const { getRtnStatus, purgeRtnTrackCache } = require('./rtn_bridge');
const { syncRtnStreams } = require('./master_ingest');
const { syncMulticanalChannels } = require('./multicanal_manager');

const healerLog = [];
let lastHealActionAt = 0;

function recordHealerEvent(action, status, detail) {
  const entry = {
    timestamp: new Date().toISOString(),
    vetTime: new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(11, 19),
    action,
    status,
    detail
  };
  healerLog.unshift(entry);
  if (healerLog.length > 50) healerLog.pop();
  console.log(`🩺 [Self-Healer] [${status}] ${action}: ${detail}`);
}

async function runHealthCheckAndHeal(channelsCatalog, manualTrigger = false) {
  const now = Date.now();
  const vetDate = new Date(now - 4 * 3600 * 1000);
  const vetHour = vetDate.getUTCHours();
  const vetMin = vetDate.getUTCMinutes();
  const vetMinutesOfDay = vetHour * 60 + vetMin;

  const sched = getRacingScheduleStatus();
  const bw = getBandwidthSummary();
  const rtn = getRtnStatus();

  const actionsTaken = [];

  // 1. Verificar que ningún tope antiguo de Render (<= 20 GB/día) bloquee la transmisión en Railway
  if ((bw.capEnabled && bw.dailyLimitGb <= 20) || !bw.withinLimits) {
    await updateBandwidthLimits({
      dailyLimitGb: Math.max(200, bw.dailyLimitGb || 200),
      monthlyLimitGb: Math.max(5000, bw.monthlyLimitGb || 5000),
      capEnabled: false
    });
    actionsTaken.push('BANDWIDTH_UNBLOCKED');
    recordHealerEvent('BANDWIDTH_GUARD', 'HEALED', 'Tope antiguo de ancho de banda desbloqueado automáticamente.');
  }

  // 2. Si estamos en horario de carreras y son más de las 12:15 PM (735 min) en Venezuela,
  //    verificar que existan hipódromos individuales EN VIVO (onAir = true).
  const activeIndividualTracks = channelsCatalog.filter(
    c => c.onAir && !c.isMulticanal && c.id !== 'capital-otb' && c.id !== 'vsin' && c.id !== 'horse-tv'
  );

  const isPeakRacingWindow = sched.isRacingAllowed && vetMinutesOfDay >= (12 * 60 + 30) && vetMinutesOfDay <= (18 * 60 + 45);

  // Solo intervenir contra RTN si hay CERO (0) hipódromos en vivo en pleno horario pico,
  // y con un enfriamiento mínimo de 30 minutos para JAMÁS generar sobreuso en la cuenta de RTN.
  if ((isPeakRacingWindow || manualTrigger) && activeIndividualTracks.length === 0) {
    if (manualTrigger || (now - lastHealActionAt) > 30 * 60 * 1000) {
      lastHealActionAt = now;
      purgeRtnTrackCache(false);
      await syncRtnStreams(channelsCatalog, true);
      syncMulticanalChannels(channelsCatalog);

      const afterTracks = channelsCatalog.filter(
        c => c.onAir && !c.isMulticanal && c.id !== 'capital-otb' && c.id !== 'vsin' && c.id !== 'horse-tv'
      );
      actionsTaken.push(`RTN_RESYNC(${activeIndividualTracks.length}->${afterTracks.length})`);
      recordHealerEvent(
        'LIVE_TRACKS_GUARD',
        afterTracks.length > 0 ? 'HEALED' : 'WARN',
        `Detectadas 0 señales en vivo. Tras auto-curación (máx 1 cada 30m): ${afterTracks.length} activas (${afterTracks.map(t => t.id).join(', ') || 'ninguna'}).`
      );
    }
  } else {
    // Lectura 100% en memoria RAM local (0 peticiones externas, 0 MB, $0 costo)
    syncMulticanalChannels(channelsCatalog);
  }

  const finalIndividual = channelsCatalog.filter(
    c => c.onAir && !c.isMulticanal && c.id !== 'capital-otb' && c.id !== 'vsin' && c.id !== 'horse-tv'
  );
  const finalMulticanales = channelsCatalog.filter(
    c => c.onAir && (c.isMulticanal || c.id === 'capital-otb')
  );

  return {
    healthy: !isPeakRacingWindow || finalIndividual.length >= 2,
    vetTime: `${String(vetHour).padStart(2, '0')}:${String(vetMin).padStart(2, '0')} VET`,
    isRacingAllowed: sched.isRacingAllowed,
    scheduleReason: sched.statusReason,
    bandwidthWithinLimits: bw.withinLimits,
    todayGb: bw.todayGb,
    rtnSessionValid: rtn.hasSessionCookie && !rtn.circuitPausedUntil,
    liveIndividualCount: finalIndividual.length,
    liveIndividualTracks: finalIndividual.map(c => ({ id: c.id, name: c.name, nextRace: c.nextRace })),
    multicanalesCount: finalMulticanales.length,
    multicanales: finalMulticanales.map(m => ({ id: m.id, name: m.name, tracks: m.multicanalTracks })),
    actionsTaken,
    recentHealerLog: healerLog.slice(0, 15)
  };
}

function initSelfHealer(channelsCatalog) {
  recordHealerEvent('INIT', 'OK', 'Perro Guardián Autónomo iniciado (lectura en RAM cada 20 min, curación máx 1 vez cada 30 min).');
  setInterval(() => {
    runHealthCheckAndHeal(channelsCatalog, false).catch(err => {
      recordHealerEvent('CYCLE_ERR', 'ERROR', err.message);
    });
  }, 20 * 60 * 1000).unref();
}

module.exports = {
  initSelfHealer,
  runHealthCheckAndHeal
};
