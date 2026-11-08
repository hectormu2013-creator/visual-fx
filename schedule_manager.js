// schedule_manager.js - Controlador de Horarios Oficiales de Transmisión Hípica (Hora Venezuela UTC-4)
// Lunes a Jueves: 11:30 AM a 7:00 PM (19:00)
// Viernes a Domingo: 11:00 AM a 8:00 PM (20:00)
// Fuera de horario: Cambio automático de todos los TVs a Modo Loterías y corte de consumo de video (0 MB).

const fs = require('fs');
const path = require('path');
const { saveToCloud, loadFromCloud } = require('./supabase_sync');
const { isBandwidthWithinLimits, getBandwidthSummary } = require('./bandwidth_tracker');

const SCHEDULE_FILE = path.join(__dirname, 'data', 'racing_schedule.json');
const CLOUD_KEY = 'racing_schedule';

const DEFAULT_RACING_SCHEDULE = {
  enabled: true,
  mode: 'AUTO', // 'AUTO' | 'FORCE_OPEN' | 'FORCE_LOTTERY'
  monThuStart: '11:30',
  monThuEnd: '19:00',
  friSunStart: '11:00',
  friSunEnd: '20:00',
  offHoursService: 'loteria',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Sistema'
};

let currentSchedule = { ...DEFAULT_RACING_SCHEDULE };

function parseTimeToMinutes(timeStr, fallbackMinutes) {
  if (!timeStr || typeof timeStr !== 'string') return fallbackMinutes;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return fallbackMinutes;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return fallbackMinutes;
  }
  return h * 60 + m;
}

function format12Hour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return timeStr;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function sanitizeSchedule(input = {}) {
  const validModes = ['AUTO', 'FORCE_OPEN', 'FORCE_LOTTERY'];
  const mode = validModes.includes(input.mode) ? input.mode : currentSchedule.mode || 'AUTO';
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : (currentSchedule.enabled !== false);
  const monThuStart = /^\d{2}:\d{2}$/.test(input.monThuStart || '') ? input.monThuStart : (currentSchedule.monThuStart || '11:30');
  const monThuEnd = /^\d{2}:\d{2}$/.test(input.monThuEnd || '') ? input.monThuEnd : (currentSchedule.monThuEnd || '19:00');
  const friSunStart = /^\d{2}:\d{2}$/.test(input.friSunStart || '') ? input.friSunStart : (currentSchedule.friSunStart || '11:00');
  const friSunEnd = /^\d{2}:\d{2}$/.test(input.friSunEnd || '') ? input.friSunEnd : (currentSchedule.friSunEnd || '20:00');

  return {
    enabled,
    mode,
    monThuStart,
    monThuEnd,
    friSunStart,
    friSunEnd,
    offHoursService: 'loteria',
    updatedAt: input.updatedAt || new Date().toISOString(),
    updatedBy: input.updatedBy || currentSchedule.updatedBy || 'Admin'
  };
}

function saveLocalSchedule(sched) {
  try {
    const dir = path.dirname(SCHEDULE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(sched, null, 2), 'utf8');
  } catch (e) {}
}

async function initScheduleManager() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
      currentSchedule = sanitizeSchedule(raw);
    }
  } catch (e) {}

  try {
    const cloudData = await loadFromCloud(CLOUD_KEY);
    if (cloudData && typeof cloudData === 'object') {
      currentSchedule = sanitizeSchedule(cloudData);
      saveLocalSchedule(currentSchedule);
    } else {
      await saveToCloud(CLOUD_KEY, currentSchedule);
    }
  } catch (e) {}

  // Sincronizar cada 60s desde Supabase por si se modifica desde la Suite Administrativa Fénix
  setInterval(async () => {
    try {
      const cloudData = await loadFromCloud(CLOUD_KEY);
      if (cloudData && typeof cloudData === 'object' && cloudData.updatedAt !== currentSchedule.updatedAt) {
        currentSchedule = sanitizeSchedule(cloudData);
        saveLocalSchedule(currentSchedule);
      }
    } catch (e) {}
  }, 300000).unref();
}

