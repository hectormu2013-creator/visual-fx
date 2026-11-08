// bandwidth_tracker.js - Medidor en Tiempo Real y Freno Automático de Consumo de Datos (GB / USD)
// Registra cada byte enviado por stream_proxy.js por día, por mes y por pantalla/agencia,
// y corta automáticamente el video (pasando a Modo Loterías) si se alcanza el tope diario o mensual configurado.

const fs = require('fs');
const path = require('path');
const { saveToCloud, loadFromCloud } = require('./supabase_sync');

const TRACKER_FILE = path.join(__dirname, 'data', 'bandwidth_telemetry.json');
const CLOUD_KEY = 'bandwidth_telemetry';

const RENDER_FREE_GB = 5;
const RENDER_RATE_PER_GB = 0.15;
const BYTES_PER_GB = 1024 * 1024 * 1024;

function getVetDateKeys(nowMs = Date.now()) {
  const vet = new Date(nowMs - 4 * 3600 * 1000);
  const yyyy = vet.getUTCFullYear();
  const mm = String(vet.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vet.getUTCDate()).padStart(2, '0');
  return {
    dayKey: `${yyyy}-${mm}-${dd}`,
    monthKey: `${yyyy}-${mm}`
  };
}

const initialKeys = getVetDateKeys();

// Inicializado con los 21 GB reales acumulados en Render hasta el 3 de noviembre de 2026 (5 GB gratis + 16 GB facturados = $2.40)
let state = {
  monthKey: initialKeys.monthKey,
  dayKey: initialKeys.dayKey,
  monthBytes: 21 * BYTES_PER_GB,
  todayBytes: 0,
  dailyLimitGb: 200,    // Tope de seguridad diario en Railway: 200 GB/día
  monthlyLimitGb: 5000, // Tope de seguridad mensual en Railway: 5000 GB/mes
  capEnabled: false,
  perDeviceTodayBytes: {},
  perDeviceMonthBytes: {},
  dailyHistory: {},
  updatedAt: new Date().toISOString()
};

let activeStreamConnections = 0;
let dirtySinceLastSync = false;

// Candado en Servidor: Máximo 1 flujo de video activo por televisor (deviceId)
// Si un televisor abre un 2do flujo (o tenía caché viejo de 4 pantallas), el servidor cierra de inmediato el anterior.
const activeStreamsByDevice = new Map();

function registerExclusiveDeviceStream(deviceId, res, label = 'stream') {
  const devKey = String(deviceId || '').trim();
  if (!devKey || devKey === 'tv' || devKey === 'unknown' || devKey.startsWith('INTERNAL')) {
    return;
  }
  const existing = activeStreamsByDevice.get(devKey);
  if (existing && existing.res && existing.res !== res) {
    try {
      if (!existing.res.writableEnded && !existing.res.destroyed) {
        existing.res.end();
      }
    } catch (e) {}
  }
  const entry = { res, label, openedAt: Date.now() };
  activeStreamsByDevice.set(devKey, entry);
  const cleanup = () => {
    const cur = activeStreamsByDevice.get(devKey);
    if (cur === entry) {
      activeStreamsByDevice.delete(devKey);
    }
  };
  res.once('close', cleanup);
  res.once('finish', cleanup);
  res.once('error', cleanup);
}

function rotateCountersIfNeeded() {
  const { dayKey, monthKey } = getVetDateKeys();
  if (state.monthKey !== monthKey) {
    state.monthKey = monthKey;
    state.monthBytes = 0;
    state.perDeviceMonthBytes = {};
    state.dailyHistory = {};
    dirtySinceLastSync = true;
  }
  if (state.dayKey !== dayKey) {
    if (state.dayKey) {
      state.dailyHistory[state.dayKey] = Number((state.todayBytes / BYTES_PER_GB).toFixed(3));
    }
    state.dayKey = dayKey;
    state.todayBytes = 0;
    state.perDeviceTodayBytes = {};
    dirtySinceLastSync = true;
  }
}