async function updateRacingSchedule(newConfig, updatedBy = 'Admin') {
  currentSchedule = sanitizeSchedule({
    ...currentSchedule,
    ...newConfig,
    updatedAt: new Date().toISOString(),
    updatedBy
  });
  saveLocalSchedule(currentSchedule);
  await saveToCloud(CLOUD_KEY, currentSchedule);
  return getRacingScheduleStatus();
}

function getRacingScheduleStatus(nowMs = Date.now()) {
  // Hora exacta en Venezuela (UTC-4)
  const vetDate = new Date(nowMs - 4 * 3600 * 1000);
  const vetDay = vetDate.getUTCDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  const vetHour = vetDate.getUTCHours();
  const vetMin = vetDate.getUTCMinutes();
  const currentMinutes = vetHour * 60 + vetMin;

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const vetDayName = dayNames[vetDay] || '';
  const vetTime24 = `${String(vetHour).padStart(2, '0')}:${String(vetMin).padStart(2, '0')}`;
  const vetTime12 = format12Hour(vetTime24);

  const isWeekendBlock = (vetDay === 5 || vetDay === 6 || vetDay === 0); // Viernes, Sábado o Domingo
  const todayStart = isWeekendBlock ? currentSchedule.friSunStart : currentSchedule.monThuStart;
  const todayEnd = isWeekendBlock ? currentSchedule.friSunEnd : currentSchedule.monThuEnd;

  const startMinutes = parseTimeToMinutes(todayStart, isWeekendBlock ? 660 : 690);
  const endMinutes = parseTimeToMinutes(todayEnd, isWeekendBlock ? 1200 : 1140);

  const withinTimeWindow = (currentMinutes >= startMinutes && currentMinutes < endMinutes);

  let isRacingAllowed = withinTimeWindow;
  let statusReason = '';

  if (!currentSchedule.enabled || currentSchedule.mode === 'FORCE_OPEN') {
    isRacingAllowed = true;
    statusReason = currentSchedule.mode === 'FORCE_OPEN'
      ? 'Transmisión Hípica Forzada Manualmente (Abierta)'
      : 'Horario Automático Desactivado (Transmisión Abierta)';
  } else if (currentSchedule.mode === 'FORCE_LOTTERY') {
    isRacingAllowed = false;
    statusReason = 'Modo Loterías Forzado Manualmente por Administración';
  } else if (withinTimeWindow) {
    isRacingAllowed = true;
    statusReason = `En horario de transmisión hípica (${format12Hour(todayStart)} a ${format12Hour(todayEnd)})`;
  } else {
    isRacingAllowed = false;
    statusReason = `Fuera de horario hípico (${vetDayName}: ${format12Hour(todayStart)} a ${format12Hour(todayEnd)}) • Modo Loterías Activo`;
  }

  const bwCheck = isBandwidthWithinLimits();
  if (isRacingAllowed && !bwCheck.allowed && currentSchedule.mode !== 'FORCE_OPEN') {
    isRacingAllowed = false;
    statusReason = bwCheck.reason;
  }

  return {
    isRacingAllowed,
    withinTimeWindow,
    fallbackService: 'loteria',
    statusReason,
    vetDay,
    vetDayName,
    vetTime24,
    vetTime12,
    todayWindow: {
      isWeekendBlock,
      label: isWeekendBlock ? 'Viernes a Domingo' : 'Lunes a Jueves',
      start: todayStart,
      end: todayEnd,
      start12: format12Hour(todayStart),
      end12: format12Hour(todayEnd)
    },
    schedule: { ...currentSchedule },
    bandwidth: getBandwidthSummary()
  };
}

module.exports = {
  DEFAULT_RACING_SCHEDULE,
  initScheduleManager,
  updateRacingSchedule,
  getRacingScheduleStatus
};