function saveLocalState() {
  try {
    const dir = path.dirname(TRACKER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

async function syncTrackerToCloud() {
  try {
    rotateCountersIfNeeded();
    state.updatedAt = new Date().toISOString();
    saveLocalState();
    await saveToCloud(CLOUD_KEY, {
      ...state,
      summary: getBandwidthSummary()
    });
    dirtySinceLastSync = false;
  } catch (e) {}
}

async function initBandwidthTracker() {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      const local = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
      if (local && typeof local === 'object') {
        state = { ...state, ...local };
      }
    }
  } catch (e) {}

  try {
    const cloud = await loadFromCloud(CLOUD_KEY);
    if (cloud && typeof cloud === 'object') {
      const { summary, ...rest } = cloud;
      state = { ...state, ...rest };
    } else {
      await syncTrackerToCloud();
    }
  } catch (e) {}

  rotateCountersIfNeeded();

  // Sincronizar con Supabase cada 45s si hubo tráfico o si cambiaron los topes desde la Suite Fénix
  setInterval(async () => {
    try {
      const cloud = await loadFromCloud(CLOUD_KEY);
      if (cloud && typeof cloud === 'object') {
        if (cloud.dailyLimitGb !== undefined) state.dailyLimitGb = Number(cloud.dailyLimitGb) || 12;
        if (cloud.monthlyLimitGb !== undefined) state.monthlyLimitGb = Number(cloud.monthlyLimitGb) || 150;
        if (cloud.capEnabled !== undefined) state.capEnabled = Boolean(cloud.capEnabled);
      }
      if (dirtySinceLastSync) {
        await syncTrackerToCloud();
      }
    } catch (e) {}
  }, 300000).unref();
}

function recordBytesSent(bytes, deviceId = 'unknown') {
  if (!bytes || bytes <= 0) return;
  const devKey = String(deviceId || 'unknown').slice(0, 40);
  // Ignorar tráfico interno de loopback (127.0.0.1 -> Compositor FFmpeg) que no consume ancho de banda externo
  if (devKey.startsWith('INTERNAL')) return;
  rotateCountersIfNeeded();
  state.todayBytes += bytes;
  state.monthBytes += bytes;
  state.perDeviceTodayBytes[devKey] = (state.perDeviceTodayBytes[devKey] || 0) + bytes;
  state.perDeviceMonthBytes[devKey] = (state.perDeviceMonthBytes[devKey] || 0) + bytes;
  dirtySinceLastSync = true;
}

function onStreamConnectionOpen() {
  activeStreamConnections++;
}

function onStreamConnectionClose() {
  activeStreamConnections = Math.max(0, activeStreamConnections - 1);
}

function isBandwidthWithinLimits() {
  rotateCountersIfNeeded();
  if (!state.capEnabled) {
    return { allowed: true, reason: 'Sin tope activo' };
  }
  const todayGb = state.todayBytes / BYTES_PER_GB;
  const monthGb = state.monthBytes / BYTES_PER_GB;

  if (state.dailyLimitGb > 0 && todayGb >= state.dailyLimitGb) {
    return {
      allowed: false,
      reason: `Tope diario alcanzado (${todayGb.toFixed(2)} GB / ${state.dailyLimitGb} GB) • Modo Loterías Activo`
    };
  }
  if (state.monthlyLimitGb > 0 && monthGb >= state.monthlyLimitGb) {
    return {
      allowed: false,
      reason: `Tope mensual alcanzado (${monthGb.toFixed(2)} GB / ${state.monthlyLimitGb} GB) • Modo Loterías Activo`
    };
  }
  return { allowed: true, reason: 'Dentro del límite de consumo' };
}

function getBandwidthSummary() {
  rotateCountersIfNeeded();
  const todayGb = state.todayBytes / BYTES_PER_GB;
  const monthGb = state.monthBytes / BYTES_PER_GB;
  const billableMonthGb = Math.max(0, monthGb - RENDER_FREE_GB);
  const estimatedBandwidthCostUsd = billableMonthGb * RENDER_RATE_PER_GB;
  const todayCostUsd = todayGb * RENDER_RATE_PER_GB;
  const limitCheck = isBandwidthWithinLimits();

  const topDevicesToday = Object.entries(state.perDeviceTodayBytes || {})
    .map(([deviceId, b]) => ({
      deviceId,
      gb: Number((b / BYTES_PER_GB).toFixed(3)),
      mb: Number((b / (1024 * 1024)).toFixed(1))
    }))
    .sort((a, b) => b.gb - a.gb)
    .slice(0, 10);

  return {
    dayKey: state.dayKey,
    monthKey: state.monthKey,
    todayGb: Number(todayGb.toFixed(3)),
    todayMb: Number((state.todayBytes / (1024 * 1024)).toFixed(1)),
    todayCostUsd: Number(todayCostUsd.toFixed(2)),
    monthGb: Number(monthGb.toFixed(2)),
    billableMonthGb: Number(billableMonthGb.toFixed(2)),
    estimatedBandwidthCostUsd: Number(estimatedBandwidthCostUsd.toFixed(2)),
    dailyLimitGb: state.dailyLimitGb,
    monthlyLimitGb: state.monthlyLimitGb,
    capEnabled: state.capEnabled,
    withinLimits: limitCheck.allowed,
    limitReason: limitCheck.reason,
    activeStreamConnections,
    topDevicesToday,
    updatedAt: state.updatedAt
  };
}

async function updateBandwidthLimits(newSettings = {}) {
  rotateCountersIfNeeded();
  if (newSettings.dailyLimitGb !== undefined) {
    state.dailyLimitGb = Math.max(1, Number(newSettings.dailyLimitGb) || 12);
  }
  if (newSettings.monthlyLimitGb !== undefined) {
    state.monthlyLimitGb = Math.max(5, Number(newSettings.monthlyLimitGb) || 150);
  }
  if (newSettings.capEnabled !== undefined) {
    state.capEnabled = Boolean(newSettings.capEnabled);
  }
  if (newSettings.monthGbBaseline !== undefined) {
    const val = Number(newSettings.monthGbBaseline);
    if (!Number.isNaN(val) && val >= 0) {
      state.monthBytes = Math.round(val * BYTES_PER_GB);
    }
  }
  await syncTrackerToCloud();
  return getBandwidthSummary();
}

module.exports = {
  initBandwidthTracker,
  recordBytesSent,
  onStreamConnectionOpen,
  onStreamConnectionClose,
  registerExclusiveDeviceStream,
  isBandwidthWithinLimits,
  getBandwidthSummary,
  updateBandwidthLimits
};
