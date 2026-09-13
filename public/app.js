// App State
let currentUser = null;
let currentToken = null;
let currentDeviceId = null;
let channelCatalog = [];
let activeGridMode = 1;
let activeAudioCell = null;
let focusedCellIndex = 1;

// =========================================================================
// Advanced Hardware Profiling & Adaptive Streaming Optimizer
// =========================================================================
const HARDWARE_TIERS = {
  LIGHT: 'LIGHT',     // TV Box, Smart TV, <=2 Cores, <=2GB RAM
  MEDIUM: 'MEDIUM',   // 3-4 Cores, <=4GB RAM, Firestick 4K, laptops
  FULL: 'FULL'        // >=6 Cores, >=6GB RAM, PCs potentes
};

function profileDeviceHardware() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const isSmartTv = /smarttv|tizen|webos|hbbtv|netcast|vizio|opera tv|appletv|firetv|roku|android tv|googletv|smart-tv|tv box|mibox|chromecast/i.test(ua);
  const cores = navigator.hardwareConcurrency || (isSmartTv ? 2 : 4);
  const memory = navigator.deviceMemory || (isSmartTv ? 1.5 : (cores <= 2 ? 2 : 4));
  
  let detectedTier = HARDWARE_TIERS.FULL;
  let summary = '';

  if (isSmartTv || cores <= 2 || memory <= 2) {
    detectedTier = HARDWARE_TIERS.LIGHT;
    summary = isSmartTv ? 'Smart TV / TV Box' : (cores <= 2 ? `${cores} Cores CPU` : `${memory}GB RAM`);
  } else if (cores <= 4 || memory <= 4) {
    detectedTier = HARDWARE_TIERS.MEDIUM;
    summary = `${cores} Cores · ${memory}GB RAM`;
  } else {
    detectedTier = HARDWARE_TIERS.FULL;
    summary = `${cores} Cores · Alta Potencia`;
  }

  return {
    isSmartTv,
    cores,
    memory,
    detectedTier,
    summary
  };
}

const hardwareProfile = profileDeviceHardware();
const IS_SMART_TV = hardwareProfile.isSmartTv;

let selectedQualityMode = localStorage.getItem('vfx_stream_quality_mode') || 'AUTO';

function getEffectiveQualityTier() {
  if (selectedQualityMode === 'AUTO') {
    return hardwareProfile.detectedTier;
  }
  return selectedQualityMode;
}

function updateQualityBadgeUi() {
  const sel = document.getElementById('selStreamQuality');
  if (sel) sel.value = selectedQualityMode;

  const badge = document.getElementById('hardwareTierBadge');
  const effectiveTier = getEffectiveQualityTier();
  
  if (badge) {
    badge.className = 'hardware-tier-badge';
    if (effectiveTier === HARDWARE_TIERS.LIGHT) {
      badge.classList.add('tier-light');
      badge.textContent = selectedQualityMode === 'AUTO' 
        ? `⚡ Auto: 🍃 Liviano (${hardwareProfile.summary})` 
        : `🍃 Modo Liviano`;
    } else if (effectiveTier === HARDWARE_TIERS.MEDIUM) {
      badge.classList.add('tier-medium');
      badge.textContent = selectedQualityMode === 'AUTO' 
        ? `⚡ Auto: ⚖️ Equilibrado (${hardwareProfile.summary})` 
        : `⚖️ Equilibrado (720p)`;
    } else {
      badge.classList.add('tier-full');
      badge.textContent = selectedQualityMode === 'AUTO' 
        ? `⚡ Auto: 💎 Full HD (${hardwareProfile.summary})` 
        : `💎 Full HD (1080p)`;
    }
  }

  // Activar o desactivar optimizaciones CSS para hardware modesto
  document.body.classList.toggle('mode-light-performance', effectiveTier === HARDWARE_TIERS.LIGHT);
}

function tuneHlsBuffers(hls, effectiveTier, gridMode) {
  if (!hls || !hls.config) return;
  const isMulti = gridMode > 1;
  const isUltraMulti = gridMode >= 3;

  if (effectiveTier === HARDWARE_TIERS.LIGHT) {
    hls.config.backBufferLength = 0;
    hls.config.maxBufferLength = isUltraMulti ? 2 : (isMulti ? 3 : 4);
    hls.config.maxMaxBufferLength = isUltraMulti ? 4 : (isMulti ? 5 : 7);
    hls.config.maxBufferSize = isUltraMulti ? 1.5 * 1024 * 1024 : (isMulti ? 2.5 * 1024 * 1024 : 4 * 1024 * 1024);
  } else if (effectiveTier === HARDWARE_TIERS.MEDIUM) {
    hls.config.backBufferLength = 10;
    hls.config.maxBufferLength = isUltraMulti ? 5 : (isMulti ? 8 : 12);
    hls.config.maxMaxBufferLength = isUltraMulti ? 8 : (isMulti ? 12 : 18);
    hls.config.maxBufferSize = isMulti ? 6 * 1024 * 1024 : 12 * 1024 * 1024;
  } else {
    hls.config.backBufferLength = 30;
    hls.config.maxBufferLength = isMulti ? 12 : 25;
    hls.config.maxMaxBufferLength = isMulti ? 20 : 40;
    hls.config.maxBufferSize = 30 * 1024 * 1024;
  }
}

function applyResolutionCap(cellNum, hls, gridMode, isMaximized) {
  if (!hls || !hls.levels || hls.levels.length === 0) return;

  const effectiveTier = getEffectiveQualityTier();
  const levels = hls.levels;

  let maxAllowedHeight = 1080;

  if (effectiveTier === HARDWARE_TIERS.LIGHT) {
    if (gridMode >= 3 && !isMaximized) {
      hls.autoLevelCappedAt = 0;
      hls.currentLevel = 0;
      console.log(`[Stream Optimizer Celda ${cellNum}] LIGHT + Multicanal ${gridMode}: Nivel mínimo forzado (${levels[0].height || 360}p)`);
      return;
    } else if (gridMode === 2 && !isMaximized) {
      maxAllowedHeight = 480;
    } else {
      maxAllowedHeight = 480;
    }
  } else if (effectiveTier === HARDWARE_TIERS.MEDIUM) {
    if (gridMode >= 3 && !isMaximized) {
      maxAllowedHeight = 480;
    } else if (gridMode === 2 && !isMaximized) {
      maxAllowedHeight = 720;
    } else {
      maxAllowedHeight = 720;
    }
  } else {
    // FULL
    if (gridMode >= 3 && !isMaximized) {
      maxAllowedHeight = 720;
    } else {
      maxAllowedHeight = 1080;
    }
  }

  const safeLevels = levels
    .map((lvl, index) => ({ ...lvl, index }))
    .filter(lvl => (lvl.height <= maxAllowedHeight));

  if (safeLevels.length > 0) {
    const highestSafe = safeLevels[safeLevels.length - 1];
    hls.autoLevelCappedAt = highestSafe.index;
    console.log(`[Stream Optimizer Celda ${cellNum}] Tier ${effectiveTier} -> Nivel máximo permitido: ${highestSafe.height}p (Índice ${highestSafe.index})`);
  } else {
    hls.autoLevelCappedAt = 0;
    console.log(`[Stream Optimizer Celda ${cellNum}] Tier ${effectiveTier} -> Nivel 0 forzado (${levels[0].height}p)`);
  }
}

// Watchdog Dinámico de Caída de Fotogramas (Frame Drop Watchdog)
const watchdogTimers = { 1: null, 2: null, 3: null, 4: null };
const lastPlaybackQuality = { 1: null, 2: null, 3: null, 4: null };

function startFrameDropWatchdog(cellNum, video, hls) {
  stopFrameDropWatchdog(cellNum);
  lastPlaybackQuality[cellNum] = null;

  watchdogTimers[cellNum] = setInterval(() => {
    if (!video || video.paused || !hls || !hls.levels) return;

    let totalFrames = 0;
    let droppedFrames = 0;

    if (typeof video.getVideoPlaybackQuality === 'function') {
      const q = video.getVideoPlaybackQuality();
      totalFrames = q.totalVideoFrames;
      droppedFrames = q.droppedVideoFrames;
    } else if (video.webkitDecodedFrameCount !== undefined) {
      totalFrames = video.webkitDecodedFrameCount;
      droppedFrames = video.webkitDroppedFrameCount;
    } else {
      return;
    }

    const prev = lastPlaybackQuality[cellNum];
    lastPlaybackQuality[cellNum] = { totalFrames, droppedFrames };

    if (!prev || totalFrames <= prev.totalFrames) return;

    const deltaTotal = totalFrames - prev.totalFrames;
    const deltaDropped = droppedFrames - prev.droppedFrames;

    if (deltaTotal >= 20) {
      const dropRatio = deltaDropped / deltaTotal;
      if (dropRatio > 0.15) {
        const currentCap = (hls.autoLevelCappedAt !== -1) ? hls.autoLevelCappedAt : (hls.levels.length - 1);
        if (currentCap > 0) {
          const newCap = currentCap - 1;
          hls.autoLevelCappedAt = newCap;
          hls.currentLevel = newCap;
          console.warn(`[Hardware Watchdog Celda ${cellNum}] ⚠️ Pérdida de frames detectada (${(dropRatio * 100).toFixed(1)}%). Bajando resolución a nivel ${newCap} (${hls.levels[newCap].height}p) para evitar tirones.`);
        }
      }
    }
  }, 5000);
}

function stopFrameDropWatchdog(cellNum) {
  if (watchdogTimers[cellNum]) {
    clearInterval(watchdogTimers[cellNum]);
    watchdogTimers[cellNum] = null;
  }
  lastPlaybackQuality[cellNum] = null;
}

function setStreamQualityMode(mode) {
  if (!['AUTO', 'LIGHT', 'MEDIUM', 'FULL'].includes(mode)) mode = 'AUTO';
  selectedQualityMode = mode;
  localStorage.setItem('vfx_stream_quality_mode', mode);
  console.log(`[Stream Optimizer] Modo de calidad seleccionado: ${mode} (Efectivo: ${getEffectiveQualityTier()})`);
  
  updateQualityBadgeUi();

  // Re-aplicar límites de resolución y memoria a todos los reproductores activos en tiempo real
  [1, 2, 3, 4].forEach(cellNum => {
    const hls = hlsPlayers[cellNum];
    if (hls) {
      applyResolutionCap(cellNum, hls, activeGridMode, currentMaximizedCellNum === cellNum);
      tuneHlsBuffers(hls, getEffectiveQualityTier(), activeGridMode);
    }
  });
}
window.setStreamQualityMode = setStreamQualityMode;

// HLS Player Instances
const hlsPlayers = { 1: null, 2: null, 3: null, 4: null };

// Strict Player Cleanup & Hardware Memory Release
function stopAndDestroyPlayer(cellNum) {
  stopFrameDropWatchdog(cellNum);
  if (hlsPlayers[cellNum]) {
    try {
      hlsPlayers[cellNum].stopLoad();
      hlsPlayers[cellNum].detachMedia();
      hlsPlayers[cellNum].destroy();
    } catch (err) {
      console.warn(`[HLS Cleanup Cell ${cellNum}]`, err);
    }
    hlsPlayers[cellNum] = null;
  }

  const cell = document.getElementById(`cell-${cellNum}`);
  if (cell) {
    const video = cell.querySelector('video');
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e) {}
    }
    const wrapper = cell.querySelector('.video-wrapper');
    if (wrapper) {
      wrapper.innerHTML = '';
    }
  }
}

// Cell Assignations
const cellChannels = {
  1: "gulfstream-park",
  2: "saratoga",
  3: "aqueduct",
  4: "parx-racing"
};

// DOM Elements
const elements = {
  loginModal: document.getElementById('loginModal'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  lblUserName: document.getElementById('lblUserName'),
  btnLogout: document.getElementById('btnLogout'),
  deviceBadgeText: document.getElementById('deviceBadgeText'),
  unauthorizedBanner: document.getElementById('unauthorizedBanner'),
  lblDevicePin: document.getElementById('lblDevicePin'),
  deviceModal: document.getElementById('deviceModal'),
  btnAdminModal: document.getElementById('btnAdminModal'),
  btnCloseDeviceModal: document.getElementById('btnCloseDeviceModal'),
  txtActivationPin: document.getElementById('txtActivationPin'),
  txtTvName: document.getElementById('txtTvName'),
  btnSubmitActivation: document.getElementById('btnSubmitActivation'),
  activationMsg: document.getElementById('activationMsg'),
  approvedDeviceTableBody: document.getElementById('approvedDeviceTableBody'),
  adminChannelsTableBody: document.getElementById('adminChannelsTableBody'),
  systemUsersTableBody: document.getElementById('systemUsersTableBody'),
  sidebarChannels: document.getElementById('sidebarChannels'),
  btnToggleSidebar: document.getElementById('btnToggleSidebar'),
  channelListContainer: document.getElementById('channelListContainer'),
  txtSearchChannel: document.getElementById('txtSearchChannel'),
  gridViewport: document.getElementById('gridViewport'),
  lblChannelCount: document.getElementById('lblChannelCount')
};

const urlParams = new URLSearchParams(window.location.search);
const queryService = urlParams.get('service');
if (queryService && ['hipica', 'loteria', 'deportes', 'tv_deportes', 'publicidad'].includes(queryService)) {
  sessionStorage.setItem('visual_fx_session_override', 'true');
  localStorage.setItem('visual_fx_service', queryService);
}

// Selected Service State (Prioridad 4)
let selectedService = (queryService && ['hipica', 'loteria', 'deportes', 'tv_deportes', 'publicidad'].includes(queryService))
  ? queryService
  : (localStorage.getItem('visual_fx_service') || 'hipica');

const SERVICES_MAP = {
  'hipica': { name: 'Carreras', panelId: null },
  'loteria': { name: 'Loterías', panelId: 'panelLottery' },
  'deportes': { name: 'Marcadores Deportivos', panelId: 'panelSports' },
  'tv_deportes': { name: 'Juegos y Eventos TV', panelId: 'panelLiveTv' },
  'publicidad': { name: 'Publicidad del Negocio', panelId: 'panelAds' }
};

function applyActiveServiceView(serviceId) {
  selectedService = serviceId || 'hipica';
  localStorage.setItem('visual_fx_service', selectedService);

  // Requisito 1: Sincronizar selector desplegable "Otros"
  const selService = document.getElementById('selServiceModules');
  if (selService) {
    selService.value = selectedService;
  }

  // Requisito 4: El botón "Hipódromos" sólo debe aparecer en el módulo de carreras (hípica)
  const btnSidebar = document.getElementById('btnToggleSidebar');
  if (btnSidebar) {
    btnSidebar.style.display = (selectedService === 'hipica' ? 'inline-flex' : 'none');
  }

  // Requisito 4: Quitar completamente "Fenix - Hípica en Directo" bajo el logo
  const subEl = document.getElementById('lblBrandSubtitle');
  if (subEl) {
    subEl.textContent = '';
    subEl.style.display = 'none';
  }

  // Alternar controles de cintillo según el servicio activo
  const hipControls = document.getElementById('hipicaHeaderControls');
  const lotControls = document.getElementById('lotteryHeaderControls');
  if (hipControls) hipControls.style.display = (selectedService === 'hipica' ? 'flex' : 'none');
  if (lotControls) lotControls.style.display = (selectedService === 'loteria' ? 'flex' : 'none');

  // Alternar controles de carrusel de loterías en cintillo flotante
  const cintilloLotControls = document.getElementById('cintilloLotteryControls');
  if (cintilloLotControls) {
    cintilloLotControls.style.display = (selectedService === 'loteria' ? 'inline-flex' : 'none');
  }

  // Ocultar todos los paneles de servicios alternativos
  document.querySelectorAll('.service-view-panel').forEach(p => p.style.display = 'none');

  if (selectedService === 'hipica') {
    // Requisito 6: La barra lateral permanece colapsada por defecto
    if (elements.gridViewport) elements.gridViewport.style.display = 'grid';
  } else {
    if (elements.sidebarChannels) elements.sidebarChannels.classList.add('collapsed');
    if (elements.gridViewport) elements.gridViewport.style.display = 'none';

    const targetPanelId = SERVICES_MAP[selectedService]?.panelId;
    if (targetPanelId) {
      const panel = document.getElementById(targetPanelId);
      if (panel) panel.style.display = 'block';
    }
  }

  // Control de ciclo de vida del módulo de Loterías
  if (selectedService === 'loteria') {
    startLotteryEngineView();
  } else {
    stopLotteryEngineView();
  }
}

// Selector Desplegable "Otros" (Requisito 1)
function switchServiceFromSelect(serviceKey) {
  if (!serviceKey) return;
  console.log(`[Visual-FX] Cambio de módulo desde lista desplegable Otros: ${serviceKey}`);
  switchDirectService(serviceKey);
}
window.switchServiceFromSelect = switchServiceFromSelect;

// Selector Desplegable Vista Rejilla 1, 2, 3, 4 (Requisito 5)
function switchLayoutGrid(count) {
  const num = parseInt(count, 10) || 1;
  console.log(`[Visual-FX] Cambio de vista de cuadrícula a: ${num}`);
  updateGridView(num);
}
window.switchLayoutGrid = switchLayoutGrid;

function switchDirectService(serviceId) {
  console.log(`[Visual-FX] Cambio directo de servicio solicitado: ${serviceId}`);
  sessionStorage.setItem('visual_fx_session_override', 'true');
  applyActiveServiceView(serviceId);
}
window.switchDirectService = switchDirectService;

// ==========================================
// Floating Header & Auto-Hide Controller (Requisito 7)
// ==========================================
// ==========================================
// Floating Header & Auto-Hide Controller (Requisito 7)
// ==========================================
let headerAutoHideTimer = null;
let isHeaderPinned = localStorage.getItem('visual_fx_header_pinned') === 'true'; // Flotante por defecto

let showHeaderTemporarily = (durationMs = 3500) => {
  if (window._showHeaderTemporarily) window._showHeaderTemporarily(durationMs);
};
let hideHeaderNow = () => {
  if (window._hideHeaderNow) window._hideHeaderNow();
};
window.showHeaderTemporarily = showHeaderTemporarily;
window.hideHeaderNow = hideHeaderNow;

function initFloatingHeader() {
  const header = document.getElementById('appHeader');
  const triggerBtn = document.getElementById('btnShowHeaderFloating');
  const hoverZone = document.getElementById('topHeaderHoverZone');
  const pinBtn = document.getElementById('btnPinHeader');
  const pinLbl = document.getElementById('lblPinState');

  function updatePinUi() {
    if (isHeaderPinned) {
      document.body.classList.add('header-pinned-active');
      if (header) {
        header.classList.remove('header-hidden');
        header.classList.add('header-pinned');
        header.classList.add('visible');
      }
      if (pinBtn) pinBtn.classList.add('pinned');
      if (pinLbl) pinLbl.textContent = 'Fijado';
    } else {
      document.body.classList.remove('header-pinned-active');
      if (header) {
        header.classList.remove('header-pinned');
      }
      if (pinBtn) pinBtn.classList.remove('pinned');
      if (pinLbl) pinLbl.textContent = 'Fijar';
    }
  }
  updatePinUi();

  hideHeaderNow = function() {
    if (isHeaderPinned || !header) return;
    header.classList.remove('visible');
    header.classList.add('header-hidden');
    document.body.classList.remove('header-is-visible');
  };
  window._hideHeaderNow = hideHeaderNow;
  window.hideHeaderNow = hideHeaderNow;

  showHeaderTemporarily = function(durationMs = 3500) {
    if (!header) return;
    header.classList.remove('header-hidden');
    header.classList.add('visible');
    document.body.classList.add('header-is-visible');
    if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
    if (!isHeaderPinned) {
      headerAutoHideTimer = setTimeout(() => {
        hideHeaderNow();
      }, durationMs);
    }
  };
  window._showHeaderTemporarily = showHeaderTemporarily;
  window.showHeaderTemporarily = showHeaderTemporarily;

  let headerHoverTriggerTimer = null;

  function cancelHoverTriggerTimer() {
    if (headerHoverTriggerTimer) {
      clearTimeout(headerHoverTriggerTimer);
      headerHoverTriggerTimer = null;
    }
  }

  // Activar en hover sobre la zona superior (con retardo de 2 segundos para no tapar los selectores de hipódromos)
  if (hoverZone) {
    hoverZone.addEventListener('mouseenter', () => {
      cancelHoverTriggerTimer();
      headerHoverTriggerTimer = setTimeout(() => {
        showHeaderTemporarily(4000);
      }, 2000);
    });
    hoverZone.addEventListener('mouseleave', () => {
      cancelHoverTriggerTimer();
    });
  }
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      cancelHoverTriggerTimer();
      showHeaderTemporarily(5000);
    });
  }

  let isCursorOverHeader = false;
  if (header) {
    header.addEventListener('mouseenter', () => {
      cancelHoverTriggerTimer();
      isCursorOverHeader = true;
      if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
      header.classList.remove('header-hidden');
      header.classList.add('visible');
      document.body.classList.add('header-is-visible');
    });
    header.addEventListener('mouseleave', () => {
      isCursorOverHeader = false;
      if (!isHeaderPinned) {
        if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
        headerAutoHideTimer = setTimeout(() => {
          if (!isCursorOverHeader) hideHeaderNow();
        }, 1500);
      }
    });
  }

  // Actividad del usuario:
  // - Solo cuando el cursor permanece al menos 2.0 segundos en el borde superior se despliega la cabecera.
  // - Si el cursor se ubica sobre el selector de hipódromo (.channel-select-dropdown), se cancela de inmediato para no estorbar.
  // - Si el cursor se aleja hacia el centro/abajo de la pantalla (Y > 65px), se oculta automáticamente.
  const onPointerActivity = (e) => {
    if (isHeaderPinned) return;
    if (e.clientY !== undefined) {
      const target = e.target;
      const isOverDropdown = target && (target.closest('.channel-select-dropdown') || target.closest('.cell-header'));
      if (isOverDropdown) {
        cancelHoverTriggerTimer();
        return;
      }

      if (e.clientY <= 28) {
        if (!headerHoverTriggerTimer && header && !header.classList.contains('visible')) {
          headerHoverTriggerTimer = setTimeout(() => {
            showHeaderTemporarily(4000);
          }, 2000);
        }
      } else {
        cancelHoverTriggerTimer();
        if (e.clientY > 65 && !isCursorOverHeader) {
          if (!headerAutoHideTimer) {
            headerAutoHideTimer = setTimeout(() => {
              if (!isCursorOverHeader && !isHeaderPinned) hideHeaderNow();
            }, 1200);
          }
        }
      }
    }
  };

  window.addEventListener('mousemove', onPointerActivity, { passive: true });
  window.addEventListener('touchstart', (e) => {
    if (isHeaderPinned) return;
    const touch = e.touches && e.touches[0];
    if (touch && touch.clientY <= 55) {
      showHeaderTemporarily(4000);
    }
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (isHeaderPinned) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(e.key)) {
      showHeaderTemporarily(2800);
    }
  }, { passive: true });

  // Mostrar 2.5s al arrancar y luego ocultar suavemente si no está fijada
  if (!isHeaderPinned && header) {
    showHeaderTemporarily(2500);
  }
}

function toggleHeaderPin() {
  isHeaderPinned = !isHeaderPinned;
  localStorage.setItem('visual_fx_header_pinned', isHeaderPinned);
  const header = document.getElementById('appHeader');
  const pinBtn = document.getElementById('btnPinHeader');
  const pinLbl = document.getElementById('lblPinState');

  if (isHeaderPinned) {
    document.body.classList.add('header-pinned-active');
    if (header) {
      header.classList.remove('header-hidden');
      header.classList.add('header-pinned');
      header.classList.add('visible');
    }
    if (pinBtn) pinBtn.classList.add('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijado';
    if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
  } else {
    document.body.classList.remove('header-pinned-active');
    if (header) {
      header.classList.remove('header-pinned');
      header.classList.add('visible');
    }
    if (pinBtn) pinBtn.classList.remove('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijar';
    if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
    headerAutoHideTimer = setTimeout(() => {
      if (!isHeaderPinned && header) {
        header.classList.remove('visible');
        header.classList.add('header-hidden');
        document.body.classList.remove('header-is-visible');
      }
    }, 2500);
  }
}
window.toggleHeaderPin = toggleHeaderPin;

// ==========================================
// Pantalla Completa Universal Nativa (F11 / Tecla F / Botones) (Petición 2)
// ==========================================
function isCurrentlyFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    document.body.classList.contains('app-fullscreen-mode')
  );
}

async function toggleAppFullscreen(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  const isFs = isCurrentlyFullscreen();
  const docEl = document.documentElement;

  if (isFs) {
    // SALIR de Pantalla Completa
    document.body.classList.remove('app-fullscreen-mode');
    updateFullscreenButtons(false);
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) {
      try {
        await exit.call(document);
      } catch (err) {}
    }
  } else {
    // ENTRAR a Pantalla Completa
    document.body.classList.add('app-fullscreen-mode');
    updateFullscreenButtons(true);
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    if (req) {
      try {
        await req.call(docEl);
      } catch (err) {
        console.warn('[Fullscreen Native Request Fallback to CSS]', err);
      }
    }
    // Si no está fijada la cabecera, ocultarla a los 1.5s de entrar a pantalla completa
    if (!isHeaderPinned) {
      const header = document.getElementById('appHeader');
      if (header) {
        setTimeout(() => {
          if (!isHeaderPinned && header) {
            header.classList.add('header-hidden');
            header.classList.remove('visible');
            document.body.classList.remove('header-is-visible');
          }
        }, 1500);
      }
    }
  }
}
window.toggleAppFullscreen = toggleAppFullscreen;

function updateFullscreenButtons(isFs) {
  const btns = document.querySelectorAll(
    '#btnToggleAppFullscreen, #btnHeaderFullscreen, .btn-header-fullscreen, #btnCintilloFullscreen, .btn-fullscreen-lottery, #btnFullscreenLotteryMain'
  );
  btns.forEach(b => {
    const fsText = b.querySelector('.fs-text') || b.querySelector('.cintillo-fs-text');
    if (fsText) {
      fsText.textContent = isFs ? 'Salir Pantalla Completa' : 'Pantalla Completa';
    } else {
      b.innerHTML = isFs ? '✕ Salir Pantalla Completa' : '<span class="icon">⛶</span> Pantalla Completa';
    }
    b.classList.toggle('active-fullscreen', isFs);
  });
}

// Sincronizador global de cambio de pantalla completa nativa (F11, botón o tecla F)
document.addEventListener('fullscreenchange', () => {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    document.body.classList.add('app-fullscreen-mode');
  } else {
    document.body.classList.remove('app-fullscreen-mode');
  }
  updateFullscreenButtons(isFs);
});

// Capturador Global de Tecla F y F11 para Pantalla Completa y Espacio para Pausar/Reanudar Carrusel
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'F11') {
    setTimeout(() => {
      const isFs = Boolean(document.fullscreenElement || window.innerHeight === screen.height);
      document.body.classList.toggle('app-fullscreen-mode', isFs);
      updateFullscreenButtons(isFs);
    }, 200);
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    e.stopPropagation();
    toggleAppFullscreen(e);
  } else if (e.code === 'Space' && selectedService === 'loteria') {
    e.preventDefault();
    e.stopPropagation();
    toggleLotteryCarouselPause();
  } else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && selectedService === 'loteria') {
    e.preventDefault();
    e.stopPropagation();
    goToPrevLotteryModule(true);
  } else if ((e.key === 'ArrowRight' || e.key === 'PageDown') && selectedService === 'loteria') {
    e.preventDefault();
    e.stopPropagation();
    goToNextLotteryModule(true);
  } else if (e.key === 'Home' && selectedService === 'loteria') {
    e.preventDefault();
    e.stopPropagation();
    goToFirstLotteryModule(true);
  } else if (e.key === 'End' && selectedService === 'loteria') {
    e.preventDefault();
    e.stopPropagation();
    goToLastLotteryModule(true);
  } else if (e.key === 'Escape') {
    if (isCurrentlyFullscreen()) {
      toggleAppFullscreen(e);
    }
  }
}, true);

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initDeviceId();
  initFloatingHeader();
  updateQualityBadgeUi();
  setupEventListeners();
  setupKeyboardNavigation();
  setupAdminTabs();
  startLotteryClock();
  
  applyActiveServiceView(selectedService);

  checkUserSession();
  await checkDeviceAuthorization();
  await loadChannelCatalog();
});

// Device ID Generator / Retriever
function initDeviceId() {
  let devId = localStorage.getItem('visual_fx_device_id');
  if (!devId) {
    devId = 'TV-FX-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('visual_fx_device_id', devId);
  }
  currentDeviceId = devId;
}

let devicePollingTimer = null;

// Device Authorization Check with Telemetry Heartbeat & Concurrency Detection
async function checkDeviceAuthorization() {
  try {
    let url = `/api/device/verify?deviceId=${currentDeviceId}&activeService=${selectedService}`;
    if (currentToken) {
      url += `&token=${encodeURIComponent(currentToken)}`;
    }
    const headers = {};
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const res = await fetch(url, { headers });
    const data = await res.json();
    
    const lblHw = document.getElementById('lblHardwareDevId');
    if (lblHw) lblHw.textContent = currentDeviceId;

    // Detección de Concurrencia (Sesión expulsada porque se inició en otro dispositivo)
    if (data.status === 'SESSION_KICKED') {
      handleConcurrentSessionKicked(data.message || 'Se inició sesión en otro dispositivo. Si no lo autorizó, contacte a su administrador.');
      return;
    }

    const isAuthorized = (data.status === 'APPROVED') || (currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'CLIENT_MANAGER'));

    if (isAuthorized) {
      if (elements.unauthorizedBanner) elements.unauthorizedBanner.style.display = 'none';
      if (elements.gridViewport && selectedService === 'hipica') {
        elements.gridViewport.style.display = 'grid';
      }
      elements.deviceBadgeText.textContent = data.device ? `${data.device.tvName} [AUTORIZADO]` : `Consola Administrador [AUTORIZADO]`;
      
      // Mantener heartbeat periódico para detectar si otro dispositivo inicia sesión con esta cuenta
      if (!devicePollingTimer) {
        devicePollingTimer = setInterval(checkDeviceAuthorization, 3500);
      }

      // 1. Marca Dinámica por Cliente: Reemplazar por el nombre real del cliente
      const clientTitle = data.clientName || (data.device && data.device.clientName) || (currentUser && (currentUser.clientName || currentUser.clientId)) || 'Fenix';
      const subEl = document.getElementById('lblBrandSubtitle');
      if (subEl) {
        subEl.textContent = '';
        subEl.style.display = 'none';
      }
      const adminSub = document.getElementById('lblAdminModalSubtitle');
      if (adminSub) {
        adminSub.textContent = `Gestión Centralizada ${clientTitle} • Dispositivos, Canales y Usuarios`;
      }

      // 2. Jerarquía de Seguridad: Los operadores humanos (Super Admin y Clientes) NUNCA son TV displays
      const isOperator = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'CLIENT_MANAGER' || currentUser.role === 'TECH_CHIEF');
      const isTvDisplay = !isOperator && (IS_SMART_TV || (currentUser && currentUser.role === 'DEVICE') || (data.device && data.device.tvName));

      if (isTvDisplay) {
        document.body.classList.add('authorized-screen');
        if (elements.btnAdminModal) elements.btnAdminModal.style.display = 'none';
        const profileArea = document.getElementById('userProfileArea');
        if (profileArea) profileArea.style.display = 'none';
      } else {
        document.body.classList.remove('authorized-screen');
        if (elements.btnAdminModal) elements.btnAdminModal.style.display = 'inline-flex';
        const profileArea = document.getElementById('userProfileArea');
        if (profileArea) profileArea.style.display = 'flex';
      }

      // Aplicar configuración guardada del cliente o remota de la pantalla
      if (currentUser && currentUser.config) {
        applyScreenConfig(currentUser.config);
      } else if (data.config) {
        applyScreenConfig(data.config);
      } else if (data.device && data.device.config) {
        applyScreenConfig(data.device.config);
      }

      // Aplicar servicio de inicio por defecto asignado al televisor al encenderse
      if (data.device && (data.device.defaultService || data.device.activeService)) {
        const remoteDefault = data.device.defaultService || data.device.activeService;
        const hasSessionOverride = sessionStorage.getItem('visual_fx_session_override');
        if (!hasSessionOverride && remoteDefault !== selectedService) {
          applyActiveServiceView(remoteDefault);
        }
      }
    } else {
      if (elements.unauthorizedBanner) elements.unauthorizedBanner.style.display = 'flex';
      elements.deviceBadgeText.textContent = `Sin Sesión Activa`;
      if (devicePollingTimer) {
        clearInterval(devicePollingTimer);
        devicePollingTimer = null;
      }
      if (elements.loginModal) {
        elements.loginModal.style.setProperty('display', 'flex', 'important');
      }
    }
  } catch (err) {
    console.error('Error verificando dispositivo:', err);
  }
}

// Expulsión de Sesión Concurrente (Single Active Session Enforcement)
function handleConcurrentSessionKicked(msg) {
  console.warn('[Auth] Concurrencia detectada:', msg);
  if (devicePollingTimer) {
    clearInterval(devicePollingTimer);
    devicePollingTimer = null;
  }
  handleLogout();

  const modal = document.getElementById('sessionKickedModal');
  const lbl = document.getElementById('lblSessionKickedMessage');
  if (lbl && msg) lbl.textContent = msg;
  if (modal) {
    modal.style.setProperty('display', 'flex', 'important');
  }
}
window.handleConcurrentSessionKicked = handleConcurrentSessionKicked;

window.reopenLoginFromKick = function() {
  const modal = document.getElementById('sessionKickedModal');
  if (modal) modal.style.display = 'none';
  if (elements.loginModal) {
    elements.loginModal.style.setProperty('display', 'flex', 'important');
    const txtUser = document.getElementById('txtUser');
    if (txtUser) txtUser.focus();
  }
};

// User Session
function checkUserSession() {
  const savedToken = localStorage.getItem('visual_fx_token');
  const savedUser = localStorage.getItem('visual_fx_user');
  
  const btnLoginHeader = document.getElementById('btnLoginHeader');
  const profileArea = document.getElementById('userProfileArea');

  if (savedToken && savedUser) {
    try {
      currentToken = savedToken;
      currentUser = JSON.parse(savedUser);
      document.body.classList.add('has-session');
      
      let roleBadge = '🏢 CLIENTE';
      if (currentUser.role === 'SUPER_ADMIN') roleBadge = '👑 SUPER ADMIN';
      else if (currentUser.role === 'TECH_CHIEF') roleBadge = '🛠️ JEFE TÉCNICO';
      else if (currentUser.role === 'DEVICE') roleBadge = '📺 PANTALLA TV';

      if (elements.lblUserName) {
        elements.lblUserName.textContent = `${currentUser.name || currentUser.username} (${roleBadge})`;
      }
      elements.loginModal.style.display = 'none';
      if (elements.unauthorizedBanner) elements.unauthorizedBanner.style.display = 'none';

      const isDevice = (currentUser.role === 'DEVICE');
      if (profileArea) profileArea.style.display = isDevice ? 'none' : 'inline-flex';
      if (btnLoginHeader) btnLoginHeader.style.display = 'none';
      if (elements.btnAdminModal) elements.btnAdminModal.style.display = isDevice ? 'none' : 'inline-flex';
      if (isDevice) document.body.classList.add('authorized-screen');

      if (elements.gridViewport && selectedService === 'hipica') {
        elements.gridViewport.style.display = 'grid';
      }
    } catch (e) {
      localStorage.removeItem('visual_fx_token');
      localStorage.removeItem('visual_fx_user');
      currentToken = null;
      currentUser = null;
      document.body.classList.remove('has-session');
      if (profileArea) profileArea.style.display = 'none';
      if (btnLoginHeader) btnLoginHeader.style.display = 'inline-flex';
    }
  } else {
    currentToken = null;
    currentUser = null;
    document.body.classList.remove('has-session');
    if (profileArea) profileArea.style.display = 'none';
    if (btnLoginHeader) btnLoginHeader.style.display = 'inline-flex';
  }
}

// Abrir Panel de Control Administrativo Ejecutivo según Rol
function openExecutiveAdminModal() {
  if (IS_SMART_TV) {
    console.warn('[Security] Panel Administrativo restringido en pantallas Smart TV.');
    return;
  }
  if (!currentUser) {
    openAdminModalDirectly();
    return;
  }

  elements.deviceModal.style.display = 'flex';
  
  // Limpiar campos de creación de TV para que no tengan nada preestablecido ni autocompletado
  const clearDeviceInputs = () => {
    if (document.getElementById('txtNewDeviceTvName')) document.getElementById('txtNewDeviceTvName').value = '';
    if (document.getElementById('txtNewDeviceUser')) document.getElementById('txtNewDeviceUser').value = '';
    if (document.getElementById('txtNewDevicePass')) document.getElementById('txtNewDevicePass').value = '';
  };
  clearDeviceInputs();
  setTimeout(clearDeviceInputs, 60);
  setTimeout(clearDeviceInputs, 250);

  const isSuperAdmin = (currentUser.role === 'SUPER_ADMIN');
  const isTech = isSuperAdmin || (currentUser.role === 'TECH_CHIEF');
  const isClient = (currentUser.role === 'CLIENT_MANAGER');

  // Control de visibilidad de las pestañas según Rol
  const tabBtnClients = document.getElementById('tabBtnClients');
  const tabBtnDevices = document.getElementById('tabBtnDevices');
  const tabBtnChannels = document.getElementById('tabBtnChannels');
  const tabBtnUsers = document.getElementById('tabBtnUsers');
  const tabBtnAnalytics = document.getElementById('tabBtnAnalytics');
  const tabBtnLottery = document.getElementById('tabBtnLottery');
  const tabBtnScreenConfig = document.getElementById('tabBtnScreenConfig');

  if (tabBtnClients) tabBtnClients.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (tabBtnDevices) tabBtnDevices.style.display = 'inline-block';
  if (tabBtnScreenConfig) tabBtnScreenConfig.style.display = (isSuperAdmin || isClient) ? 'inline-block' : 'none';
  if (tabBtnChannels) tabBtnChannels.style.display = isTech ? 'inline-block' : 'none';
  if (tabBtnUsers) tabBtnUsers.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (tabBtnAnalytics) tabBtnAnalytics.style.display = (isSuperAdmin || isTech) ? 'inline-block' : 'none';
  if (tabBtnLottery) tabBtnLottery.style.display = isTech ? 'inline-block' : 'none';

  // Configuración de la pestaña Dispositivos
  const boxActivateDevice = document.getElementById('boxActivateDevice');
  const boxSuperAdminFilter = document.getElementById('boxSuperAdminDeviceFilter');
  const lblDevicesTableTitle = document.getElementById('lblDevicesTableTitle');

  if (boxActivateDevice) {
    // Exclusivo para el cliente/encargado. El Super Admin NO activa pantallas.
    boxActivateDevice.style.display = isClient ? 'block' : 'none';
  }

  if (boxSuperAdminFilter) {
    // Filtro por cliente exclusivo para Super Admin
    boxSuperAdminFilter.style.display = isSuperAdmin ? 'block' : 'none';
  }

  if (lblDevicesTableTitle) {
    lblDevicesTableTitle.textContent = isSuperAdmin
      ? '🌳 Árbol Global de Pantallas Autorizadas (Todas las Organizaciones)'
      : `📺 Mis Pantallas Autorizadas (${currentUser.clientName || currentUser.clientId || 'Fenix'})`;
  }

  // Activar la pestaña adecuada por defecto
  if (isSuperAdmin) {
    switchAdminTab('tab-clients');
  } else if (isTech) {
    switchAdminTab('tab-channels');
  } else {
    switchAdminTab('tab-devices');
    // Si el televisor está en pantalla de activación, sugerir el PIN
    if (elements.unauthorizedBanner && elements.unauthorizedBanner.style.display !== 'none') {
      const currentPin = elements.lblDevicePin ? elements.lblDevicePin.textContent.trim() : '';
      if (elements.txtActivationPin && currentPin && !elements.txtActivationPin.value) {
        elements.txtActivationPin.value = currentPin;
      }
      if (elements.txtTvName && !elements.txtTvName.value) {
        elements.txtTvName.value = `Pantalla ${currentDeviceId}`;
      }
    }
  }

  // Cargar datos según rol
  if (isSuperAdmin) {
    loadClientsList();
    loadApprovedDevicesList();
    populateAdminChannelsTable();
    loadSystemUsersList();
    loadSystemAnalytics();
  } else if (isTech) {
    loadApprovedDevicesList();
    populateAdminChannelsTable();
    loadSystemAnalytics();
  } else {
    loadApprovedDevicesList();
  }
}

// Abrir Modal de Login Limpio (Colores claros, sin datos precargados)
function openAdminModalDirectly() {
  if (currentToken && currentUser) {
    openExecutiveAdminModal();
    return;
  }

  const txtUser = document.getElementById('txtUser');
  const txtPass = document.getElementById('txtPass');
  const chkRemember = document.getElementById('chkRememberLogin');
  const loginErr = document.getElementById('loginError');
  const btnClose = document.getElementById('btnCloseLoginModal');

  const isRemembered = localStorage.getItem('visual_fx_remember_login') === 'true';
  const savedUser = localStorage.getItem('visual_fx_saved_username') || '';
  const savedPass = localStorage.getItem('visual_fx_saved_password') || '';

  if (isRemembered && savedUser) {
    if (chkRemember) chkRemember.checked = true;
    if (txtUser) txtUser.value = savedUser;
    if (txtPass) txtPass.value = savedPass;
  } else {
    if (chkRemember) chkRemember.checked = false;
    const forceClear = () => {
      if (localStorage.getItem('visual_fx_remember_login') !== 'true') {
        if (txtUser) txtUser.value = '';
        if (txtPass) txtPass.value = '';
      }
    };
    forceClear();
    setTimeout(forceClear, 50);
    setTimeout(forceClear, 150);
    setTimeout(forceClear, 300);
  }

  if (loginErr) {
    loginErr.style.display = 'none';
    loginErr.textContent = '';
  }
  if (btnClose) {
    btnClose.style.display = 'flex';
  }

  elements.loginModal.style.setProperty('display', 'flex', 'important');
  elements.loginModal.style.setProperty('z-index', '999999', 'important');
  setTimeout(() => {
    if (txtUser && (!isRemembered || !savedUser)) txtUser.focus();
  }, 100);
}

// Cerrar Modal de Login con 'X'
function closeLoginModalSafely() {
  elements.loginModal.style.display = 'none';
  const txtUser = document.getElementById('txtUser');
  const txtPass = document.getElementById('txtPass');
  const isRemembered = localStorage.getItem('visual_fx_remember_login') === 'true';
  if (!isRemembered) {
    if (txtUser) txtUser.value = '';
    if (txtPass) txtPass.value = '';
  }
}

// User Login Submission
elements.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('txtUser').value.trim();
  const password = document.getElementById('txtPass').value.trim();
  const chkRemember = document.getElementById('chkRememberLogin');
  
  elements.loginError.style.display = 'none';
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      if (chkRemember && chkRemember.checked) {
        localStorage.setItem('visual_fx_remember_login', 'true');
        localStorage.setItem('visual_fx_saved_username', username);
        localStorage.setItem('visual_fx_saved_password', password);
      } else {
        localStorage.removeItem('visual_fx_remember_login');
        localStorage.removeItem('visual_fx_saved_username');
        localStorage.removeItem('visual_fx_saved_password');
      }

      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('visual_fx_token', currentToken);
      localStorage.setItem('visual_fx_user', JSON.stringify(currentUser));
      
      checkUserSession();
      await checkDeviceAuthorization();

      // Cerrar modal de login
      if (elements.loginModal) elements.loginModal.style.display = 'none';

      // Restaurar servicio activo e iniciar transmisiones
      applyActiveServiceView(selectedService);
      if (selectedService === 'hipica') {
        await loadChannelCatalog();
        updateGridView(activeGridMode || 1);
      }
    } else {
      elements.loginError.textContent = data.error || 'Credenciales inválidas.';
      elements.loginError.style.display = 'block';
    }
  } catch (err) {
    elements.loginError.textContent = 'Error de conexión con el servidor.';
    elements.loginError.style.display = 'block';
  }
});

// Logout handler (Cierre de Sesión Total, Congelamiento de Video y Redirección a Landing - Requisito 3)
function handleLogout() {
  console.log('[Auth] Cerrando sesión, deteniendo transmisiones y redirigiendo...');
  localStorage.removeItem('visual_fx_token');
  localStorage.removeItem('visual_fx_user');
  sessionStorage.removeItem('visual_fx_session_override');
  currentToken = null;
  currentUser = null;
  document.body.classList.remove('has-session');
  document.body.classList.remove('authorized-screen');

  // 1. Detener y purgar todos los reproductores de video activos inmediatamente
  [1, 2, 3, 4].forEach(num => {
    stopAndDestroyPlayer(num);
  });
  stopTestMonitorPlayer();

  // 2. Desactivar y pausar todos los elementos de video en el documento
  document.querySelectorAll('video').forEach(v => {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch(e) {}
  });

  // 3. Ocultar cuadrícula de carreras y panel de loterías
  if (elements.gridViewport) elements.gridViewport.style.display = 'none';
  const panelLot = document.getElementById('panelLottery');
  if (panelLot) panelLot.style.display = 'none';

  if (elements.deviceModal) elements.deviceModal.style.display = 'none';
  const serviceModal = document.getElementById('serviceSelectorModal');
  if (serviceModal) serviceModal.style.display = 'none';

  // 4. Redirigir de inmediato a la landing page de Visual-FX
  window.location.replace('/landing.html');
}
window.handleLogout = handleLogout;

const btnLogoutHeader = document.getElementById('btnLogoutHeader');
if (btnLogoutHeader) {
  btnLogoutHeader.addEventListener('click', handleLogout);
}
const btnLogoutAdminModal = document.getElementById('btnLogoutAdminModal');
if (btnLogoutAdminModal) {
  btnLogoutAdminModal.addEventListener('click', handleLogout);
}

// Load Channels & Prioritize Active RTN On Air Simulcasts (Refresco cada 10 min - Requisitos 1 y 2)
async function loadChannelCatalog() {
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();
    channelCatalog = data.channels || [];

    // Ordenar: Primero los hipódromos EN VIVO (onAir), luego alfabéticamente por nombre
    channelCatalog.sort((a, b) => {
      if (a.onAir && !b.onAir) return -1;
      if (!a.onAir && b.onAir) return 1;
      return a.name.localeCompare(b.name);
    });

    const activeChannels = channelCatalog.filter(c => c.onAir);
    const activeCount = activeChannels.length;
    
    // Requisito 1: Simplificar título y conteo (Ej. "39 En Vivo")
    if (elements.lblChannelCount) {
      elements.lblChannelCount.textContent = `${activeCount} En Vivo`;
    }
    const lblAct = document.getElementById('lblFilterActiveCount');
    const lblAll = document.getElementById('lblFilterAllCount');
    if (lblAct) lblAct.textContent = activeCount;
    if (lblAll) lblAll.textContent = channelCatalog.length;
    
    const isInitialCatalogLoad = !window._catalogHasLoadedOnce;
    window._catalogHasLoadedOnce = true;

    if (isInitialCatalogLoad) {
      // Solo en la carga inicial de inicio asignar canales por defecto si las celdas están vacías
      if (activeChannels.length > 0) {
        [1, 2, 3, 4].forEach((num, idx) => {
          if (!cellChannels[num]) {
            cellChannels[num] = activeChannels[idx % activeChannels.length].id;
          }
        });
      }
      filterAndRenderChannels(elements.txtSearchChannel ? elements.txtSearchChannel.value.trim().toLowerCase() : '');
      populateSelectDropdowns();
      updateGridView(activeGridMode);
    } else {
      // En refrescos periódicos subsecuentes (cada 10 min):
      // NUNCA reiniciar reproductores de video ni sobrescribir canales en curso
      filterAndRenderChannels(elements.txtSearchChannel ? elements.txtSearchChannel.value.trim().toLowerCase() : '');
      populateSelectDropdowns();
      console.log('[Visual-FX] Catálogo de hipódromos actualizado en segundo plano sin interrumpir transmisiones activas.');
    }
  } catch (err) {
    console.error('Error cargando canales:', err);
  }
}

// Tasa de refrescamiento de hipódromos en vivo cada 10 minutos (Requisito 2)
setInterval(() => {
  console.log('[Visual-FX] Refrescando catálogo de hipódromos en vivo (cada 10 min)...');
  loadChannelCatalog();
}, 10 * 60 * 1000);

// Modo de filtrado del panel lateral: 'active' (Solo En Vivo) | 'all' (Todos)
let sidebarFilterMode = 'active';

function setSidebarFilter(mode) {
  sidebarFilterMode = mode;
  const btnAct = document.getElementById('btnFilterActiveOnly');
  const btnAll = document.getElementById('btnFilterAll');
  if (btnAct) btnAct.classList.toggle('active', mode === 'active');
  if (btnAll) btnAll.classList.toggle('active', mode === 'all');

  const search = elements.txtSearchChannel ? elements.txtSearchChannel.value.trim().toLowerCase() : '';
  filterAndRenderChannels(search);
}
window.setSidebarFilter = setSidebarFilter;

function filterAndRenderChannels(searchTerm = '') {
  let list = channelCatalog;
  if (sidebarFilterMode === 'active') {
    list = list.filter(c => c.onAir);
  }
  if (searchTerm) {
    list = list.filter(c => 
      c.name.toLowerCase().includes(searchTerm) || 
      (c.location && c.location.toLowerCase().includes(searchTerm)) ||
      (c.aliases && c.aliases.some(a => a.toLowerCase().includes(searchTerm)))
    );
  }
  renderChannelList(list);
}

// Render Channel Sidebar List con Resaltado, Categorías y Sombreado (Petición 1)
function renderChannelList(channels) {
  elements.channelListContainer.innerHTML = '';
  
  if (channels.length === 0) {
    elements.channelListContainer.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 0.9rem;">
        ${sidebarFilterMode === 'active' ? '🏇 No hay hipódromos con carreras en vivo en este momento.' : 'No se encontraron hipódromos.'}
      </div>
    `;
    return;
  }

  // Si está en modo "Todos", separar explícitamente los activos de los inactivos con cabeceras visuales
  if (sidebarFilterMode === 'all') {
    const activeList = channels.filter(c => c.onAir);
    const inactiveList = channels.filter(c => !c.onAir);

    if (activeList.length > 0) {
      const hActive = document.createElement('div');
      hActive.style.cssText = 'padding: 8px 14px; font-size: 0.78rem; font-weight: 800; color: #34d399; background: rgba(16, 185, 129, 0.12); border-left: 3px solid #10b981; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;';
      hActive.textContent = `🟢 En Vivo (${activeList.length} Hipódromos con Carreras Activas)`;
      elements.channelListContainer.appendChild(hActive);

      activeList.forEach(ch => renderSingleChannelCard(ch));
    }

    if (inactiveList.length > 0) {
      const hInactive = document.createElement('div');
      hInactive.style.cssText = 'padding: 8px 14px; font-size: 0.78rem; font-weight: 800; color: #94a3b8; background: rgba(255, 255, 255, 0.05); border-left: 3px solid #64748b; border-radius: 4px; margin: 18px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;';
      hInactive.textContent = `⚪ Fuera de Aire (${inactiveList.length} Hipódromos Sin Actividad Hoy)`;
      elements.channelListContainer.appendChild(hInactive);

      inactiveList.forEach(ch => renderSingleChannelCard(ch));
    }
    return;
  }

  // En modo "En Vivo" (Por defecto): Cabecera y solo canales activos
  const hOnlyActive = document.createElement('div');
  hOnlyActive.style.cssText = 'padding: 8px 14px; font-size: 0.78rem; font-weight: 800; color: #34d399; background: rgba(16, 185, 129, 0.12); border-left: 3px solid #10b981; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;';
  hOnlyActive.textContent = `🟢 Solo Hipódromos con Carreras Activas (${channels.length})`;
  elements.channelListContainer.appendChild(hOnlyActive);

  channels.forEach(ch => renderSingleChannelCard(ch));
}

function renderSingleChannelCard(ch) {
  const card = document.createElement('div');
  card.className = `channel-card ${ch.onAir ? 'on-air' : 'off-air'}`;
  card.setAttribute('tabindex', '0');
  
  const liveBadgeHtml = ch.onAir
    ? `<span class="badge-live active"><span class="live-dot green"></span> EN VIVO</span>`
    : `<span class="badge-live off"><span class="live-dot gray"></span> FUERA DE AIRE</span>`;

  card.innerHTML = `
    <div class="channel-card-top">
      <span class="channel-card-name">${ch.flag || '🏇'} ${ch.name}</span>
      ${liveBadgeHtml}
    </div>
    <div class="channel-card-loc">📍 ${ch.location || 'Simulcast'} • ${ch.nextRace || (ch.onAir ? 'Transmisión RTN HD' : 'Sin carreras')}</div>
    <div class="channel-card-actions">
      <button class="btn-assign-cell" data-cell="1" data-channel="${ch.id}" title="Transmitir en Pantalla 1">P1</button>
      <button class="btn-assign-cell" data-cell="2" data-channel="${ch.id}" title="Transmitir en Pantalla 2">P2</button>
      <button class="btn-assign-cell" data-cell="3" data-channel="${ch.id}" title="Transmitir en Pantalla 3">P3</button>
      <button class="btn-assign-cell" data-cell="4" data-channel="${ch.id}" title="Transmitir en Pantalla 4">P4</button>
    </div>
  `;
  
  card.querySelectorAll('.btn-assign-cell').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetCell = parseInt(btn.dataset.cell);
      const channelId = btn.dataset.channel;
      assignChannelToCell(targetCell, channelId);
    });
  });

  card.addEventListener('click', () => {
    assignChannelToCell(focusedCellIndex, ch.id);
  });

  elements.channelListContainer.appendChild(card);
}

// Populate Select Dropdowns inside each Video Cell (Únicamente Hipódromos EN VIVO - Requisito 2)
function populateSelectDropdowns() {
  const activeChannels = channelCatalog.filter(c => c.onAir);

  [1, 2, 3, 4].forEach(cellNum => {
    const select = document.getElementById(`selectCell${cellNum}`);
    if (!select) return;
    
    select.innerHTML = '';

    if (activeChannels.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '⚠️ Sin carreras en vivo en este momento';
      select.appendChild(option);
      return;
    }

    activeChannels.forEach(ch => {
      const option = document.createElement('option');
      option.value = ch.id;
      option.textContent = `🟢 ${ch.flag || '🏇'} ${ch.name}${ch.nextRace ? ' • ' + ch.nextRace : ''}`;
      if (ch.id === cellChannels[cellNum]) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    if (cellChannels[cellNum]) {
      select.value = cellChannels[cellNum];
    }

    select.onchange = (e) => {
      assignChannelToCell(cellNum, e.target.value);
    };
  });
}

// Assign Channel to Cell & Play (Requisito 3: Seguro y sin errores de DOM)
function assignChannelToCell(cellNum, channelId) {
  const channel = channelCatalog.find(c => c.id === channelId);
  if (!channel) return;
  
  cellChannels[cellNum] = channelId;
  
  const elFlag = document.getElementById(`cell${cellNum}Flag`);
  if (elFlag) elFlag.textContent = channel.flag;
  const elName = document.getElementById(`cell${cellNum}Name`);
  if (elName) elName.textContent = channel.name;
  const elStatus = document.getElementById(`cell${cellNum}StatusText`);
  if (elStatus) elStatus.textContent = channel.statusText || 'Carreras en Vivo';
  
  const select = document.getElementById(`selectCell${cellNum}`);
  if (select && select.value !== channelId) select.value = channelId;

  const targetUrl = channel.streamUrl || channel.iframeUrl;
  if (channel.type === 'iframe') {
    playIframeInCell(cellNum, targetUrl);
  } else {
    playStreamInCell(cellNum, channel.proxyUrl, targetUrl);
  }
}

// Play iFrame Embed (Requisito 3: Carga directa de señal con pantalla completa y autoplay)
function playIframeInCell(cellNum, iframeUrl) {
  stopAndDestroyPlayer(cellNum);

  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;
  const wrapper = cell.querySelector('.video-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <iframe src="${iframeUrl}" style="width:100%; height:100%; border:none; display:block;" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  `;
}

// Play HLS Stream with Smart TV Optimization & Resource Reclamation
function playStreamInCell(cellNum, proxyUrl, rawStreamUrl) {
  stopAndDestroyPlayer(cellNum);

  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;
  const wrapper = cell.querySelector('.video-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <video id="video-${cellNum}" autoplay muted playsinline style="width:100%; height:100%; object-fit:contain; transform: translateZ(0); -webkit-transform: translateZ(0);"></video>
    <div class="video-loader" id="loader-${cellNum}"><div class="spinner"></div><span>Conectando Señal HD...</span></div>
  `;

  const video = document.getElementById(`video-${cellNum}`);
  const loader = document.getElementById(`loader-${cellNum}`);

  const primaryUrl = `${proxyUrl}&deviceId=${currentDeviceId}`;

  function startHls(targetUrl, isFallback = false) {
    if (Hls.isSupported()) {
      const isMultiCell = activeGridMode > 1;
      const isUltraMulti = activeGridMode >= 3;
      const effectiveTier = getEffectiveQualityTier();
      const isLight = (effectiveTier === HARDWARE_TIERS.LIGHT);
      const isMedium = (effectiveTier === HARDWARE_TIERS.MEDIUM);
      const isFull = (effectiveTier === HARDWARE_TIERS.FULL);
      
      const hls = new Hls({
        enableWorker: isFull || (isMedium && hardwareProfile.cores >= 4),
        lowLatencyMode: false,
        capLevelToPlayerSize: !isFull,
        backBufferLength: isLight ? 0 : (isMedium ? 10 : 30),
        maxBufferLength: isLight ? (isUltraMulti ? 2 : (isMultiCell ? 3 : 4)) : (isMedium ? (isUltraMulti ? 5 : (isMultiCell ? 8 : 12)) : (isMultiCell ? 12 : 25)),
        maxMaxBufferLength: isLight ? (isUltraMulti ? 4 : (isMultiCell ? 5 : 7)) : (isMedium ? (isUltraMulti ? 8 : (isMultiCell ? 12 : 18)) : (isMultiCell ? 20 : 40)),
        maxBufferSize: isLight ? (isUltraMulti ? 1.5 * 1024 * 1024 : (isMultiCell ? 2.5 * 1024 * 1024 : 4 * 1024 * 1024)) : (isMedium ? (isMultiCell ? 6 * 1024 * 1024 : 12 * 1024 * 1024) : 30 * 1024 * 1024),
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetries: 5,
        startLevel: isLight ? 0 : -1,
        testBandwidth: true
      });

      hls.loadSource(targetUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (loader) loader.style.display = 'none';

        applyResolutionCap(cellNum, hls, activeGridMode, currentMaximizedCellNum === cellNum);
        startFrameDropWatchdog(cellNum, video, hls);

        video.play().catch(e => console.log('Auto-play defer:', e));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS Network Error] Intentando recuperar...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS Media Error] Intentando recuperar media...');
              hls.recoverMediaError();
              break;
            default:
              if (!isFallback && rawStreamUrl) {
                stopAndDestroyPlayer(cellNum);
                startHls(rawStreamUrl, true);
              } else {
                stopAndDestroyPlayer(cellNum);
              }
              break;
          }
        }
      });

      hlsPlayers[cellNum] = hls;

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl;
      video.addEventListener('loadedmetadata', () => {
        if (loader) loader.style.display = 'none';
        video.play();
      });
    }
  }

  startHls(primaryUrl);
  video.muted = (cellNum !== activeAudioCell);
}

// Grid Layout Matrix Switcher with Aggressive Memory Release
function updateGridView(gridCount) {
  activeGridMode = gridCount;
  elements.gridViewport.setAttribute('data-grid', gridCount);

  // Sincronizar selector desplegable de vistas 1, 2, 3, 4 (Requisito 5)
  const selLayout = document.getElementById('selLayoutGrid');
  if (selLayout) selLayout.value = String(gridCount);

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.grid) === gridCount);
  });

  [1, 2, 3, 4].forEach(cellNum => {
    const cell = document.getElementById(`cell-${cellNum}`);
    if (!cell) return;

    if (cellNum <= gridCount) {
      cell.style.display = 'flex';
      assignChannelToCell(cellNum, cellChannels[cellNum]);
    } else {
      cell.style.display = 'none';
      stopAndDestroyPlayer(cellNum);
    }
  });

  // Re-aplicar límites de resolución y buffers según la nueva cantidad de pantallas
  [1, 2, 3, 4].forEach(num => {
    if (hlsPlayers[num]) {
      applyResolutionCap(num, hlsPlayers[num], gridCount, currentMaximizedCellNum === num);
      tuneHlsBuffers(hlsPlayers[num], getEffectiveQualityTier(), gridCount);
    }
  });

  if (focusedCellIndex > gridCount) {
    setFocusedCell(1);
  }
}

// Handle Background / Visibility Change to Pause Inactive Video Consumption
document.addEventListener('visibilitychange', () => {
  const isHidden = document.hidden;
  [1, 2, 3, 4].forEach(cellNum => {
    const hls = hlsPlayers[cellNum];
    if (hls) {
      if (isHidden) {
        hls.stopLoad();
      } else if (cellNum <= activeGridMode) {
        hls.startLoad();
      }
    }
  });
});

// Audio Focus (Toggle Audio On / Mute All - Requisito 9)
function setAudioFocus(targetCellNum) {
  if (activeAudioCell === targetCellNum) {
    // Si ya tiene sonido, al hacer clic de nuevo se SILENCIA por completo
    activeAudioCell = null;
  } else {
    // Activar sonido en la celda seleccionada y silenciar las demás
    activeAudioCell = targetCellNum;
  }
  
  [1, 2, 3, 4].forEach(num => {
    const video = document.getElementById(`video-${num}`);
    const btnAudio = document.getElementById(`btnAudio${num}`);
    
    const isThisCellAudio = (num === activeAudioCell);
    if (video) {
      video.muted = !isThisCellAudio;
    }
    
    if (btnAudio) {
      if (isThisCellAudio) {
        btnAudio.classList.add('active');
        btnAudio.innerHTML = `<span class="icon">🔊</span> <span class="audio-text">AUDIO ACTIVO</span>`;
      } else {
        btnAudio.classList.remove('active');
        btnAudio.innerHTML = `<span class="icon">🔇</span> <span class="audio-text">SILENCIADO</span>`;
      }
    }
  });
}
window.setAudioFocus = setAudioFocus;

let currentMaximizedCellNum = null;
let savedMulticanalGridMode = null;
let raceAutoRestoreTimer = null;

function maximizeCellCss(cellNum) {
  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;

  if (activeGridMode > 1) {
    savedMulticanalGridMode = activeGridMode;
  }

  [1, 2, 3, 4].forEach(n => {
    const c = document.getElementById(`cell-${n}`);
    if (c) c.classList.remove('cell-maximized');
  });

  cell.classList.add('cell-maximized');
  currentMaximizedCellNum = cellNum;

  // Optimización dinámica de resolución: al maximizar, desbloquear resolución de pantalla completa en esta celda
  if (hlsPlayers[cellNum]) {
    applyResolutionCap(cellNum, hlsPlayers[cellNum], 1, true);
    tuneHlsBuffers(hlsPlayers[cellNum], getEffectiveQualityTier(), 1);
  }

  // Enfocar audio automáticamente en la celda maximizada
  setAudioFocus(cellNum);

  const btnReturn = document.getElementById('btnReturnMulticanal');
  if (btnReturn) {
    const gridLabel = savedMulticanalGridMode ? ` (${savedMulticanalGridMode} Pantallas)` : '';
    btnReturn.innerHTML = `<span class="btn-icon">↩</span> Volver a Multicanal${gridLabel}`;
    btnReturn.style.display = 'inline-flex';
  }
  console.log(`[Visual-FX] Celda ${cellNum} maximizada en pantalla completa universal.`);
}
window.maximizeCellCss = maximizeCellCss;

function exitCellMaximized() {
  if (raceAutoRestoreTimer) {
    clearTimeout(raceAutoRestoreTimer);
    raceAutoRestoreTimer = null;
  }

  [1, 2, 3, 4].forEach(n => {
    const c = document.getElementById(`cell-${n}`);
    if (c) c.classList.remove('cell-maximized');
  });

  currentMaximizedCellNum = null;

  // Restaurar límites de resolución y buffers para la vista multicanal activa
  [1, 2, 3, 4].forEach(n => {
    if (hlsPlayers[n]) {
      applyResolutionCap(n, hlsPlayers[n], activeGridMode, false);
      tuneHlsBuffers(hlsPlayers[n], getEffectiveQualityTier(), activeGridMode);
    }
  });

  const btnReturn = document.getElementById('btnReturnMulticanal');
  if (btnReturn) btnReturn.style.display = 'none';

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  }

  console.log('[Visual-FX] Salida de celda maximizada. Regresando a multicanal.');
}
window.exitCellMaximized = exitCellMaximized;

// Auto-Maximización al darse la Partida en Multicanal
function triggerRaceStartAutoZoom(cellNum, trackName) {
  if (activeGridMode <= 1 || currentMaximizedCellNum !== null) return;
  console.log(`[Visual-FX] 🏇 ¡Partida detectada en ${trackName}! Maximizando celda ${cellNum} automáticamente...`);
  maximizeCellCss(cellNum);

  if (raceAutoRestoreTimer) clearTimeout(raceAutoRestoreTimer);
  // Regresar automáticamente a multicanal tras 2.5 minutos (tiempo promedio de carrera)
  raceAutoRestoreTimer = setTimeout(() => {
    console.log(`[Visual-FX] Carrera finalizada en ${trackName}. Restaurando vista multicanal.`);
    exitCellMaximized();
  }, 150000);
}
window.triggerRaceStartAutoZoom = triggerRaceStartAutoZoom;

function toggleCellFullscreen(cellNum) {
  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;

  if (cell.classList.contains('cell-maximized')) {
    exitCellMaximized();
    return;
  }

  // Intentar primero fullscreen nativo si es soportado y permitido
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    try {
      const p = cell.requestFullscreen ? cell.requestFullscreen() : (cell.webkitRequestFullscreen ? cell.webkitRequestFullscreen() : null);
      if (p && p.catch) {
        p.catch(() => {
          maximizeCellCss(cellNum);
        });
      }
    } catch (e) {
      maximizeCellCss(cellNum);
      return;
    }
  }

  // Siempre asegurar cobertura 100vw x 100vh mediante clase CSS universal
  maximizeCellCss(cellNum);
}
window.toggleCellFullscreen = toggleCellFullscreen;

// Salir de pantalla maximizada con tecla Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentMaximizedCellNum !== null) {
    exitCellMaximized();
  }
});

function checkActiveCellsForPartida() {
  if (activeGridMode <= 1 || currentMaximizedCellNum !== null) return;
  for (let num = 1; num <= activeGridMode; num++) {
    const chId = cellChannels[num];
    if (!chId) continue;
    const ch = channelCatalog.find(c => c.id === chId);
    if (ch && ch.onAir && ch.nextRace) {
      const nr = ch.nextRace.toUpperCase();
      if (nr.includes('MTP 0') || nr.includes('MTP :0') || nr.includes('POST') || nr.includes('OFF') || nr.includes('RUNNING') || nr.includes('PARTIDA')) {
        triggerRaceStartAutoZoom(num, ch.name);
        break;
      }
    }
  }
}
window.checkActiveCellsForPartida = checkActiveCellsForPartida;
setInterval(checkActiveCellsForPartida, 25000);

function setFocusedCell(index) {
  focusedCellIndex = index;
  [1, 2, 3, 4].forEach(num => {
    const cell = document.getElementById(`cell-${num}`);
    if (cell) {
      cell.classList.toggle('focused', num === index);
    }
  });
}

// Admin Tab Switching System
function switchAdminTab(targetTabId) {
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.tab === targetTabId);
  });
  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === targetTabId);
  });

  if (targetTabId === 'tab-analytics') {
    const selAnalytics = document.getElementById('selFilterAnalyticsClient');
    loadSystemAnalytics(selAnalytics ? selAnalytics.value : 'ALL');
  } else if (targetTabId === 'tab-channels') {
    populateAdminChannelsTable();
  } else if (targetTabId === 'tab-users') {
    loadSystemUsersList();
  } else if (targetTabId === 'tab-clients') {
    loadClientsList();
  } else if (targetTabId === 'tab-devices') {
    const clearDeviceInputs = () => {
      if (document.getElementById('txtNewDeviceTvName')) document.getElementById('txtNewDeviceTvName').value = '';
      if (document.getElementById('txtNewDeviceUser')) document.getElementById('txtNewDeviceUser').value = '';
      if (document.getElementById('txtNewDevicePass')) document.getElementById('txtNewDevicePass').value = '';
    };
    clearDeviceInputs();
    setTimeout(clearDeviceInputs, 60);
    const selFilterDev = document.getElementById('selFilterClientDevices');
    loadApprovedDevicesList(selFilterDev ? selFilterDev.value : 'ALL');
    loadDeviceAccounts();
  } else if (targetTabId === 'tab-screen-config') {
    loadScreenConfigManager();
  } else if (targetTabId === 'tab-lottery') {
    updateAdminManualLotteryDropdowns();
  }
}

function setupAdminTabs() {
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchAdminTab(btn.dataset.tab);
    });
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Selector de cuadrícula
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateGridView(parseInt(btn.dataset.grid));
    });
  });

  // Controles de audio y pantalla completa por celda
  [1, 2, 3, 4].forEach(num => {
    const btnAudio = document.getElementById(`btnAudio${num}`);
    if (btnAudio) {
      btnAudio.addEventListener('click', (e) => {
        e.stopPropagation();
        setAudioFocus(num);
      });
    }

    const btnFs = document.getElementById(`btnFullscreen${num}`);
    if (btnFs) {
      btnFs.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCellFullscreen(num);
      });
    }

    const cell = document.getElementById(`cell-${num}`);
    if (cell) {
      cell.addEventListener('click', (e) => {
        setFocusedCell(num);
        if (e.target.closest('.btn-audio-header')) {
          setAudioFocus(num);
        }
      });
      cell.addEventListener('dblclick', (e) => {
        if (!e.target.closest('select') && !e.target.closest('button')) {
          toggleCellFullscreen(num);
        }
      });
    }
  });

  // Temporizador de 30 segundos para auto-ocultar la barra de hipódromos (Requisito 6)
  let sidebarAutoCloseTimer = null;

  function resetSidebarAutoCloseTimer() {
    if (sidebarAutoCloseTimer) clearTimeout(sidebarAutoCloseTimer);
    const sidebar = document.getElementById('sidebarChannels');
    if (!sidebar || sidebar.classList.contains('collapsed')) return;

    sidebarAutoCloseTimer = setTimeout(() => {
      if (sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        console.log('[Sidebar] Ocultada automáticamente tras 30 segundos sin interacción.');
      }
    }, 30000);
  }

  function clearSidebarAutoCloseTimer() {
    if (sidebarAutoCloseTimer) {
      clearTimeout(sidebarAutoCloseTimer);
      sidebarAutoCloseTimer = null;
    }
  }

  if (elements.btnToggleSidebar) {
    elements.btnToggleSidebar.addEventListener('click', () => {
      const isCollapsed = elements.sidebarChannels.classList.toggle('collapsed');
      if (!isCollapsed) {
        resetSidebarAutoCloseTimer();
      } else {
        clearSidebarAutoCloseTimer();
      }
    });
  }

  if (elements.sidebarChannels) {
    ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
      elements.sidebarChannels.addEventListener(evt, resetSidebarAutoCloseTimer);
    });
  }

  elements.txtSearchChannel.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    filterAndRenderChannels(q);
  });

  const btnDirectLot = document.getElementById('btnDirectLoteria');
  if (btnDirectLot) {
    btnDirectLot.addEventListener('click', (e) => {
      e.preventDefault();
      switchDirectService('loteria');
    });
  }

  // Service Selector Hub Modal Event Handlers
  const btnOpenServiceHub = document.getElementById('btnOpenServiceHub');
  const serviceSelectorModal = document.getElementById('serviceSelectorModal');
  const btnConfirmServiceChoice = document.getElementById('btnConfirmServiceChoice');
  const btnSetAsDefaultStartup = document.getElementById('btnSetAsDefaultStartup');
  const defaultServiceToast = document.getElementById('defaultServiceToast');

  if (btnOpenServiceHub && serviceSelectorModal) {
    btnOpenServiceHub.addEventListener('click', () => {
      serviceSelectorModal.style.display = 'flex';
    });
  }

  let tempSelectedService = selectedService;
  document.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.service-card').forEach(c => {
        c.classList.remove('active');
        const tag = c.querySelector('.service-tag');
        if (tag) tag.textContent = 'DISPONIBLE';
      });
      card.classList.add('active');
      const tag = card.querySelector('.service-tag');
      if (tag) tag.textContent = 'SELECCIONADO';
      tempSelectedService = card.dataset.service;
    });
  });

  if (btnConfirmServiceChoice && serviceSelectorModal) {
    btnConfirmServiceChoice.addEventListener('click', () => {
      sessionStorage.setItem('visual_fx_session_override', 'true');
      applyActiveServiceView(tempSelectedService);
      serviceSelectorModal.style.display = 'none';
    });
  }

  if (btnSetAsDefaultStartup) {
    btnSetAsDefaultStartup.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/device/set-default-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: currentDeviceId, defaultService: tempSelectedService })
        });
        const data = await res.json();
        if (data.success) {
          sessionStorage.setItem('visual_fx_session_override', 'true');
          applyActiveServiceView(tempSelectedService);
          if (defaultServiceToast) {
            defaultServiceToast.style.display = 'block';
            defaultServiceToast.textContent = `📌 ¡Fijado! Al encender este TV se abrirá automáticamente en: "${SERVICES_MAP[tempSelectedService]?.name}"`;
            setTimeout(() => {
              defaultServiceToast.style.display = 'none';
              if (serviceSelectorModal) serviceSelectorModal.style.display = 'none';
            }, 2500);
          }
        }
      } catch (err) {
        console.error('Error guardando servicio de inicio:', err);
      }
    });
  }

  // Botones de Navegación del Carrusel de Loterías y Pantalla Completa en la Cabecera
  const btnHFirst = document.getElementById('btnHeaderFirst');
  if (btnHFirst) {
    btnHFirst.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToFirstLotteryModule(true);
    });
  }

  const btnHLast = document.getElementById('btnHeaderLast');
  if (btnHLast) {
    btnHLast.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToLastLotteryModule(true);
    });
  }

  const btnHPrev = document.getElementById('btnHeaderPrev');
  if (btnHPrev) {
    btnHPrev.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToPrevLotteryModule(true);
    });
  }

  const btnHNext = document.getElementById('btnHeaderNext');
  if (btnHNext) {
    btnHNext.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToNextLotteryModule(true);
    });
  }

  const btnHPause = document.getElementById('btnHeaderPause');
  if (btnHPause) {
    btnHPause.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleLotteryCarouselPause();
    });
  }

  const btnHFs = document.getElementById('btnHeaderFullscreen');
  if (btnHFs) {
    btnHFs.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAppFullscreen(e);
    });
  }

  // Open Admin Portal Button (Solo para consolas de administración, bloqueado en TVs)
  elements.btnAdminModal.addEventListener('click', () => {
    if (IS_SMART_TV) {
      return;
    }
    if (!currentToken || !currentUser) {
      openAdminModalDirectly();
    } else {
      openExecutiveAdminModal();
    }
  });

  // Acceso Técnico Oculto en Smart TVs: 5 clics rápidos sobre el logotipo Visual-FX
  let logoClicks = 0;
  let logoTimer = null;
  const logoTrigger = document.getElementById('brandLogoTrigger');
  if (logoTrigger) {
    logoTrigger.addEventListener('click', () => {
      logoClicks++;
      if (logoTimer) clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoClicks = 0; }, 2500);
      if (logoClicks >= 5) {
        logoClicks = 0;
        openAdminModalDirectly();
      }
    });
  }

  // Open Login Modal from Banner / Administrador Button
  const btnShowLoginFromBanner = document.getElementById('btnShowLoginFromBanner');
  if (btnShowLoginFromBanner) {
    btnShowLoginFromBanner.addEventListener('click', (e) => {
      e.preventDefault();
      openAdminModalDirectly();
    });
  }

  const btnCloseLoginModal = document.getElementById('btnCloseLoginModal');
  if (btnCloseLoginModal) {
    btnCloseLoginModal.addEventListener('click', closeLoginModalSafely);
  }

  // Activar Pantalla (Exclusivo Clientes/Encargados)
  if (elements.btnSubmitActivation) {
    elements.btnSubmitActivation.addEventListener('click', async () => {
      // Delegar a setupDeviceAccountCreation
    });
  }

  // Crear Nuevo Cliente (Ficha de Organización - Exclusivo Super Admin)
  const btnCreateClient = document.getElementById('btnCreateClient');
  if (btnCreateClient) {
    btnCreateClient.addEventListener('click', async () => {
      const name = document.getElementById('newClientName').value.trim();
      const managerUsername = document.getElementById('newClientUsername').value.trim();
      const pass = document.getElementById('newClientPassword').value.trim();
      const maxDevices = document.getElementById('newClientMaxDevices').value.trim();
      const planType = document.getElementById('newClientPlan').value;
      const msg = document.getElementById('clientCreateMsg');

      if (!name || !managerUsername || !pass) {
        msg.style.color = '#fca5a5';
        msg.textContent = 'Por favor complete todos los campos (Nombre, Usuario y Contraseña son obligatorios).';
        return;
      }

      try {
        const res = await fetch('/api/admin/clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ name, managerUsername, pass, maxDevices, planType })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          msg.style.color = '#34d399';
          msg.textContent = `¡Cliente "${name}" creado exitosamente con cupo de ${data.client.maxDevices} pantallas!`;
          document.getElementById('newClientName').value = '';
          document.getElementById('newClientUsername').value = '';
          document.getElementById('newClientPassword').value = '';
          await loadClientsList();
        } else {
          msg.style.color = '#fca5a5';
          msg.textContent = data.error || 'Error creando cliente.';
        }
      } catch (e) {
        msg.textContent = 'Error de conexión.';
      }
    });
  }

  // Master Control: Agregar Nuevo Hipódromo al Catálogo
  const btnAddNewChannel = document.getElementById('btnAddNewChannel');
  if (btnAddNewChannel) {
    btnAddNewChannel.addEventListener('click', async () => {
      const name = document.getElementById('newChannelName')?.value.trim();
      const flag = document.getElementById('newChannelFlag')?.value.trim() || '🏇';
      const location = document.getElementById('newChannelLoc')?.value.trim() || 'Internacional';
      const streamUrl = document.getElementById('newChannelUrl')?.value.trim();
      const type = document.getElementById('newChannelType')?.value || 'hls';
      const msg = document.getElementById('channelAddMsg');

      if (!name || !streamUrl) {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = 'Nombre del hipódromo y URL de transmisión son obligatorios.';
        }
        return;
      }

      try {
        const res = await fetch('/api/admin/channels/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ name, flag, location, streamUrl, type })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (msg) {
            msg.style.color = '#34d399';
            msg.textContent = `¡Hipódromo "${name}" agregado exitosamente al Catálogo Máster!`;
          }
          document.getElementById('newChannelName').value = '';
          document.getElementById('newChannelUrl').value = '';
          await loadChannelCatalog();
          populateAdminChannelsTable();
        } else {
          if (msg) {
            msg.style.color = '#fca5a5';
            msg.textContent = data.error || 'Error al agregar hipódromo.';
          }
        }
      } catch (err) {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = 'Error de conexión con el servidor.';
        }
      }
    });
  }

  // Master Control: Previsualizar Señal en Monitor en Vivo
  const btnTestChannelPreview = document.getElementById('btnTestChannelPreview');
  if (btnTestChannelPreview) {
    btnTestChannelPreview.addEventListener('click', () => {
      const select = document.getElementById('selAdminChannel');
      const customUrl = document.getElementById('txtAdminStreamUrl')?.value.trim();
      const channelId = select?.value;
      const channel = channelCatalog.find(c => c.id === channelId);

      const urlToTest = customUrl || (channel ? (channel.streamUrl || channel.iframeUrl) : '');
      const nameToTest = channel ? channel.name : 'Señal Personalizada';
      const typeToTest = channel ? (channel.type || 'hls') : 'hls';

      if (!urlToTest) {
        alert('Seleccione un canal o ingrese una URL para probar la transmisión.');
        return;
      }

      previewChannelInMonitor(urlToTest, nameToTest, typeToTest);
    });
  }

  const btnCloseTestMonitor = document.getElementById('btnCloseTestMonitor');
  if (btnCloseTestMonitor) {
    btnCloseTestMonitor.addEventListener('click', stopTestMonitorPlayer);
  }

  // Update Stream URL
  const btnUpdateStream = document.getElementById('btnUpdateChannelStream');
  if (btnUpdateStream) {
    btnUpdateStream.addEventListener('click', async () => {
      const channelId = document.getElementById('selAdminChannel').value;
      const streamUrl = document.getElementById('txtAdminStreamUrl').value.trim();
      const msg = document.getElementById('channelUpdateMsg');
      
      if (!channelId || !streamUrl) return;

      try {
        const res = await fetch('/api/admin/channels/update', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ channelId, streamUrl })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          msg.style.color = '#34d399';
          msg.textContent = `¡Señal de ${data.channel.name} actualizada!`;
          await loadChannelCatalog();
          populateAdminChannelsTable();
        } else {
          msg.style.color = '#fca5a5';
          msg.textContent = data.error || 'Error actualizando señal.';
        }
      } catch (e) {
        msg.textContent = 'Error de comunicación.';
      }
    });
  }

  // Crear Usuario del Sistema y Roles (Super Admin)
  const btnCreateSystemUser = document.getElementById('btnCreateSystemUser');
  if (btnCreateSystemUser) {
    btnCreateSystemUser.addEventListener('click', async () => {
      const name = document.getElementById('newSystemUserName')?.value.trim();
      const username = document.getElementById('newSystemUserLogin')?.value.trim();
      const pass = document.getElementById('newSystemUserPass')?.value.trim();
      const role = document.getElementById('newSystemUserRole')?.value;
      const location = document.getElementById('newSystemUserLoc')?.value.trim() || 'Sede Principal';
      const msg = document.getElementById('userCreateMsg');

      if (!name || !username || !pass) {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = 'Nombre, usuario y contraseña son obligatorios.';
        }
        return;
      }

      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ name, username, pass, role, location })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (msg) {
            msg.style.color = '#34d399';
            msg.textContent = `¡Usuario @${username} registrado con éxito!`;
          }
          document.getElementById('newSystemUserName').value = '';
          document.getElementById('newSystemUserLogin').value = '';
          document.getElementById('newSystemUserPass').value = '';
          await loadSystemUsersList();
        } else {
          if (msg) {
            msg.style.color = '#fca5a5';
            msg.textContent = data.error || 'Error al crear usuario.';
          }
        }
      } catch (e) {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = 'Error de conexión con el servidor.';
        }
      }
    });
  }

  // Filtro de Dispositivos por Cliente (Super Admin)
  const selFilterClientDevices = document.getElementById('selFilterClientDevices');
  if (selFilterClientDevices) {
    selFilterClientDevices.addEventListener('change', (e) => {
      loadApprovedDevicesList(e.target.value);
    });
  }

  // Filtro de Analíticas por Cliente (Super Admin)
  const selFilterAnalyticsClient = document.getElementById('selFilterAnalyticsClient');
  if (selFilterAnalyticsClient) {
    selFilterAnalyticsClient.addEventListener('change', (e) => {
      loadSystemAnalytics(e.target.value);
    });
  }

  // Control de Rotación de Loterías
  const btnToggleLottery = document.getElementById('btnToggleLotteryCarousel');
  if (btnToggleLottery) {
    btnToggleLottery.addEventListener('click', toggleLotteryCarousel);
  }

  // Cambio de juego en Formulario Manual de Loterías
  const selManualGame = document.getElementById('selManualGame');
  if (selManualGame) {
    selManualGame.addEventListener('change', updateManualHoursDropdown);
  }

  // Forzar Sincronización Inmediata de Loterías (Super Admin / Tech)
  const btnForceSync = document.getElementById('btnForceSyncLottery');
  const toastSync = document.getElementById('lotterySyncToast');
  if (btnForceSync) {
    btnForceSync.addEventListener('click', async () => {
      btnForceSync.disabled = true;
      btnForceSync.textContent = '⏳ Sincronizando fuentes...';
      try {
        const res = await fetch('/api/admin/lottery/sync-now', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        if (data.success) {
          if (toastSync) {
            toastSync.style.display = 'block';
            toastSync.textContent = `✅ ${data.message} (${data.resultsCount} sorteos cargados)`;
            setTimeout(() => { toastSync.style.display = 'none'; }, 4000);
          }
          await loadLotteryTop10Data();
        } else {
          alert(data.error || 'Error forzando sincronización.');
        }
      } catch (err) {
        alert('Error de conexión.');
      } finally {
        btnForceSync.disabled = false;
        btnForceSync.textContent = '🔄 Forzar Sincronización Inmediata';
      }
    });
  }

  // Guardar Resultado Manual de Emergencia (Super Admin / Tech)
  const btnSubmitManual = document.getElementById('btnSubmitManualLottery');
  const msgManual = document.getElementById('manualLotteryMsg');
  if (btnSubmitManual) {
    btnSubmitManual.addEventListener('click', async () => {
      const selGame = document.getElementById('selManualGame');
      const selHour = document.getElementById('selManualHour');
      if (!selGame || !selHour) return;

      const gameId = selGame.value;
      const hour = selHour.value;
      const game = lotteryTop10.find(g => g.id === gameId);
      if (!game) return;

      let resultPayload = null;
      if (game.type === 'animalitos') {
        const number = document.getElementById('txtManualNumber')?.value.trim();
        const name = document.getElementById('txtManualName')?.value.trim();
        if (!number) {
          alert('Por favor ingrese al menos el número del animalito.');
          return;
        }
        resultPayload = { number, name };
      } else {
        const tripleA = document.getElementById('txtManualTripleA')?.value.trim();
        const tripleB = document.getElementById('txtManualTripleB')?.value.trim();
        const tripleC = document.getElementById('txtManualTripleC')?.value.trim();
        const signo = document.getElementById('txtManualSigno')?.value.trim();
        if (!tripleA && !tripleB && !tripleC) {
          alert('Por favor ingrese al menos uno de los triples (A, B o C).');
          return;
        }
        resultPayload = { tripleA, tripleB, tripleC, signo };
      }

      try {
        const res = await fetch('/api/admin/lottery/manual', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ gameId, hour, result: resultPayload })
        });
        const data = await res.json();
        if (data.success) {
          if (msgManual) {
            msgManual.style.display = 'block';
            msgManual.style.color = '#34d399';
            msgManual.textContent = `¡Resultado publicado con éxito para ${game.name} (${hour})!`;
            setTimeout(() => { msgManual.style.display = 'none'; }, 4000);
          }
          await loadLotteryTop10Data();
        } else {
          alert(data.error || 'Error registrando resultado manual.');
        }
      } catch (err) {
        alert('Error de conexión con el servidor.');
      }
    });
  }

  elements.btnCloseDeviceModal.addEventListener('click', () => {
    stopTestMonitorPlayer();
    elements.deviceModal.style.display = 'none';
  });
}


// Monitor de Previsualización en Vivo de Canales
let testHlsPlayer = null;

function stopTestMonitorPlayer() {
  if (testHlsPlayer) {
    try {
      testHlsPlayer.stopLoad();
      testHlsPlayer.detachMedia();
      testHlsPlayer.destroy();
    } catch (e) {}
    testHlsPlayer = null;
  }
  const wrapper = document.getElementById('channelTestVideoWrapper');
  if (wrapper) wrapper.innerHTML = '';
  const container = document.getElementById('channelTestMonitorContainer');
  if (container) container.style.display = 'none';
}

function previewChannelInMonitor(streamUrl, channelName, type = 'hls') {
  const container = document.getElementById('channelTestMonitorContainer');
  const wrapper = document.getElementById('channelTestVideoWrapper');
  const title = document.getElementById('lblTestChannelTitle');

  if (!container || !wrapper) return;

  stopTestMonitorPlayer();

  container.style.display = 'block';
  if (title) title.textContent = `📺 Monitor de Verificación en Vivo: ${channelName}`;

  if (type === 'iframe') {
    wrapper.innerHTML = `<iframe src="${streamUrl}" width="100%" height="100%" frameborder="0" allowfullscreen style="border:none; width:100%; height:100%;"></iframe>`;
    return;
  }

  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'contain';
  wrapper.appendChild(video);

  if (Hls.isSupported()) {
    testHlsPlayer = new Hls({ enableWorker: true, lowLatencyMode: true });
    testHlsPlayer.loadSource(streamUrl);
    testHlsPlayer.attachMedia(video);
    testHlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(e => console.warn('Autoplay error on test monitor:', e));
    });
    testHlsPlayer.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('[Test Monitor HLS Error]', data);
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
  }
}

// Master Control: Pausar / Reanudar Hipódromo
async function toggleChannelOnAirApi(channelId) {
  try {
    const res = await fetch('/api/admin/channels/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ channelId })
    });
    const data = await res.json();
    if (data.success) {
      await loadChannelCatalog();
      populateAdminChannelsTable();
    } else {
      alert(data.error || 'Error alternando señal de hipódromo.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// Master Control: Eliminar Hipódromo
async function deleteChannelApi(channelId, channelName) {
  if (!confirm(`¿Está seguro de eliminar el hipódromo "${channelName}" del catálogo máster?`)) return;
  try {
    const res = await fetch(`/api/admin/channels/${channelId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      await loadChannelCatalog();
      populateAdminChannelsTable();
    } else {
      alert(data.error || 'Error al eliminar hipódromo.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// Populate Admin Channels Table
function populateAdminChannelsTable() {
  const tableBody = elements.adminChannelsTableBody;
  const select = document.getElementById('selAdminChannel');
  const txtUrl = document.getElementById('txtAdminStreamUrl');
  if (!tableBody) return;

  tableBody.innerHTML = '';
  if (select) select.innerHTML = '';

  channelCatalog.forEach(c => {
    if (select) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.flag} ${c.name} (${c.location})`;
      select.appendChild(opt);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.flag} ${c.name}</strong></td>
      <td>${c.location}</td>
      <td><span class="badge-role tech">${(c.type || 'HLS').toUpperCase()}</span></td>
      <td>${c.onAir ? '<span style="color:#34d399; font-weight:bold;">🟢 EN VIVO</span>' : '<span style="color:#ef4444; font-weight:bold;">⏸️ FUERA DE AIRE</span>'}</td>
      <td style="font-family:var(--font-code); font-size:0.75rem; color:var(--text-muted); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${c.streamUrl || c.iframeUrl}
      </td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn-action-sm renew" onclick="previewChannelInMonitor('${c.streamUrl || c.iframeUrl}', '${c.name}', '${c.type || 'hls'}')" title="Ver en vivo en Monitor">
          ▶️ Probar
        </button>
        <button class="btn-action-sm ${c.onAir ? 'suspend' : 'reactivate'}" onclick="toggleChannelOnAirApi('${c.id}')" title="Pausar o Reanudar">
          ${c.onAir ? '⏸️ Pausar' : '▶️ Reanudar'}
        </button>
        <button class="btn-danger-sm" onclick="deleteChannelApi('${c.id}', '${c.name}')" title="Eliminar Hipódromo">
          🗑️
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  if (select && select.value && txtUrl && !txtUrl.value) {
    const selectedCh = channelCatalog.find(c => c.id === select.value);
    if (selectedCh) txtUrl.value = selectedCh.streamUrl || selectedCh.iframeUrl || '';
  }

  if (select && !select.onchange) {
    select.onchange = () => {
      const selectedCh = channelCatalog.find(c => c.id === select.value);
      if (selectedCh && txtUrl) {
        txtUrl.value = selectedCh.streamUrl || selectedCh.iframeUrl || '';
      }
    };
  }
}

// Render Analytics KPI & Real-Time Telemetry Table
async function loadSystemAnalytics(filterClientId) {
  try {
    let url = '/api/admin/analytics';
    if (filterClientId && filterClientId !== 'ALL') {
      url += `?clientId=${encodeURIComponent(filterClientId)}`;
    }
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    const kpiTotal = document.getElementById('kpiTotalDevices');
    const kpiOnline = document.getElementById('kpiOnlineDevices');
    const kpiAvg = document.getElementById('kpiAvgHours');
    const kpiTop = document.getElementById('kpiTopService');

    if (kpiTotal) kpiTotal.textContent = data.totalDevices || 0;
    if (kpiOnline) kpiOnline.textContent = `${data.onlineCount || 0} de ${data.totalDevices || 0}`;
    if (kpiAvg) kpiAvg.textContent = `${data.avgDailyHours || 0} hrs/día`;

    if (kpiTop && data.serviceCounts) {
      let topSvcKey = 'hipica';
      let maxCount = -1;
      for (const [key, count] of Object.entries(data.serviceCounts)) {
        if (count > maxCount) {
          maxCount = count;
          topSvcKey = key;
        }
      }
      kpiTop.textContent = `${SERVICES_MAP[topSvcKey]?.name || 'Hípica'} (${maxCount} TVs)`;
    }

    const tableBody = document.getElementById('telemetryTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    (data.devices || []).forEach(d => {
      const isOnline = d.isOnline;
      const statusHtml = isOnline
        ? '<span style="color:#34d399; font-weight:bold;">🟢 EN LÍNEA</span>'
        : '<span style="color:var(--text-muted);">⚪ DESCONECTADO</span>';

      const svcName = SERVICES_MAP[d.activeService || 'hipica']?.name || 'Hípica en Vivo';
      
      let lastSeenText = 'Nunca';
      if (d.lastSeen) {
        const secondsAgo = Math.floor((Date.now() - new Date(d.lastSeen).getTime()) / 1000);
        if (secondsAgo < 20) lastSeenText = 'Hace unos segundos';
        else if (secondsAgo < 60) lastSeenText = `Hace ${secondsAgo} seg`;
        else lastSeenText = `Hace ${Math.floor(secondsAgo / 60)} min`;
      }

      const todayHrs = ((d.uptimeMinutesToday || 0) / 60).toFixed(1);
      const monthHrs = ((d.uptimeMinutesMonth || 0) / 60).toFixed(1);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>📺 ${d.tvName}</strong></td>
        <td><code>${d.deviceId}</code></td>
        <td><span class="badge-role tech">${d.clientName || d.clientId || 'Fenix'}</span></td>
        <td>${statusHtml}</td>
        <td><span class="badge-role tech">${svcName}</span></td>
        <td>${lastSeenText}</td>
        <td><strong>${todayHrs}h hoy</strong> / ${monthHrs}h mes</td>
        <td><code>${d.ipAddress || '190.202.10.12'}</code></td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error cargando analíticas:', e);
  }
}

async function extendSubscriptionApi(deviceId, daysToAdd) {
  try {
    const res = await fetch('/api/admin/devices/extend-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ deviceId, daysToAdd })
    });
    const data = await res.json();
    if (data.success) {
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al extender suscripción.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// Render Users Table
async function loadSystemUsersList() {
  const tableBody = elements.systemUsersTableBody;
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    
    tableBody.innerHTML = '';
    (data.users || []).forEach(u => {
      let roleHtml = '<span class="badge-role agency">🏢 Cliente / Encargado</span>';
      if (u.role === 'SUPER_ADMIN') roleHtml = '<span class="badge-role super">👑 Super Admin</span>';
      else if (u.role === 'TECH_CHIEF') roleHtml = '<span class="badge-role tech">🛠️ Jefe Técnico</span>';

      const isProtected = ['hector_owner', 'superadmin', 'hector'].includes(u.username);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>@${u.username}</strong></td>
        <td>${u.name}</td>
        <td>${roleHtml}</td>
        <td>${u.location || 'Sede Principal'}</td>
        <td>
          ${!isProtected ? `<button class="btn-danger-sm" onclick="deleteSystemUser('${u.username}')">🗑️ ELIMINAR</button>` : '<span style="color:var(--text-muted); font-size:0.75rem;">🛡️ Protegido</span>'}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error cargando lista de usuarios:', e);
  }
}

async function deleteSystemUser(username) {
  if (!confirm(`¿Está seguro de eliminar al usuario @${username}?`)) return;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      await loadSystemUsersList();
    } else {
      alert(data.error || 'Error al eliminar usuario.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// 1. Cargar y renderizar lista de Clientes (Tab 1)
async function loadClientsList() {
  const tableBody = document.getElementById('clientsTableBody');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/clients', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const clients = data.clients || [];

    tableBody.innerHTML = '';

    // Actualizar selectores de filtros de clientes en el DOM
    const selFilterDev = document.getElementById('selFilterClientDevices');
    const selFilterAnalytics = document.getElementById('selFilterAnalyticsClient');
    if (selFilterDev) {
      const currentVal = selFilterDev.value || 'ALL';
      selFilterDev.innerHTML = '<option value="ALL">🌐 Todos los Clientes (Global)</option>';
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.clientId;
        opt.textContent = `🏢 ${c.name} (@${c.managerUsername})`;
        selFilterDev.appendChild(opt);
      });
      selFilterDev.value = currentVal;
    }

    if (selFilterAnalytics) {
      const currentVal = selFilterAnalytics.value || 'ALL';
      selFilterAnalytics.innerHTML = '<option value="ALL">🌐 Todas las Organizaciones</option>';
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.clientId;
        opt.textContent = `🏢 ${c.name}`;
        selFilterAnalytics.appendChild(opt);
      });
      selFilterAnalytics.value = currentVal;
    }

    if (clients.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No hay clientes registrados aún. Cree uno arriba.</td></tr>`;
      return;
    }

    clients.forEach(c => {
      const isProtected = (c.clientId === 'fenix');
      const isSuspended = (c.status === 'SUSPENDED');
      const activeCount = c.activeDevicesCount || 0;
      const quotaPct = Math.round((activeCount / (c.maxDevices || 1)) * 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:0.95rem; color:#fff;">🏢 ${c.name}</strong>
            <span class="badge-role super" style="color:#10b981; border-color:#10b981; font-size:0.7rem;">🟢 AUTORIZADO</span>
          </div>
          <small style="color:var(--text-muted); font-size:0.75rem;">ID: <code>${c.clientId}</code></small>
        </td>
        <td>
          <span style="font-weight:bold; color:var(--accent-cyan);">@${c.managerUsername}</span>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <strong style="color:${activeCount >= c.maxDevices ? '#fca5a5' : '#34d399'};">
              📊 ${activeCount} / ${c.maxDevices} Pantallas
            </strong>
            <div style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; width:120px;">
              <div style="background:${activeCount >= c.maxDevices ? '#ef4444' : '#10b981'}; width:${Math.min(100, quotaPct)}%; height:100%;"></div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size:0.8rem;">
            <span class="badge-role tech">Plan ${c.planType || 'MENSUAL'}</span>
            <div style="color:var(--text-muted); font-size:0.75rem; margin-top:2px;">Vence: ${c.expiresAt || 'Indefinido'}</div>
          </div>
        </td>
        <td>
          ${isSuspended 
            ? '<span style="color:#f87171; font-weight:bold;">⏸️ SUSPENDIDO</span>' 
            : '<span style="color:#34d399; font-weight:bold;">🟢 ACTIVO</span>'}
        </td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-action-sm renew" onclick="adjustClientQuotaPrompt('${c.clientId}', ${c.maxDevices})" title="Modificar Cupo">
              ✏️ Cupo (${c.maxDevices})
            </button>
            <button class="btn-action-sm ${isSuspended ? 'reactivate' : 'suspend'}" onclick="toggleClientStatusApi('${c.clientId}')" title="Pausar o Activar Cliente">
              ${isSuspended ? '▶️ Activar' : '⏸️ Suspender'}
            </button>
            ${!isProtected ? `
              <button class="btn-danger-sm" onclick="deleteClientApi('${c.clientId}', '${c.name}')" title="Eliminar Cliente">
                🗑️
              </button>
            ` : '<span style="color:var(--text-muted); font-size:0.72rem;">🛡️ Base</span>'}
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error cargando lista de clientes:', err);
  }
}

// 2. Cargar y renderizar Lista y Árbol Jerárquico de Pantallas Autorizadas (Tab 2)
async function loadApprovedDevicesList(filterClientId = 'ALL') {
  const tableBody = elements.approvedDeviceTableBody;
  const treeContainer = document.getElementById('clientDeviceTreeContainer');

  try {
    let devUrl = '/api/admin/devices';
    if (filterClientId && filterClientId !== 'ALL') {
      devUrl += `?clientId=${encodeURIComponent(filterClientId)}`;
    }

    const [resDev, resClients] = await Promise.all([
      fetch(devUrl, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
      fetch('/api/admin/clients', { headers: { 'Authorization': `Bearer ${currentToken}` } })
    ]);

    const dataDev = await resDev.json();
    const dataClients = await resClients.json();

    const devices = dataDev.devices || [];
    const clients = dataClients.clients || [];

    // Actualizar badge de cupo si es Encargado de Cliente
    if (currentUser && currentUser.role === 'CLIENT_MANAGER') {
      const myClientId = currentUser.clientId || 'fenix';
      const myClient = clients.find(c => c.clientId === myClientId);
      const myDevs = devices.filter(d => d.clientId === myClientId);
      const quotaBadge = document.getElementById('clientQuotaBadge');
      if (quotaBadge && myClient) {
        quotaBadge.textContent = `📊 Cupo de Pantallas: ${myDevs.length} / ${myClient.maxDevices} Activas`;
      }
    }

    // Poblar selector de clonación al activar nueva pantalla (selCloneConfigDevice)
    const cloneSel = document.getElementById('selCloneConfigDevice');
    if (cloneSel) {
      const myDevs = (currentUser && currentUser.role === 'CLIENT_MANAGER')
        ? devices.filter(d => d.clientId === (currentUser.clientId || 'fenix'))
        : devices;
      const currentVal = cloneSel.value;
      cloneSel.innerHTML = '<option value="">⚙️ Nueva configuración por defecto (Recomendado)</option>' +
        myDevs.map(d => `<option value="${d.id}" ${d.id === currentVal ? 'selected' : ''}>📋 Copiar configuración de: ${d.tvName || d.id}</option>`).join('');
    }

    // A) Renderizar el Árbol Jerárquico de Clientes y Pantallas
    if (treeContainer) {
      treeContainer.innerHTML = '';

      let clientsToShow = clients;
      if (currentUser && currentUser.role === 'CLIENT_MANAGER') {
        clientsToShow = clients.filter(c => c.clientId === (currentUser.clientId || 'fenix'));
      } else if (filterClientId && filterClientId !== 'ALL') {
        clientsToShow = clients.filter(c => c.clientId === filterClientId);
      }

      if (clientsToShow.length === 0) {
        treeContainer.innerHTML = `
          <div class="empty-devices-notice">
            <span>No hay organizaciones clientes registradas en esta vista.</span>
          </div>
        `;
      } else {
        clientsToShow.forEach(c => {
          const clientDevs = devices.filter(d => d.clientId === c.clientId);
          const card = document.createElement('div');
          card.className = 'client-tree-card';

          let devicesHtml = '';
          if (clientDevs.length === 0) {
            devicesHtml = `
              <div class="empty-devices-notice">
                <div>
                  <strong style="color:#38bdf8;">ℹ️ 0 pantallas vinculadas todavía.</strong>
                  <p style="margin:4px 0 0 0; color:var(--text-muted); font-size:0.8rem;">
                    El encargado de ${c.name} puede activar cualquier televisor ingresando el código PIN de 6 dígitos que muestra la pantalla.
                  </p>
                </div>
                <button class="btn-action-sm renew" onclick="quickActivateForClient('${c.clientId}', '${c.name}')" style="padding:6px 12px;">
                  ⚡ Vincular Pantalla a ${c.name}
                </button>
              </div>
            `;
          } else {
            devicesHtml = `
              <div class="client-tree-devices-list">
                ${clientDevs.map(d => `
                  <div class="device-tree-item">
                    <div class="device-tree-item-top">
                      <span class="device-tree-name">📺 ${d.tvName}</span>
                      <span class="badge-role super" style="color:#34d399; border-color:#34d399; font-size:0.68rem;">🟢 ACTIVA</span>
                    </div>
                    <div class="device-tree-meta">
                      <span>ID: <code>${d.deviceId}</code></span>
                      <span>Inicio: <strong>${SERVICES_MAP[d.defaultService || 'hipica']?.name || 'Hípica'}</strong></span>
                    </div>
                    <div class="device-tree-meta">
                      <span>Vence: ${d.expiresAt || '30 días'}</span>
                      <span>Plan: ${d.planType || 'MENSUAL'}</span>
                    </div>
                    <div class="device-tree-actions">
                      <button class="btn-action-sm renew" onclick="renameDevicePrompt('${d.deviceId}', '${d.tvName}')">✏️ Renombrar</button>
                      <button class="btn-danger-sm" onclick="unlinkDeviceApi('${d.deviceId}', '${d.tvName}')">🗑️ Desvincular</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          }

          card.innerHTML = `
            <div class="client-tree-header">
              <div class="client-tree-title">
                <h5>🏢 Cliente Autorizado: ${c.name}</h5>
                <span class="badge-role super" style="color:#10b981; border-color:#10b981;">🟢 AUTORIZADO</span>
                <span style="font-size:0.8rem; color:var(--text-muted); font-weight:bold;">(@${c.managerUsername})</span>
              </div>
              <div class="client-tree-badges">
                <span class="badge-role tech">📊 Cupo: ${clientDevs.length} / ${c.maxDevices} Pantallas</span>
                <span class="badge-role agency">Plan ${c.planType || 'MENSUAL'}</span>
              </div>
            </div>
            ${devicesHtml}
          `;

          treeContainer.appendChild(card);
        });
      }
    }

    // B) Renderizar la Tabla Detallada
    if (tableBody) {
      tableBody.innerHTML = '';
      if (devices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No hay pantallas autorizadas en este filtro.</td></tr>`;
        return;
      }

      devices.forEach(d => {
        const client = clients.find(c => c.clientId === d.clientId);
        const clientDisplayName = client ? client.name : (d.clientName || d.clientId || 'Fenix');
        const devUsername = d.username || d.deviceId;
        const isOnline = Boolean(d.hasActiveSession);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>📺 ${d.tvName || devUsername}</strong></td>
          <td><code>@${devUsername}</code></td>
          <td>
            <span class="badge-role tech">🏢 ${clientDisplayName}</span>
          </td>
          <td>
            <select onchange="updateDeviceDefaultServiceApi('${devUsername}', this.value)" style="background:#0f172a; color:#38bdf8; border:1px solid rgba(56,189,248,0.3); border-radius:6px; padding:4px 8px; font-size:0.82rem; font-weight:bold;">
              <option value="loteria" ${(!d.defaultService || d.defaultService === 'loteria') ? 'selected' : ''}>🎲 Loterías</option>
              <option value="hipica" ${d.defaultService === 'hipica' ? 'selected' : ''}>🏇 Hípica en Vivo</option>
            </select>
          </td>
          <td>
            ${isOnline 
              ? `<span class="badge-role super" style="color:#10b981; border-color:#10b981; font-weight:800;">🟢 CONECTADA</span>` 
              : `<span class="badge-role agency" style="color:#94a3b8; border-color:#64748b;">⚪ DESCONECTADA</span>`
            }
          </td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-action-sm renew" onclick="promptDeviceChangePassword('${devUsername}')" title="Cambiar clave de acceso">🔑 Clave</button>
              ${isOnline 
                ? `<button class="btn-action-sm" style="background:rgba(239, 68, 68, 0.15); border:1px solid #ef4444; color:#ef4444; font-weight:700;" onclick="kickDeviceSessionApi('${devUsername}')" title="Cerrar sesión remota en la TV actual">🔌 Desconectar</button>` 
                : ''
              }
              <button class="btn-danger-sm" onclick="unlinkDeviceApi('${devUsername}', '${d.tvName || devUsername}')" title="Eliminar pantalla">🗑️</button>
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    }

  } catch (err) {
    console.error('Error cargando pantallas autorizadas:', err);
  }
}

// 2.1 Cuentas de Acceso para Pantallas / Smart TVs
async function promptDeviceChangePassword(username) {
  const newPass = prompt(`Ingrese la nueva contraseña para la pantalla @${username}:`);
  if (!newPass || !newPass.trim()) return;

  try {
    const res = await fetch(`/api/client/device-accounts/${encodeURIComponent(username)}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ password: newPass.trim() })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ ${data.message || 'Contraseña actualizada.'}`);
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al actualizar contraseña.');
    }
  } catch (err) {
    alert('Error de conexión con el servidor.');
  }
}
window.promptDeviceChangePassword = promptDeviceChangePassword;

async function kickDeviceSessionApi(username) {
  if (!confirm(`¿Cerrar remotamente la sesión activa de la pantalla @${username}? La pantalla conectada actualmente será desconectada de inmediato.`)) return;

  try {
    const res = await fetch(`/api/client/device-accounts/${encodeURIComponent(username)}/kick`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ ${data.message || 'Sesión remota cerrada.'}`);
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al desconectar pantalla.');
    }
  } catch (err) {
    alert('Error de conexión con el servidor.');
  }
}
window.kickDeviceSessionApi = kickDeviceSessionApi;

async function loadDeviceAccounts() {
  await loadApprovedDevicesList();
}
window.loadDeviceAccounts = loadDeviceAccounts;

async function deleteDeviceAccountApi(username) {
  unlinkDeviceApi(username, username);
}
window.deleteDeviceAccountApi = deleteDeviceAccountApi;

function setupDeviceAccountCreation() {
  const btn = document.getElementById('btnCreateDeviceAccount');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const tvName = document.getElementById('txtNewDeviceTvName')?.value.trim();
    const username = document.getElementById('txtNewDeviceUser')?.value.trim();
    const password = document.getElementById('txtNewDevicePass')?.value.trim();
    const defaultService = document.getElementById('selNewDeviceDefaultService')?.value || 'loteria';
    const cloneFromDeviceId = document.getElementById('selCloneFromDevice')?.value || null;
    const msg = document.getElementById('deviceAccountMsg');

    if (!username || !password) {
      if (msg) {
        msg.style.color = '#fca5a5';
        msg.textContent = 'Debe indicar usuario y contraseña para la pantalla.';
      }
      return;
    }

    try {
      const res = await fetch('/api/client/device-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          tvName: tvName || username,
          username,
          password,
          defaultService,
          cloneFromDeviceId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (msg) {
          msg.style.color = '#34d399';
          msg.textContent = `¡Pantalla "@${username}" registrada exitosamente! Ahora puede iniciar sesión con ella en cualquier Smart TV o pantalla.`;
        }
        if (document.getElementById('txtNewDeviceTvName')) document.getElementById('txtNewDeviceTvName').value = '';
        if (document.getElementById('txtNewDeviceUser')) document.getElementById('txtNewDeviceUser').value = '';
        if (document.getElementById('txtNewDevicePass')) document.getElementById('txtNewDevicePass').value = '';
        await loadApprovedDevicesList();
      } else {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = data.error || 'Error al crear pantalla.';
        }
      }
    } catch (err) {
      if (msg) {
        msg.style.color = '#fca5a5';
        msg.textContent = 'Error de conexión con el servidor.';
      }
    }
  });
}
setTimeout(setupDeviceAccountCreation, 300);

// Acciones de Gestión de Clientes
async function adjustClientQuotaPrompt(clientId, currentQuota) {
  const newQuotaStr = prompt(`Modificar cupo de pantallas para el cliente (${clientId}):`, currentQuota);
  if (!newQuotaStr) return;
  const newQuota = parseInt(newQuotaStr);
  if (isNaN(newQuota) || newQuota < 1) {
    alert('Ingrese un número válido de pantallas (mínimo 1).');
    return;
  }

  try {
    const res = await fetch(`/api/admin/clients/${encodeURIComponent(clientId)}/quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ maxDevices: newQuota })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadClientsList();
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al actualizar cupo.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

async function toggleClientStatusApi(clientId) {
  try {
    const res = await fetch('/api/admin/clients/toggle-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ clientId })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadClientsList();
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error alternando estado del cliente.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

async function deleteClientApi(clientId, clientName) {
  if (!confirm(`¿Está seguro de eliminar a la organización cliente "${clientName}" y todas sus pantallas autorizadas?`)) return;

  try {
    const res = await fetch(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadClientsList();
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al eliminar cliente.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// Acciones de Gestión de Dispositivos / Pantallas
async function renameDevicePrompt(deviceId, currentName) {
  const newName = prompt('Ingrese el nuevo nombre para este dispositivo:', currentName);
  if (!newName || newName.trim() === currentName) return;

  try {
    const res = await fetch('/api/client/devices/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ deviceId, newName: newName.trim() })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error renombrando dispositivo.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

async function unlinkDeviceApi(deviceId, tvName) {
  if (!confirm(`¿Está seguro de desvincular la pantalla "${tvName}"? Se liberará 1 cupo para la organización.`)) return;

  try {
    const res = await fetch(`/api/client/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadApprovedDevicesList();
      await checkDeviceAuthorization();
    } else {
      alert(data.error || 'Error desvinculando dispositivo.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

async function updateDeviceDefaultServiceApi(deviceId, defaultService) {
  try {
    const res = await fetch('/api/device/set-default-service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ deviceId, defaultService })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadApprovedDevicesList();
    } else {
      alert(data.error || 'Error al fijar servicio.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

async function quickActivateForClient(clientId, clientName) {
  const pin = prompt(`Ingrese el código PIN de 6 dígitos mostrado en el televisor para ${clientName}:`);
  if (!pin) return;
  const tvName = prompt(`Asigne un nombre único para este dispositivo (ej. TV Barra 1):`, `Pantalla ${clientName}`);
  if (!tvName) return;

  try {
    const res = await fetch('/api/client/activate-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ clientId, pin, tvName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`¡Pantalla activada con éxito para ${clientName}!`);
      await loadApprovedDevicesList();
      await loadClientsList();
      await checkDeviceAuthorization();
    } else {
      alert(data.error || 'Error activando pantalla.');
    }
  } catch (e) {
    alert('Error de conexión.');
  }
}

// Navegación Directa e Instantánea a Carreras en Vivo
function goToLiveStreams() {
  const modal = document.getElementById('deviceModal');
  if (modal) modal.style.setProperty('display', 'none', 'important');
  if (elements.deviceModal) elements.deviceModal.style.setProperty('display', 'none', 'important');

  const serviceModal = document.getElementById('serviceSelectorModal');
  if (serviceModal) serviceModal.style.setProperty('display', 'none', 'important');

  const loginM = document.getElementById('loginModal');
  if (loginM) loginM.style.setProperty('display', 'none', 'important');

  stopTestMonitorPlayer();

  if (elements.unauthorizedBanner) {
    elements.unauthorizedBanner.style.setProperty('display', 'none', 'important');
  }

  applyActiveServiceView('hipica');
  if (elements.sidebarChannels) elements.sidebarChannels.style.display = 'flex';
  if (elements.gridViewport) elements.gridViewport.style.display = 'grid';

  updateGridView(activeGridMode || 1);
  loadChannelCatalog();
}

// ==========================================
// Configuración Global y Personalización de Pantallas Digitales
// ==========================================
const DEFAULT_SCREEN_CONFIG = {
  themeMode: 'dark',
  colorStyle: 'emerald',
  tickerActive: true,
  tickerSpeed: 160,
  voiceEnabled: true,
  voiceVolume: 0.90,
  animalSfxEnabled: true,
  circusMusicEnabled: true,
  circusMusicTrack: 'circus_waltz',
  circusMusicVolume: 0.25,
  customMusicUrl: '',
  defaultService: 'loteria',
  lotterySections: {
    resultados: {
      enabled: true,
      slides: [
        {
          id: 'slide_1',
          name: 'Top 5 Animalitos Principales',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['la-granjita', 'guacharo-activo', 'lotto-activo', 'guacharito-millonario', 'chance-animal']
        },
        {
          id: 'slide_2',
          name: 'Triples y Terminales Estrella',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-zamorano', 'triple-caliente']
        }
      ]
    },
    estadisticas: {
      enabled: true,
      slides: [
        {
          id: 'slide_stats_1',
          name: 'Radiografía 30D y Pronósticos',
          enabled: true,
          duration: 20
        }
      ]
    },
    publicidad: {
      enabled: true,
      slides: [
        {
          id: 'slide_pub_1',
          name: 'Publicidad Oficial de Loterías',
          enabled: true,
          duration: 15
        }
      ]
    }
  },
  modules: {
    top5_animalitos: { enabled: true, duration: 20, games: ['guacharo-activo', 'granjita', 'lotto-activo', 'la-ricachona', 'lotto-rey'] },
    top5_triples: { enabled: true, duration: 20, games: ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-caracas', 'triple-zamorano'] },
    animalitos_group2: { enabled: true, duration: 18, games: ['selva-plus', 'ruleta-activa', 'granjita-plus'] },
    pizarra_1000: { enabled: true, duration: 28 },
    estadisticas_30d: { enabled: true, duration: 20 },
    publicidad_loteria: { enabled: true, duration: 15 },
    ultimos_5_sorteos: { enabled: true, duration: 25 }
  }
};

let currentScreenConfig = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
let lotteryMasterCatalog = [];
let lotteryTop10 = [];
let lotteryStatsData = null;
let lastAnnouncedDrawId = {};
let lotteryPollingTimer = null;

function applyScreenConfig(cfg) {
  if (!cfg) return;

  currentScreenConfig.themeMode = cfg.themeMode || currentScreenConfig.themeMode;
  currentScreenConfig.colorStyle = cfg.colorStyle || currentScreenConfig.colorStyle;
  if (cfg.tickerActive !== undefined) currentScreenConfig.tickerActive = Boolean(cfg.tickerActive);
  if (cfg.tickerSpeed) currentScreenConfig.tickerSpeed = parseInt(cfg.tickerSpeed) || 160;
  if (cfg.voiceEnabled !== undefined) currentScreenConfig.voiceEnabled = Boolean(cfg.voiceEnabled);
  if (cfg.voiceVolume !== undefined) currentScreenConfig.voiceVolume = parseFloat(cfg.voiceVolume);
  if (cfg.animalSfxEnabled !== undefined) currentScreenConfig.animalSfxEnabled = Boolean(cfg.animalSfxEnabled);

  const isMusic = (cfg.bgMusicEnabled !== undefined) ? cfg.bgMusicEnabled : cfg.circusMusicEnabled;
  if (isMusic !== undefined) {
    currentScreenConfig.bgMusicEnabled = Boolean(isMusic);
    currentScreenConfig.circusMusicEnabled = Boolean(isMusic);
  }
  const mTrack = cfg.circusMusicTrack || cfg.bgMusicTrack;
  if (mTrack !== undefined) {
    currentScreenConfig.circusMusicTrack = mTrack;
    currentScreenConfig.bgMusicTrack = mTrack;
  }
  const mVol = (cfg.circusMusicVolume !== undefined) ? cfg.circusMusicVolume : cfg.bgMusicVolume;
  if (mVol !== undefined) {
    currentScreenConfig.circusMusicVolume = parseFloat(mVol);
    currentScreenConfig.bgMusicVolume = parseFloat(mVol);
  }
  const mUrl = (cfg.customMusicUrl !== undefined) ? cfg.customMusicUrl : cfg.bgMusicCustomUrl;
  if (mUrl !== undefined) {
    currentScreenConfig.customMusicUrl = mUrl;
    currentScreenConfig.bgMusicCustomUrl = mUrl;
  }
  if (cfg.defaultService) currentScreenConfig.defaultService = cfg.defaultService;

  if (cfg.lotterySections) {
    currentScreenConfig.lotterySections = JSON.parse(JSON.stringify(cfg.lotterySections));
  }

  if (cfg.modules) {
    for (const [k, v] of Object.entries(cfg.modules)) {
      if (currentScreenConfig.modules[k]) {
        currentScreenConfig.modules[k] = { ...currentScreenConfig.modules[k], ...v };
      } else {
        currentScreenConfig.modules[k] = v;
      }
    }
  }

  // 1. Tema Dark / Light
  document.body.classList.toggle('theme-light', currentScreenConfig.themeMode === 'light');

  // 2. Paleta de Colores (5 Estilos)
  const colorClasses = ['color-emerald', 'color-cyan', 'color-gold', 'color-purple', 'color-clean'];
  colorClasses.forEach(cls => document.body.classList.remove(cls));
  document.body.classList.add(`color-${currentScreenConfig.colorStyle}`);

  // 3. Cintillo Inferior y Velocidad
  const tickerEl = document.getElementById('lotteryLiveTicker') || document.getElementById('lotteryTickerBar');
  const trackEl = document.getElementById('tickerContentTrack');
  if (tickerEl) {
    tickerEl.style.display = currentScreenConfig.tickerActive ? 'flex' : 'none';
  }
  if (trackEl) {
    trackEl.style.animationDuration = `${currentScreenConfig.tickerSpeed}s`;
  }

  // 4. Voz Humana
  lotteryVoiceEnabled = currentScreenConfig.voiceEnabled;

  // 5. Música de Fondo
  CircusMusicEngine.applyConfig(currentScreenConfig);
}

// ==========================================
// Mapa Oficial de Signos Zodiacales
// ==========================================
const ZODIAC_MAP = {
  'aries': { name: 'Aries', symbol: '♈', file: 'aries.svg', element: 'Fuego' },
  'tauro': { name: 'Tauro', symbol: '♉', file: 'tauro.svg', element: 'Tierra' },
  'geminis': { name: 'Géminis', symbol: '♊', file: 'geminis.svg', element: 'Aire' },
  'cancer': { name: 'Cáncer', symbol: '♋', file: 'cancer.svg', element: 'Agua' },
  'leo': { name: 'Leo', symbol: '♌', file: 'leo.svg', element: 'Fuego' },
  'virgo': { name: 'Virgo', symbol: '♍', file: 'virgo.svg', element: 'Tierra' },
  'libra': { name: 'Libra', symbol: '♎', file: 'libra.svg', element: 'Aire' },
  'escorpio': { name: 'Escorpio', symbol: '♏', file: 'escorpio.svg', element: 'Agua' },
  'sagitario': { name: 'Sagitario', symbol: '♐', file: 'sagitario.svg', element: 'Fuego' },
  'capricornio': { name: 'Capricornio', symbol: '♑', file: 'capricornio.svg', element: 'Tierra' },
  'acuario': { name: 'Acuario', symbol: '♒', file: 'acuario.svg', element: 'Aire' },
  'piscis': { name: 'Piscis', symbol: '♓', file: 'piscis.svg', element: 'Agua' }
};

function getZodiacData(rawSign) {
  if (!rawSign) return null;
  const clean = rawSign.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  for (const [key, data] of Object.entries(ZODIAC_MAP)) {
    if (clean.includes(key) || key.includes(clean)) {
      return data;
    }
  }
  return null;
}

// ==========================================
// Reloj y Fecha Oficial de Venezuela en Vivo (Petición 8)
// Formato estricto de fecha: "Domingo, 06/09/26"
// ==========================================
let lotteryClockTimer = null;

function updateLotteryLiveClockAndDate() {
  const clockEl = document.getElementById('lblLotteryLiveClock');
  const dateEl = document.getElementById('lblLotteryCurrentDate');
  const now = new Date();

  if (clockEl) {
    const timeStr = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    clockEl.innerHTML = `🕒 <strong>${timeStr}</strong>`;
  }

  if (dateEl) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dName = days[now.getDay()];
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    dateEl.textContent = `📅 ${dName}, ${dd}/${mm}/${yy}`;
  }
}

function startLotteryClock() {
  if (lotteryClockTimer) clearInterval(lotteryClockTimer);
  updateLotteryLiveClockAndDate();
  lotteryClockTimer = setInterval(updateLotteryLiveClockAndDate, 1000);
}



// ==========================================
// Motor de Efectos Sonoros Cómicos de Animales (Petición 6)
// ==========================================
const AnimalSFXEngine = {
  ctx: null,

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },

  playAnimalSound(rawAnimalName) {
    if (!currentScreenConfig.animalSfxEnabled) return;
    const ctx = this.init();
    if (!ctx) return;

    const name = (rawAnimalName || '').toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const now = ctx.currentTime;

    if (name.includes('burro')) {
      this.synthesizeDonkey(ctx, now);
    } else if (name.includes('caballo') || name.includes('yegua')) {
      this.synthesizeHorse(ctx, now);
    } else if (name.includes('perro') || name.includes('zorro') || name.includes('lobo') || name.includes('chivo')) {
      this.synthesizeDog(ctx, now);
    } else if (name.includes('gato') || name.includes('tigre') || name.includes('leona') || name.includes('pantera') || name.includes('leon') || name.includes('jaguar')) {
      this.synthesizeCat(ctx, now);
    } else if (name.includes('gallo') || name.includes('gallina') || name.includes('pavo')) {
      this.synthesizeRooster(ctx, now);
    } else if (name.includes('toro') || name.includes('buey') || name.includes('vaca')) {
      this.synthesizeBull(ctx, now);
    } else if (name.includes('cochino') || name.includes('cerdo') || name.includes('jabali') || name.includes('puerco')) {
      this.synthesizePig(ctx, now);
    } else if (name.includes('mono')) {
      this.synthesizeMonkey(ctx, now);
    } else if (name.includes('elefante')) {
      this.synthesizeElephant(ctx, now);
    } else if (name.includes('pajaro') || name.includes('canario') || name.includes('aguila') || name.includes('paloma') || name.includes('zamuro') || name.includes('guacharo') || name.includes('loro') || name.includes('perico')) {
      this.synthesizeBird(ctx, now);
    } else if (name.includes('rana') || name.includes('sapo')) {
      this.synthesizeFrog(ctx, now);
    } else {
      // Animales que no emiten sonidos característicos (delfín, ballena, iguana, culebra, ardilla, mariposa, pescado, caimán, venado, oso, camello, alacrán, ciempiés, etc.):
      // Sonido de selva tropical exótica
      this.synthesizeJungleAmbient(ctx, now);
    }
  },

  synthesizeDonkey(ctx, now) {
    [0, 0.42].forEach(offset => {
      const t = now + offset;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(650, t);
      osc1.frequency.exponentialRampToValueAtTime(1100, t + 0.16);
      gain1.gain.setValueAtTime(0.35, t);
      gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(450, t + 0.16);
      osc2.frequency.exponentialRampToValueAtTime(220, t + 0.36);
      gain2.gain.setValueAtTime(0.4, t + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.16);
      osc2.stop(t + 0.4);
    });
  },

  synthesizeHorse(ctx, now) {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1050, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.65);

    lfo.frequency.setValueAtTime(18, now);
    lfoGain.gain.setValueAtTime(120, now);
    lfo.connect(osc.frequency);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.7);
    osc.stop(now + 0.7);
  },

  synthesizeDog(ctx, now) {
    [0, 0.25].forEach(offset => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.16);
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  },

  synthesizeCat(ctx, now) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(850, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.7);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  },

  synthesizeRooster(ctx, now) {
    const notes = [
      { f: 440, d: 0.12, off: 0 },
      { f: 554, d: 0.12, off: 0.13 },
      { f: 659, d: 0.14, off: 0.26 },
      { f: 880, d: 0.45, off: 0.41 }
    ];
    notes.forEach(n => {
      const t = now + n.off;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.d + 0.05);
    });
  },

  synthesizeBull(ctx, now) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(85, now + 0.6);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.75);
  },

  synthesizePig(ctx, now) {
    [0, 0.22].forEach(offset => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.15);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.17);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  },

  synthesizeMonkey(ctx, now) {
    [0, 0.12, 0.24, 0.36].forEach(offset => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, t);
      osc.frequency.exponentialRampToValueAtTime(1650, t + 0.09);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  },

  synthesizeElephant(ctx, now) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.7);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  },

  synthesizeBird(ctx, now) {
    [0, 0.14, 0.28].forEach(offset => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, t);
      osc.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  },

  synthesizeFrog(ctx, now) {
    [0, 0.18, 0.36].forEach(offset => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(75, t + 0.12);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  },

  synthesizeJungleAmbient(ctx, now) {
    // 1. Brisa tropical / susurro de selva
    try {
      const bufferSize = ctx.sampleRate * 1.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.14, now + 0.35);
      noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 1.4);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 1.5);
    } catch(e) {}

    // 2. Grillos / Cigarras rítmicas de selva tropical
    try {
      const cricketOsc = ctx.createOscillator();
      const cricketGain = ctx.createGain();
      cricketOsc.type = 'sine';
      cricketOsc.frequency.setValueAtTime(5200, now);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(28, now);
      lfoGain.gain.setValueAtTime(0.6, now);
      lfo.connect(cricketGain.gain);

      cricketGain.gain.setValueAtTime(0.09, now);
      cricketGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

      cricketOsc.connect(cricketGain);
      cricketGain.connect(ctx.destination);

      lfo.start(now);
      cricketOsc.start(now);
      lfo.stop(now + 1.3);
      cricketOsc.stop(now + 1.3);
    } catch(e) {}

    // 3. Trinos de aves tropicales exóticas
    [0.08, 0.42, 0.76].forEach((delay, idx) => {
      const t = now + delay;
      const bird = ctx.createOscillator();
      const birdGain = ctx.createGain();
      bird.type = 'sine';

      const baseFreq = idx === 1 ? 2600 : 2100;
      bird.frequency.setValueAtTime(baseFreq, t);
      bird.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, t + 0.08);
      bird.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.18);

      birdGain.gain.setValueAtTime(0.01, t);
      birdGain.gain.linearRampToValueAtTime(0.20, t + 0.05);
      birdGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      bird.connect(birdGain);
      birdGain.connect(ctx.destination);

      bird.start(t);
      bird.stop(t + 0.24);
    });
  }
};

// ==========================================
// Motor de Música de Fondo de Circo y Carrusel (Petición 7)
// ==========================================
const CircusMusicEngine = {
  ctx: null,
  masterGain: null,
  activeMelodyTimer: null,
  isPlaying: false,
  currentTrack: 'none',
  customAudioEl: null,

  melodies: {
    circus_waltz: [
      { f: 523.25, d: 0.4 }, { f: 659.25, d: 0.25 }, { f: 783.99, d: 0.25 },
      { f: 880.00, d: 0.4 }, { f: 783.99, d: 0.25 }, { f: 659.25, d: 0.25 },
      { f: 587.33, d: 0.4 }, { f: 659.25, d: 0.25 }, { f: 698.46, d: 0.25 },
      { f: 783.99, d: 0.6 }, { f: 523.25, d: 0.4 }, { f: 659.25, d: 0.4 },
      { f: 783.99, d: 0.4 }, { f: 1046.50, d: 0.6 }, { f: 880.00, d: 0.4 },
      { f: 783.99, d: 0.4 }, { f: 659.25, d: 0.4 }, { f: 587.33, d: 0.6 }
    ],
    carnival_parade: [
      { f: 440.00, d: 0.2 }, { f: 466.16, d: 0.2 }, { f: 493.88, d: 0.2 }, { f: 523.25, d: 0.35 },
      { f: 659.25, d: 0.2 }, { f: 622.25, d: 0.2 }, { f: 587.33, d: 0.35 },
      { f: 523.25, d: 0.2 }, { f: 493.88, d: 0.2 }, { f: 466.16, d: 0.2 }, { f: 440.00, d: 0.35 },
      { f: 659.25, d: 0.2 }, { f: 783.99, d: 0.2 }, { f: 880.00, d: 0.4 }
    ],
    carousel_magic: [
      { f: 659.25, d: 0.25 }, { f: 783.99, d: 0.25 }, { f: 880.00, d: 0.25 }, { f: 987.77, d: 0.35 },
      { f: 880.00, d: 0.25 }, { f: 783.99, d: 0.25 }, { f: 659.25, d: 0.35 },
      { f: 587.33, d: 0.25 }, { f: 659.25, d: 0.25 }, { f: 783.99, d: 0.35 },
      { f: 523.25, d: 0.5 }
    ]
  },

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(currentScreenConfig.circusMusicVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },

  applyConfig(cfg) {
    if (!cfg.circusMusicEnabled || cfg.circusMusicTrack === 'none') {
      this.stop();
      return;
    }
    this.setVolume(cfg.circusMusicVolume);
    this.playTrack(cfg.circusMusicTrack, cfg.customMusicUrl);
  },

  setVolume(vol) {
    const safeVol = Math.max(0, Math.min(1, parseFloat(vol) || 0.25));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(safeVol, this.ctx.currentTime);
    }
    if (this.customAudioEl) {
      this.customAudioEl.volume = safeVol;
    }
  },

  playTrack(trackName, customUrl = '') {
    this.stop();
    this.currentTrack = trackName;
    if (trackName === 'none') return;

    if (trackName === 'custom') {
      const url = customUrl || currentScreenConfig.customMusicUrl;
      if (url) {
        if (!this.customAudioEl) {
          this.customAudioEl = new Audio();
          this.customAudioEl.loop = true;
        }
        this.customAudioEl.src = url;
        this.customAudioEl.volume = currentScreenConfig.circusMusicVolume || 0.25;
        this.customAudioEl.play().catch(() => {
          const startOnInteraction = () => {
            if (this.customAudioEl) this.customAudioEl.play().catch(() => {});
            window.removeEventListener('click', startOnInteraction);
            window.removeEventListener('keydown', startOnInteraction);
          };
          window.addEventListener('click', startOnInteraction, { once: true });
          window.addEventListener('keydown', startOnInteraction, { once: true });
        });
        this.isPlaying = true;
      }
      return;
    }

    const melody = this.melodies[trackName] || this.melodies.circus_waltz;
    const ctx = this.init();
    if (!ctx) return;

    this.isPlaying = true;
    let noteIdx = 0;

    const playNextNote = () => {
      if (!this.isPlaying || this.currentTrack !== trackName) return;

      const note = melody[noteIdx];
      const now = ctx.currentTime;

      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc1.type = 'triangle';
        osc2.type = 'square';

        osc1.frequency.setValueAtTime(note.f, now);
        osc2.frequency.setValueAtTime(note.f * 1.003, now);

        noteGain.gain.setValueAtTime(0.18, now);
        noteGain.gain.exponentialRampToValueAtTime(0.005, now + note.d * 0.95);

        osc1.connect(noteGain);
        osc2.connect(noteGain);
        noteGain.connect(this.masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + note.d);
        osc2.stop(now + note.d);
      } catch (e) {}

      noteIdx = (noteIdx + 1) % melody.length;
      this.activeMelodyTimer = setTimeout(playNextNote, note.d * 1000);
    };

    playNextNote();
  },

  stop() {
    this.isPlaying = false;
    if (this.activeMelodyTimer) {
      clearTimeout(this.activeMelodyTimer);
      this.activeMelodyTimer = null;
    }
    if (this.customAudioEl) {
      try {
        this.customAudioEl.pause();
        this.customAudioEl.currentTime = 0;
      } catch (e) {}
    }
  }
};

// ==========================================
// Sistema de Locución de Resultados
// ==========================================
let audioCtx = null;
let lotteryVoiceEnabled = true;

function playChimeAlert() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    osc2.frequency.setValueAtTime(659.25, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now + 0.05);
    osc1.stop(now + 0.75);
    osc2.stop(now + 0.75);
  } catch (e) {}
}

function getBestSpanishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const naturalSpanish = voices.find(v => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    return lang.startsWith('es') && (name.includes('natural') || name.includes('online') || name.includes('neural'));
  });
  if (naturalSpanish) return naturalSpanish;

  const googleSpanish = voices.find(v => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    return lang.startsWith('es') && (name.includes('google') || name.includes('sabina') || name.includes('dalia') || name.includes('jorge') || name.includes('paulina'));
  });
  if (googleSpanish) return googleSpanish;

  const latamSpanish = voices.find(v => {
    const lang = (v.lang || '').toLowerCase();
    return lang === 'es-ve' || lang === 'es-419' || lang === 'es-mx' || lang === 'es-us';
  });
  if (latamSpanish) return latamSpanish;

  return voices.find(v => (v.lang || '').toLowerCase().startsWith('es')) || null;
}

function speakLotteryDraw(gameName, drawTime, resultText, onEndCallback) {
  if (!lotteryVoiceEnabled) {
    if (onEndCallback) onEndCallback();
    return;
  }
  if (!('speechSynthesis' in window)) {
    if (onEndCallback) onEndCallback();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    
    // Normalización fonética para pronunciación fluida y natural:
    // 1. Quitar paréntesis o aclaratorias de horarios en el nombre hablado (ej: "Triple Chance (9 AM - 2 PM)" -> "Triple Chance")
    let cleanGameName = (gameName || '').replace(/\s*\([^)]*\)/g, '').trim();
    let cleanResult = (resultText || '').trim();

    // 2. Convertir mayúsculas continuas a minúsculas/título para evitar que el sintetizador las deletree
    cleanGameName = cleanGameName.replace(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    cleanResult = cleanResult.replace(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    // 3. Corregir Triples de Chance: locución limpia como "Chance" (pronunciado "Chanse" en español) seguido de la hora
    if (/\btriple\s+chance\b/i.test(cleanGameName) || cleanGameName.toLowerCase() === 'chance') {
      cleanGameName = 'Chanse';
    } else {
      cleanGameName = cleanGameName.replace(/\bchance\b/gi, 'Chanse');
    }
    cleanResult = cleanResult.replace(/\bchance\b/gi, 'Chanse');

    // 4. Corregir fonética de "Guácharo" para forzar acento esdrújulo en la primera 'a' (Guá-cha-ro)
    cleanGameName = cleanGameName.replace(/\bgu[aá]charo\b/gi, 'Guácharo');
    cleanResult = cleanResult.replace(/\bgu[aá]charo\b/gi, 'Guácharo');

    // 5. Corregir específicamente "Rícachona" para que se pronuncie como una sola palabra corrida con acento en la 'i' (Rí-ca-cho-na)
    cleanGameName = cleanGameName
      .replace(/la\s+r[ií]ca\s*chona/gi, 'La Rícachona')
      .replace(/\br[ií]ca\s+chona\b/gi, 'Rícachona')
      .replace(/\br[ií]cachona\b/gi, 'Rícachona');
    cleanResult = cleanResult
      .replace(/la\s+r[ií]ca\s*chona/gi, 'La Rícachona')
      .replace(/\br[ií]ca\s+chona\b/gi, 'Rícachona')
      .replace(/\br[ií]cachona\b/gi, 'Rícachona');

    // 6. Corregir fonética de "Táchira" para forzar acento esdrújulo en la primera 'a' (TÁ-chi-ra)
    cleanGameName = cleanGameName.replace(/\bt[aá]chira\b/gi, 'Táchira');
    cleanResult = cleanResult.replace(/\bt[aá]chira\b/gi, 'Táchira');

    const utterance = new SpeechSynthesisUtterance(`Atención. Resultado oficial de ${cleanGameName}, sorteo de las ${drawTime}: ${cleanResult}.`);
    utterance.lang = 'es-VE';
    utterance.rate = 0.90;
    utterance.pitch = 1.02;
    utterance.volume = currentScreenConfig.voiceVolume || 0.90;
    const bestVoice = getBestSpanishVoice();
    if (bestVoice) utterance.voice = bestVoice;

    let callbackFired = false;
    const fireCallbackOnce = () => {
      if (!callbackFired && onEndCallback) {
        callbackFired = true;
        onEndCallback();
      }
    };

    utterance.onend = fireCallbackOnce;
    utterance.onerror = fireCallbackOnce;
    setTimeout(fireCallbackOnce, 9000);

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[SpeechSynthesis]', e);
    if (onEndCallback) onEndCallback();
  }
}

// ==========================================
// Modal Pop-Up de Nuevo Resultado Oficial (10 Segundos - Requisito Solicitado)
// ==========================================
let popupDismissTimer = null;

function showNewResultPopup(game, draw) {
  const popup = document.getElementById('lotteryNewResultPopup');
  if (!popup) return;

  const isAnimal = game.type === 'animalitos';
  const logoEl = document.getElementById('popupLotteryLogo');
  const titleEl = document.getElementById('popupLotteryName');
  const timeEl = document.getElementById('popupDrawTime');
  const mediaBox = document.getElementById('popupMediaBox');
  const animalImg = document.getElementById('popupAnimalImg');
  const numDisplay = document.getElementById('popupNumberDisplay');
  const nameDisplay = document.getElementById('popupNameDisplay');
  const triplesBox = document.getElementById('popupTriplesBox');
  const timerFill = document.getElementById('popupTimerBarFill');

  if (timeEl) timeEl.textContent = draw.time || draw.hour || '';
  if (titleEl) titleEl.textContent = game.name || 'LOTERÍA';

  if (logoEl) {
    if (game.logoUrl) {
      logoEl.src = game.logoUrl;
      logoEl.style.display = 'block';
    } else {
      logoEl.style.display = 'none';
    }
  }

  if (isAnimal) {
    if (triplesBox) triplesBox.style.display = 'none';
    if (numDisplay) {
      numDisplay.textContent = draw.number || '--';
      numDisplay.style.display = 'block';
    }
    if (nameDisplay) {
      nameDisplay.textContent = draw.name || '';
      nameDisplay.style.display = 'block';
    }
    if (animalImg && mediaBox) {
      if (draw.image) {
        animalImg.src = draw.image;
        animalImg.style.display = 'block';
      } else {
        animalImg.style.display = 'none';
      }
      mediaBox.style.display = 'flex';
    }
  } else {
    // Triples
    if (numDisplay) numDisplay.style.display = 'none';
    if (nameDisplay) nameDisplay.style.display = 'none';
    if (triplesBox) {
      triplesBox.style.display = 'flex';
      const elA = document.getElementById('popupTripleA');
      const elB = document.getElementById('popupTripleB');
      const elC = document.getElementById('popupTripleC');
      const elSign = document.getElementById('popupSigno');
      if (elA) elA.textContent = `A: ${draw.tripleA || '--'}`;
      if (elB) elB.textContent = `B: ${draw.tripleB || '--'}`;
      if (elC) elC.textContent = `C: ${draw.tripleC || '--'}`;
      if (elSign) {
        const zData = draw.signo ? getZodiacData(draw.signo) : null;
        elSign.textContent = zData ? `${zData.symbol} ${zData.name}` : (draw.signo || '');
      }
    }
    if (mediaBox && animalImg) {
      const zData = draw.signo ? getZodiacData(draw.signo) : null;
      if (zData) {
        animalImg.src = `/images/zodiac/${zData.file}`;
        animalImg.style.display = 'block';
        mediaBox.style.display = 'flex';
      } else {
        mediaBox.style.display = 'none';
      }
    }
  }

  // Reiniciar barra regresiva de 10 segundos
  if (timerFill) {
    timerFill.style.animation = 'none';
    void timerFill.offsetWidth;
    timerFill.style.animation = 'popupCountdown 10s linear forwards';
  }

  popup.style.display = 'flex';
  popup.classList.remove('popup-fade-out');
  popup.classList.add('popup-fade-in');

  if (popupDismissTimer) clearTimeout(popupDismissTimer);
  popupDismissTimer = setTimeout(() => {
    popup.classList.remove('popup-fade-in');
    popup.classList.add('popup-fade-out');
    setTimeout(() => {
      popup.style.display = 'none';
      popup.classList.remove('popup-fade-out');
    }, 450);
  }, 10000);
}
window.showNewResultPopup = showNewResultPopup;

// ==========================================
// Cola Secuencial de Anuncios de Nuevos Resultados (Requisito 5)
// ==========================================
const knownAnnouncedDrawKeys = new Set();
let isAnnounceSystemInitialized = false;
const announcementQueue = [];
let isAnnouncementPlaying = false;

function enqueueDrawAnnouncements(items) {
  announcementQueue.push(...items);
  processNextAnnouncement();
}

function processNextAnnouncement() {
  if (isAnnouncementPlaying || announcementQueue.length === 0) return;
  isAnnouncementPlaying = true;

  const { game, draw } = announcementQueue.shift();
  const isAnimal = game.type === 'animalitos';

  console.log(`[Visual-FX] 📢 Anunciando nuevo resultado: ${game.name} - ${draw.time || draw.hour}`);

  // 1. Mostrar Pop-Up de 5 segundos con imagen y número (Requisito 6)
  showNewResultPopup(game, draw);

  // 2. Reproducir Efecto de Sonido: Animal específico o Selva Tropical (Requisito 5)
  if (isAnimal) {
    if (currentScreenConfig.animalSfxEnabled) {
      AnimalSFXEngine.playAnimalSound(draw.name);
    }
  } else {
    playChimeAlert();
  }

  // 3. Síntesis de Voz Humana tras concluir el sonido (~1.2s)
  setTimeout(() => {
    let resultDesc = '';
    if (isAnimal) {
      resultDesc = `Número ${draw.number || ''}, ${draw.name || ''}`;
    } else {
      resultDesc = `Triple A ${draw.tripleA || '--'}, Triple B ${draw.tripleB || '--'}, Triple C ${draw.tripleC || '--'}${draw.signo ? ', Signo ' + draw.signo : ''}`;
    }

    speakLotteryDraw(game.name, draw.time || draw.hour, resultDesc, () => {
      setTimeout(() => {
        isAnnouncementPlaying = false;
        processNextAnnouncement();
      }, 3000); // 3 segundos de espera estricta entre cada anuncio (Requisito 1)
    });
  }, 1200);
}

function checkForNewDrawAnnouncements(games) {
  if (!games || games.length === 0) return;

  const newDrawsDetected = [];

  games.forEach(game => {
    const draws = game.draws || game.results || [];
    draws.forEach(d => {
      const isDone = !d.isPending && (d.number || d.tripleA || d.tripleB || d.tripleC);
      if (!isDone) return;

      const rawGId = game.id || game.gameId;
      const gId = (rawGId === 'animalitos-la-ricachona') ? 'la-ricachona' : rawGId;
      const t = d.time || d.hour || '';
      const drawKey = `${gId}__${t}__${d.number || ''}_${d.tripleA || ''}_${d.tripleB || ''}_${d.tripleC || ''}`;

      if (!knownAnnouncedDrawKeys.has(drawKey)) {
        knownAnnouncedDrawKeys.add(drawKey);
        if (isAnnounceSystemInitialized) {
          newDrawsDetected.push({ game, draw: d });
        }
      }
    });
  });

  if (!isAnnounceSystemInitialized) {
    isAnnounceSystemInitialized = true;
    console.log(`[Visual-FX] Sistema de anuncios y pop-ups inicializado con ${knownAnnouncedDrawKeys.size} sorteos registrados previos.`);
    return;
  }

  if (newDrawsDetected.length > 0) {
    console.log(`[Visual-FX] ¡Detectados ${newDrawsDetected.length} nuevos resultados para anunciar y mostrar pop-up!`);
    enqueueDrawAnnouncements(newDrawsDetected);
  }
}

// ==========================================
// RENDERIZADORES DE LOS 7 MÓDULOS DEL CARRUSEL
// ==========================================

// Módulo 1 (3.1): Top 5 Animalitos Más Vendidos
function renderModuleTop5Animalitos(modCfg, stage) {
  const allowedGames = modCfg.games || ['guacharo-activo', 'granjita', 'lotto-activo', 'la-ricachona', 'lotto-rey'];
  let games = lotteryTop10.filter(g => allowedGames.includes(g.id || g.gameId));
  if (games.length === 0) {
    games = lotteryTop10.filter(g => g.type === 'animalitos').slice(0, 5);
  }

  const colsHtml = games.map(game => {
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && d.number);
    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && draw.number;
      const num = isDone ? draw.number : '--';
      const name = isDone ? (draw.name || '') : 'Esperando...';
      const img = isDone ? (draw.image || '') : '';
      return `
        <div class="board-draw-row ${isDone ? 'done' : 'pending'}">
          <span class="draw-time-cell">${draw.time || draw.hour}</span>
          <div class="draw-info-cell">
            <span class="draw-num-badge">${num}</span>
            <span class="draw-name-label">${name}</span>
          </div>
          <div class="draw-avatar-cell">
            ${img ? `<img src="${img}" class="draw-coin-thumb" alt="${name}" onerror="this.style.display='none'">` : (isDone ? '<span class="draw-coin-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.8rem;">🪙</span>' : '<span class="draw-pending-icon">⏳</span>')}
          </div>
        </div>
      `;
    }).join('');

    const isFewDraws = draws.length <= 6;
    return `
      <div class="board-col-card ${isFewDraws ? 'few-draws' : ''}">
        <div class="board-col-header animal">
          <div class="board-col-header-left">
            ${game.logoUrl ? `<img src="${game.logoUrl}" class="board-col-logo" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <span class="board-col-title">${game.name}</span>
          </div>
          <span class="board-col-badge">${completed.length}/${draws.length}</span>
        </div>
        <div class="board-col-body">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  stage.innerHTML = `<div class="board-columns-grid">${colsHtml}</div>`;
}

// Módulo 2 (3.2): Top 5 Triples y Terminales Más Vendidos
function renderModuleTop5Triples(modCfg, stage) {
  let allowedGames = modCfg.games || ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-caracas', 'triple-zamorano'];
  if (allowedGames.includes('triple-chance')) {
    const idx = allowedGames.indexOf('triple-chance');
    allowedGames.splice(idx, 1, 'triple-chance-1', 'triple-chance-2');
  }
  let games = lotteryTop10.filter(g => allowedGames.includes(g.id || g.gameId));
  if (games.length === 0) {
    games = lotteryTop10.filter(g => g.type === 'triples').slice(0, 5);
  }

  const colsHtml = games.map(game => {
    let draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.tripleA || d.tripleB || d.tripleC));
    const isFewDraws = draws.length <= 6;
    const gameHasB = draws.some(d => d.tripleB && d.tripleB !== '--');
    const gameHasC = draws.some(d => d.tripleC && d.tripleC !== '--');

    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && (draw.tripleA || draw.tripleB || draw.tripleC || draw.number);
      const tripleA = isDone ? (draw.tripleA || draw.number || '--') : '--';
      const tripleB = isDone ? (draw.tripleB || '--') : '--';
      const tripleC = isDone ? (draw.tripleC || '--') : '--';
      const signo = isDone ? (draw.signo || '') : '';
      const zData = getZodiacData(signo);
      const hasB = (tripleB !== '--' || gameHasB);
      const hasC = (tripleC !== '--' || gameHasC);

      return `
        <div class="board-draw-row triple-2lines ${isDone ? 'done' : 'pending'}">
          <div class="board-draw-left">
            <span class="draw-time-cell">${draw.time || draw.hour}</span>
            <div class="draw-avatar-cell">
              ${zData ? `<img src="/images/zodiac/${zData.file}" class="draw-zodiac-thumb" alt="${zData.name}" title="${zData.name}">` : (signo ? '<span style="font-size:1rem;">♈</span>' : (isDone ? '<span style="font-size:0.85rem;">⭐</span>' : '<span class="draw-pending-icon">⏳</span>'))}
            </div>
          </div>
          <div class="result-triple-block">
            <div class="result-triple-subline">
              <span class="result-triple-pill triple-a" title="Triple A">A: ${tripleA}</span>
              ${hasB ? `<span class="result-triple-pill triple-b" title="Triple B">B: ${tripleB}</span>` : ''}
            </div>
            <div class="result-triple-subline">
              ${hasC ? `<span class="result-triple-pill triple-c" title="Triple C">C: ${tripleC}</span>` : ''}
              ${signo ? `<span class="result-triple-sign">${zData ? `${zData.symbol} ${signo}` : signo}</span>` : (isDone && draw.name ? `<span class="result-triple-name">${draw.name}</span>` : (isDone ? '' : '<span class="result-triple-sign" style="opacity:0.6;">⏳ Por Jugar</span>'))}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="board-col-card ${isFewDraws ? 'few-draws' : ''}">
        <div class="board-col-header triple">
          <div class="board-col-header-left">
            ${game.logoUrl ? `<img src="${game.logoUrl}" class="board-col-logo" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <span class="board-col-title">${game.name}</span>
          </div>
          <span class="board-col-badge">${completed.length}/${draws.length}</span>
        </div>
        <div class="board-col-body">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  stage.innerHTML = `<div class="board-columns-grid">${colsHtml}</div>`;
}

// Módulo 3 (3.3): Animalitos Grupo 2 (del 6to en adelante)
function renderModuleAnimalitosGroup2(modCfg, stage) {
  const allowedGames = modCfg.games || ['selva-plus', 'ruleta-activa', 'granjita-plus'];
  let games = lotteryTop10.filter(g => allowedGames.includes(g.id || g.gameId));
  if (games.length === 0) {
    const allAnim = lotteryTop10.filter(g => g.type === 'animalitos');
    games = allAnim.length > 5 ? allAnim.slice(5) : allAnim.slice(0, 3);
  }

  const colsHtml = games.map(game => {
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && d.number);
    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && draw.number;
      const num = isDone ? draw.number : '--';
      const name = isDone ? (draw.name || '') : 'Esperando...';
      const img = isDone ? (draw.image || '') : '';
      return `
        <div class="board-draw-row ${isDone ? 'done' : 'pending'}">
          <span class="draw-time-cell">${draw.time || draw.hour}</span>
          <div class="draw-info-cell">
            <span class="draw-num-badge">${num}</span>
            <span class="draw-name-label">${name}</span>
          </div>
          <div class="draw-avatar-cell">
            ${img ? `<img src="${img}" class="draw-coin-thumb" alt="${name}" onerror="this.style.display='none'">` : (isDone ? '<span class="draw-coin-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.8rem;">🪙</span>' : '<span class="draw-pending-icon">⏳</span>')}
          </div>
        </div>
      `;
    }).join('');

    const isFewDraws = draws.length <= 6;
    return `
      <div class="board-col-card ${isFewDraws ? 'few-draws' : ''}">
        <div class="board-col-header animal">
          <div class="board-col-header-left">
            ${game.logoUrl ? `<img src="${game.logoUrl}" class="board-col-logo" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <span class="board-col-title">${game.name}</span>
          </div>
          <span class="board-col-badge">${completed.length}/${draws.length}</span>
        </div>
        <div class="board-col-body">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  const gridStyle = games.length <= 3 ? `style="grid-template-columns: repeat(${games.length}, 1fr);"` : '';
  stage.innerHTML = `<div class="board-columns-grid" ${gridStyle}>${colsHtml}</div>`;
}

// Módulo 4 (3.4): Pizarra General de Loterías
function renderModulePizarra1000(modCfg, stage) {
  const games = lotteryTop10.slice(0, 4);

  const colsHtml = games.map(game => {
    const isAnimal = game.type === 'animalitos';
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.number || d.tripleA || d.tripleB || d.tripleC));

    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && (draw.number || draw.tripleA || draw.tripleB || draw.tripleC);
      const num = isDone ? (isAnimal ? draw.number : `A:${draw.tripleA || '--'}`) : '--';
      const name = isDone ? (isAnimal ? (draw.name || '') : `B:${draw.tripleB || '--'} C:${draw.tripleC || '--'} ${draw.signo || ''}`) : 'Esperando...';
      const img = isDone ? (draw.image || '') : '';
      const zData = (!isAnimal && isDone && draw.signo) ? getZodiacData(draw.signo) : null;

      return `
        <div class="board-draw-row ${isDone ? 'done' : 'pending'}">
          <span class="draw-time-cell">${draw.time || draw.hour}</span>
          <div class="draw-info-cell">
            <span class="draw-num-badge">${num}</span>
            <span class="draw-name-label">${name}</span>
          </div>
          <div class="draw-avatar-cell">
            ${img ? `<img src="${img}" class="draw-coin-thumb" alt="${name}" onerror="this.style.display='none'">` : (zData ? `<img src="/images/zodiac/${zData.file}" class="draw-zodiac-thumb" alt="${zData.name}">` : (isDone ? '<span class="draw-coin-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.8rem;">🪙</span>' : '<span class="draw-pending-icon">⏳</span>'))}
          </div>
        </div>
      `;
    }).join('');

    const isFewDraws = draws.length <= 6;
    return `
      <div class="board-col-card ${isFewDraws ? 'few-draws' : ''}">
        <div class="board-col-header ${game.type === 'animalitos' ? 'animal' : 'triple'}">
          <div class="board-col-header-left">
            ${game.logoUrl ? `<img src="${game.logoUrl}" class="board-col-logo" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <span class="board-col-title">${game.name}</span>
          </div>
          <span class="board-col-badge">${completed.length}/${draws.length}</span>
        </div>
        <div class="board-col-body">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  stage.innerHTML = `
    <div class="pizarra-1000-layout">
      <div class="pizarra-1000-results-pane">
        <div class="pizarra-1000-banner-header">
          <span>📊 RESULTADOS DE ANIMALITOS Y TRIPLES DE HOY</span>
          <span class="pizarra-status-pill"><span class="pizarra-status-dot"></span> ESTADO ACTIVO</span>
        </div>
        <div class="pizarra-1000-four-grid">${colsHtml}</div>
      </div>
    </div>
  `;
}

let statsAnimalRotationIdx = 0;

// Módulo 5 (3.5): Radiografía Estadística 30D y Pronósticos (Exclusivo Animalitos - Requisito 8)
function renderModuleEstadisticas(modCfg, stage) {
  const gamesDict = lotteryStatsData?.summary || {};
  // Filtrar estrictamente solo animalitos (excluyendo triples como Zulia, Táchira, etc.)
  const animalKeys = Object.keys(gamesDict).filter(k => {
    const item = gamesDict[k];
    return item && (!item.type || item.type === 'animalitos') && !k.includes('triple');
  });

  const activeKey = animalKeys.length > 0 ? animalKeys[statsAnimalRotationIdx % animalKeys.length] : 'guacharo-activo';
  statsAnimalRotationIdx++;
  const gStats = gamesDict[activeKey] || null;
  const gameDisplayName = gStats?.name || 'Lotto Activo';

  const hot = gStats?.hot || [
    { number: '18', name: 'BURRO', occurrences: 24 },
    { number: '07', name: 'PERICO', occurrences: 21 },
    { number: '25', name: 'GALLINA', occurrences: 19 },
    { number: '34', name: 'VENADO', occurrences: 18 },
    { number: '11', name: 'GATO', occurrences: 17 }
  ];

  const cold = gStats?.cold || [
    { number: '03', name: 'CIEMPIÉS', occurrences: 2, daysOverdue: 14 },
    { number: '15', name: 'ZORRO', occurrences: 3, daysOverdue: 12 },
    { number: '29', name: 'ELEFANTE', occurrences: 3, daysOverdue: 11 },
    { number: '00', name: 'DELFÍN', occurrences: 4, daysOverdue: 9 },
    { number: '36', name: 'CULEBRA', occurrences: 4, daysOverdue: 8 }
  ];

  const predictions = gStats?.predictions || {
    calientes: [{ number: '18', name: 'BURRO' }, { number: '07', name: 'PERICO' }, { number: '25', name: 'GALLINA' }],
    atrasados: [{ number: '03', name: 'CIEMPIÉS' }, { number: '15', name: 'ZORRO' }],
    datosFenix: ['11', '34']
  };

  const hotHtml = hot.slice(0, 5).map((item, idx) => `
    <div class="stats-item-row">
      <div class="stats-item-left">
        <span class="stats-item-rank ${idx === 0 ? 'top1' : ''}">${idx + 1}</span>
        <span class="stats-item-num">${item.number || item.num}</span>
        <span class="stats-item-name">${item.name ? `(${item.name})` : ''}</span>
      </div>
      <span class="stats-item-badge hot">🔥 ${item.occurrences || item.count || 0} veces</span>
    </div>
  `).join('');

  const coldHtml = cold.slice(0, 5).map((item, idx) => `
    <div class="stats-item-row">
      <div class="stats-item-left">
        <span class="stats-item-rank">${idx + 1}</span>
        <span class="stats-item-num">${item.number || item.num}</span>
        <span class="stats-item-name">${item.name ? `(${item.name})` : ''}</span>
      </div>
      <span class="stats-item-badge cold">❄️ ${item.occurrences !== undefined ? `${item.occurrences} veces (${item.daysOverdue}d sin salir)` : `${item.daysOverdue || 0} días`}</span>
    </div>
  `).join('');

  const hotPills = (predictions.calientes || []).map(p => `<span class="prediction-chip hot">🔥 ${p.number || p} ${p.name || ''}</span>`).join('');
  const coldPills = (predictions.atrasados || predictions.reventar || []).map(p => `<span class="prediction-chip cold">⚡ ${p.number || p} ${p.name || ''}</span>`).join('');
  const fijosPills = (predictions.datosFenix || predictions.fijos || []).map(p => `<span class="prediction-chip star">🎯 ${p.number || p} ${p.name || ''}</span>`).join('');

  stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 14px; background:rgba(15,23,42,0.8); border:1px solid rgba(56,189,248,0.3); border-radius:12px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          ${gStats?.logoUrl ? `<img src="${gStats.logoUrl}" style="height:28px; width:auto; border-radius:6px;" alt="${gameDisplayName}">` : '<span style="font-size:1.5rem;">🐾</span>'}
          <strong style="color:#38bdf8; font-size:1.15rem; letter-spacing:0.5px;">🐾 LOTERÍA DE ANIMALITOS: ${gameDisplayName.toUpperCase()}</strong>
        </div>
        <span style="color:#94a3b8; font-size:0.85rem; font-weight:700;">📅 Frecuencia Global Acumulada 30 Días (Todas las horas)</span>
      </div>
      <div class="stats-dashboard-grid">
        <div class="stats-pillar-card gold-theme">
          <div class="stats-pillar-header gold">🥇 TOP 5 MÁS PREMIADOS (30 DÍAS)</div>
          <div class="stats-pillar-body">${hotHtml}</div>
        </div>
        <div class="stats-pillar-card cold-theme">
          <div class="stats-pillar-header blue">❄️ TOP 5 MENOS SALIDOS (30 DÍAS)</div>
          <div class="stats-pillar-body">${coldHtml}</div>
        </div>
        <div class="stats-pillar-card pred-theme">
          <div class="stats-pillar-header green">🔮 PRONÓSTICOS Y DATOS RECOMENDADOS</div>
          <div class="stats-pillar-body">
            <div class="prediction-block">
              <span class="prediction-block-title" style="color:#fbbf24;">🔥 Calientes Probables</span>
              <div class="prediction-chips-box">${hotPills}</div>
            </div>
            <div class="prediction-block">
              <span class="prediction-block-title" style="color:#38bdf8;">⚡ Por Reventar (Ciclo Vencido)</span>
              <div class="prediction-chips-box">${coldPills}</div>
            </div>
            <div class="prediction-block">
              <span class="prediction-block-title" style="color:#34d399;">🎯 Datos Fenix / Fijos del Día</span>
              <div class="prediction-chips-box">${fijosPills}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="stats-bottom-cta-banner">
        <span>🎰 ¡JUEGA TUS NÚMEROS FAVORITOS EN TAQUILLA! • Cobro garantizado al instante • La suerte está de tu lado</span>
      </div>
    </div>
  `;
}

// Módulo 6 (3.6): Publicidad Oficial de Loterías (3 Diapositivas con Logos Oficiales)
let adSlideIndex = 0;
function renderModulePublicidad(modCfg, stage) {
  const slide = adSlideIndex;
  adSlideIndex = (adSlideIndex + 1) % 3;

  const animalGames = lotteryTop10.filter(g => g.type === 'animalitos').slice(0, 5);
  const tripleGames = lotteryTop10.filter(g => g.type === 'triples').slice(0, 5);

  let slideHtml = '';

  if (slide === 0) {
    const logosHtml = animalGames.map(g => `
      <div class="ad-lottery-logo-item">
        ${g.logoUrl ? `<img src="${g.logoUrl}" alt="${g.name}" onerror="this.style.display='none'">` : '<div style="font-size:2.2rem;">🐾</div>'}
        <span>${g.name}</span>
      </div>
    `).join('');

    slideHtml = `
      <div class="ad-slide-showcase">
        <div class="ad-slide-tag">🐾 RULETAS LÍDERES EN VENEZUELA</div>
        <h2 class="ad-slide-title">LAS MEJORES RULETAS DE ANIMALITOS</h2>
        <p class="ad-slide-subtitle">Sorteos oficiales cada hora desde las 8:00 AM hasta las 7:00 PM. ¡Gana 30 veces tu jugada!</p>
        <div class="ad-logos-row">${logosHtml}</div>
        <div class="ad-slide-cta">¡Acércate a la taquilla y sella tu animalito de la suerte!</div>
      </div>
    `;
  } else if (slide === 1) {
    const logosHtml = tripleGames.map(g => `
      <div class="ad-lottery-logo-item">
        ${g.logoUrl ? `<img src="${g.logoUrl}" alt="${g.name}" onerror="this.style.display='none'">` : '<div style="font-size:2.2rem;">🎰</div>'}
        <span>${g.name}</span>
      </div>
    `).join('');

    slideHtml = `
      <div class="ad-slide-showcase">
        <div class="ad-slide-tag">🎰 TRIPLES MILLONARIOS</div>
        <h2 class="ad-slide-title">TRIPLES Y TERMINALES EN VIVO</h2>
        <p class="ad-slide-subtitle">Triples A, B y Signo Astral con los mejores dividendos y premios garantizados en taquilla.</p>
        <div class="ad-logos-row">${logosHtml}</div>
        <div class="ad-slide-cta">¡Premios millonarios al instante con tu ticket oficial!</div>
      </div>
    `;
  } else {
    slideHtml = `
      <div class="ad-slide-showcase">
        <div class="ad-slide-tag">🛡️ SEGURIDAD Y CONFIANZA</div>
        <h2 class="ad-slide-title">JUEGUE LEGAL, SEGURO Y COBRE AL INSTANTE</h2>
        <p class="ad-slide-subtitle">En esta agencia física tus jugadas están 100% garantizadas y respaldadas por las operadoras oficiales.</p>
        <div class="ad-security-badges">
          <div class="ad-sec-badge">🔒 Apuestas Oficiales Verificadas</div>
          <div class="ad-sec-badge">⚡ Pago de Premios Inmediato</div>
          <div class="ad-sec-badge">📺 Resultados en Pantallas Digitales en Vivo</div>
        </div>
        <div class="ad-slide-cta">¡Gracias por su preferencia! Solicite sus pronósticos en taquilla.</div>
      </div>
    `;
  }

  stage.innerHTML = `<div class="ads-showcase-container">${slideHtml}</div>`;
}

// Módulo 7 (3.7): Últimos 5 Sorteos Incorporados (Formato Tarjeta Destacada - Imagen 2)
function renderModuleUltimos5Sorteos(modCfg, stage) {
  const completedList = [];
  lotteryTop10.forEach(game => {
    const draws = game.draws || game.results || [];
    draws.forEach(d => {
      if (!d.isPending && (d.number || d.tripleA || d.tripleB || d.tripleC)) {
        completedList.push({
          game,
          draw: d,
          time: d.time || d.hour || ''
        });
      }
    });
  });

  const latestFive = completedList.slice(-5).reverse();

  if (latestFive.length === 0) {
    stage.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#94a3b8; font-size:1.5rem;">
        <span style="font-size:4rem; margin-bottom:12px;">⏳</span>
        <strong>Esperando los primeros sorteos emitidos de la jornada</strong>
      </div>
    `;
    return;
  }

  const cardsHtml = latestFive.map(item => {
    const { game, draw } = item;
    const isAnimal = game.type === 'animalitos';
    const hasTriplesBC = !!(draw.tripleB || draw.tripleC);
    const num = isAnimal ? (draw.number || '--') : (hasTriplesBC ? `A: ${draw.tripleA || '--'}` : (draw.tripleA || draw.number || '--'));
    const name = isAnimal ? (draw.name || '') : (hasTriplesBC ? `B: ${draw.tripleB || '--'}${draw.tripleC ? ` • C: ${draw.tripleC}` : ''}` : (draw.signo || draw.name || ''));
    const signo = (!isAnimal && draw.signo) ? draw.signo : '';
    const zData = signo ? getZodiacData(signo) : null;
    const img = draw.image || '';

    return `
      <div class="hero-luxury-card">
        <div class="hero-countdown-box">
          <div class="hero-countdown-track">
            <div class="hero-countdown-fill"></div>
          </div>
        </div>
        <div class="hero-lottery-brand">
          ${game.logoUrl ? `<img src="${game.logoUrl}" class="hero-lottery-logo-circle" alt="${game.name}" onerror="this.style.display='none'">` : '<div style="font-size:2rem;">🎰</div>'}
          <h3 class="hero-lottery-name">${game.name}</h3>
        </div>
        <div class="hero-giant-number">${num}</div>
        <div class="hero-animal-name">${name}</div>
        <div class="hero-gold-medallion">
          ${img ? `<img src="${img}" class="hero-medal-img" alt="${name}" onerror="this.style.display='none'">` : (zData ? `<img src="/images/zodiac/${zData.file}" class="hero-medal-img" alt="${zData.name}">` : `
            <span class="medal-arc-text">${name}</span>
            <span class="medal-center-num">${isAnimal ? num : (zData ? zData.symbol : '⭐')}</span>
            <span class="medal-arc-text">${name}</span>
          `)}
        </div>
        <div class="hero-card-footer-bar">
          <span>🕒 Sorteo de las <strong>${draw.time || draw.hour}</strong></span>
          <span class="hero-card-status">🟢 Oficial en Vivo</span>
        </div>
      </div>
    `;
  }).join('');

  stage.innerHTML = `<div class="hero-showcase-grid">${cardsHtml}</div>`;
}

// ==========================================
// RENDERIZADOR DE DIAPOSITIVA DE RESULTADOS (IMAGEN 4)
// ==========================================
function renderCustomResultSlide(slideCfg, stage) {
  let chosenIds = Array.isArray(slideCfg.lotteries) ? slideCfg.lotteries.slice() : [];

  // Si la diapositiva incluye 'triple-chance' general, expandir a las 2 mitades oficiales de sorteos
  if (chosenIds.includes('triple-chance')) {
    const idx = chosenIds.indexOf('triple-chance');
    chosenIds.splice(idx, 1, 'triple-chance-1', 'triple-chance-2');
  }

  const colCount = Math.min(5, Math.max(1, parseInt(slideCfg.lotteryCount) || 5));
  chosenIds = chosenIds.slice(0, colCount);

  const defaultFallbackList = ['la-granjita', 'guacharo-activo', 'lotto-activo', 'guacharito-millonario', 'chance-animal'];
  while (chosenIds.length < colCount) {
    const nextGame = defaultFallbackList[chosenIds.length] || (lotteryTop10[chosenIds.length] && lotteryTop10[chosenIds.length].id) || 'la-granjita';
    chosenIds.push(nextGame);
  }

  const colsHtml = chosenIds.map(gameId => {
    let game = lotteryTop10.find(g => (g.id === gameId || g.gameId === gameId));
    if (!game) {
      game = lotteryMasterCatalog.find(g => g.id === gameId);
    }
    // Fallback dinámico para mitades de Triple Chance
    if (!game && (gameId === 'triple-chance-1' || gameId === 'triple-chance-2')) {
      const isPart1 = (gameId === 'triple-chance-1');
      const parent = lotteryTop10.find(g => (g.id === 'triple-chance' || g.gameId === 'triple-chance')) || {};
      game = {
        id: gameId,
        gameId: gameId,
        name: isPart1 ? 'TRIPLE CHANCE (9 AM - 2 PM)' : 'TRIPLE CHANCE (3 PM - 7 PM)',
        shortName: isPart1 ? 'Chance 1' : 'Chance 2',
        type: 'triples',
        color: '#8b5cf6',
        logoUrl: parent.logoUrl || 'https://api.1000resultados.com/public/images/lottery/triplechance/logo.png',
        icon: '🎲',
        hours: isPart1 
          ? ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM']
          : ['03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM']
      };
    }
    if (!game) {
      game = { id: gameId, name: gameId.toUpperCase().replace(/-/g, ' '), type: 'animalitos', color: '#0d734d' };
    }

    const isAnimal = (game.type !== 'triples');
    const headerColor = game.color || (isAnimal ? '#0d734d' : '#2563eb');
    let draws = game.draws || game.results || [];

    // Derivar sorteos si es una mitad de Triple Chance y aún no tiene draws propios
    if ((!draws || draws.length === 0) && (gameId === 'triple-chance-1' || gameId === 'triple-chance-2')) {
      const parent = lotteryTop10.find(g => (g.id === 'triple-chance' || g.gameId === 'triple-chance')) || {};
      const parentDraws = parent.draws || parent.results || [];
      const parseM = (ts) => {
        const m = (ts || '').match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
        if (!m) return 0;
        let hrs = parseInt(m[1], 10);
        if (m[3].toUpperCase() === 'PM' && hrs < 12) hrs += 12;
        if (m[3].toUpperCase() === 'AM' && hrs === 12) hrs = 0;
        return hrs * 60 + parseInt(m[2], 10);
      };
      const cutoff = 14 * 60; // 02:00 PM
      if (gameId === 'triple-chance-1') {
        draws = parentDraws.filter(d => parseM(d.time || d.hour) <= cutoff);
      } else {
        draws = parentDraws.filter(d => parseM(d.time || d.hour) > cutoff && parseM(d.time || d.hour) <= 19 * 60 + 30);
      }
    }

    // Obtener SOLO los horarios programados oficiales de este juego (sin inventar horas inexistentes)
    let scheduledHours = [];
    if (Array.isArray(game.hours) && game.hours.length > 0) {
      scheduledHours = game.hours;
    } else {
      const cat = lotteryMasterCatalog.find(cg => (cg.id === gameId || cg.gameId === gameId));
      if (cat && Array.isArray(cat.hours) && cat.hours.length > 0) {
        scheduledHours = cat.hours;
      }
    }

    // Normalizador de hora seguro (ej: "8:00 AM" -> "08:00 AM")
    const normH = (t) => {
      if (!t) return '';
      t = t.trim().toUpperCase();
      if (t.indexOf(':') === 1) t = '0' + t;
      return t;
    };

    // Unir horarios programados oficiales y sorteos con resultados reales (estrictamente solo horas con sorteos)
    const hourMap = new Map();
    if (scheduledHours.length > 0) {
      scheduledHours.forEach(h => {
        const k = normH(h);
        if (k) hourMap.set(k, { time: k, isPending: true });
      });
    }
    draws.forEach(d => {
      const k = normH(d.time || d.hour);
      if (k) {
        const existing = hourMap.get(k) || {};
        hourMap.set(k, { ...existing, ...d, time: k });
      }
    });

    const displayRows = Array.from(hourMap.values()).sort((a, b) => {
      const parseM = (ts) => {
        const m = (ts || '').match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
        if (!m) return 0;
        let hrs = parseInt(m[1], 10);
        if (m[3].toUpperCase() === 'PM' && hrs < 12) hrs += 12;
        if (m[3].toUpperCase() === 'AM' && hrs === 12) hrs = 0;
        return hrs * 60 + parseInt(m[2], 10);
      };
      return parseM(a.time) - parseM(b.time);
    });

    const isFewDraws = displayRows.length <= 6;
    const gameHasB = displayRows.some(d => d.tripleB && d.tripleB !== '--');
    const gameHasC = displayRows.some(d => d.tripleC && d.tripleC !== '--');

    const rowsHtml = displayRows.map(draw => {
      const isDone = !draw.isPending && (draw.number || draw.tripleA || draw.tripleB || draw.tripleC);
      const timeStr = draw.time || draw.hour || '';

      if (isAnimal) {
        const num = isDone ? (draw.number || draw.tripleA || '--') : '--';
        const zData = draw.signo ? getZodiacData(draw.signo) : null;
        const name = isDone ? (draw.name || (draw.signo ? (zData ? `${zData.symbol} ${draw.signo}` : draw.signo) : '')) : '';
        const img = isDone ? (draw.image || '') : '';
        return `
          <div class="result-draw-row ${isDone ? 'done' : 'pending'}">
            <span class="result-time">${timeStr}</span>
            <div class="result-avatar-box">
              ${img ? `<img src="${img}" class="result-avatar-img" alt="${name}" onerror="this.style.display='none'">` : (zData ? `<img src="/images/zodiac/${zData.file}" class="result-avatar-img" alt="${draw.signo}">` : '<span class="result-avatar-coin">🐾</span>')}
            </div>
            <span class="result-num-blue">${num}</span>
            <span class="result-pipe-red">|</span>
            <span class="result-animal-name">${name}</span>
          </div>
        `;
      } else {
        const tA = isDone ? (draw.tripleA || draw.number || '--') : '--';
        const tB = isDone ? (draw.tripleB || '--') : '--';
        const tC = isDone ? (draw.tripleC || '--') : '--';
        const signo = isDone ? (draw.signo || '') : '';
        const extraName = isDone ? (draw.name || '') : '';
        const zData = signo ? getZodiacData(signo) : null;
        const isMultiTripleGame = (gameId.includes('chance') || gameId.includes('zulia') || gameId.includes('tachira') || gameId.includes('zamorano') || gameId.includes('caliente') || gameHasB || gameHasC);

        const avatarImgHtml = draw.image 
          ? `<img src="${draw.image}" class="result-avatar-img" alt="${extraName || ''}" onerror="this.style.display='none'">` 
          : (zData 
            ? `<img src="/images/zodiac/${zData.file}" class="result-avatar-img" alt="${zData.name}">` 
            : (game.logoUrl 
              ? `<img src="${game.logoUrl}" class="result-avatar-img" alt="${game.name}" onerror="this.style.display='none'">` 
              : '<span class="result-avatar-coin">🎰</span>'));

        // Solo juegos de terminales puros de 1 número usan una sola línea
        if (!isMultiTripleGame && !gameHasB && !gameHasC && !signo) {
          return `
            <div class="result-draw-row ${isDone ? 'done' : 'pending'}">
              <span class="result-time">${timeStr}</span>
              <div class="result-avatar-box">
                ${avatarImgHtml}
              </div>
              <span class="result-num-blue ${isFewDraws ? 'few-scale' : ''}">${tA}</span>
              ${extraName ? `<span class="result-pipe-red">|</span><span class="result-animal-name">${extraName}</span>` : ''}
            </div>
          `;
        }

        // Diseño Oficial en 2 Líneas para Triples (Requisito 1):
        // Línea 1: Triples A y B
        // Línea 2: Triple C con su signo zodiacal
        return `
          <div class="result-draw-row triple-2lines ${isDone ? 'done' : 'pending'}">
            <div class="result-draw-left">
              <span class="result-time">${timeStr}</span>
              <div class="result-avatar-box">
                ${avatarImgHtml}
              </div>
            </div>
            <div class="result-triple-block">
              <div class="result-triple-subline">
                <span class="result-triple-pill triple-a" title="Triple A">A: ${tA}</span>
                <span class="result-triple-pill triple-b" title="Triple B">B: ${tB}</span>
              </div>
              <div class="result-triple-subline">
                <span class="result-triple-pill triple-c" title="Triple C">C: ${tC}</span>
                ${signo ? `<span class="result-triple-sign">${zData ? `${zData.symbol} ${signo}` : signo}</span>` : (extraName ? `<span class="result-triple-name">${extraName}</span>` : (isDone ? '' : '<span class="result-triple-sign" style="opacity:0.6;">⏳ Por Jugar</span>'))}
              </div>
            </div>
          </div>
        `;
      }
    }).join('');

    return `
      <div class="result-column-card ${isFewDraws ? 'few-draws' : ''}">
        <div class="result-column-header" style="background-color: ${headerColor};">
          <div class="result-col-logo-badge">
            ${game.logoUrl ? `<img src="${game.logoUrl}" class="result-col-logo-img" alt="${game.name}" onerror="this.style.display='none'">` : `<span style="font-size:1.1rem;">${isAnimal ? '🐾' : '🎰'}</span>`}
          </div>
          <span class="result-col-title">${game.name}</span>
        </div>
        <div class="result-column-body">
          ${rowsHtml}
        </div>
      </div>
    `;
  }).join('');

  stage.innerHTML = `
    <div class="result-slide-container">
      <div class="result-slide-grid" data-cols="${colCount}" style="--col-count: ${colCount};">
        ${colsHtml}
      </div>
    </div>
  `;
}
window.renderCustomResultSlide = renderCustomResultSlide;

// ==========================================
// MOTOR MULTI-SECCIÓN DE DIAPOSITIVAS Y NAVEGACIÓN
// ==========================================
let currentCarouselSlideIdx = 0;
let carouselTransitionTimer = null;
let isCarouselPaused = false;

function getActiveCarouselSlides() {
  const sections = currentScreenConfig.lotterySections;
  const slidesQueue = [];

  if (sections) {
    // 1. Sección Resultados (1 a 10 diapositivas)
    if (sections.resultados && sections.resultados.enabled !== false && Array.isArray(sections.resultados.slides)) {
      sections.resultados.slides.forEach((s, idx) => {
        if (s && s.enabled !== false) {
          slidesQueue.push({
            type: 'resultados',
            section: 'resultados',
            id: s.id || `slide_res_${idx}`,
            name: s.name || `Resultados - Diapositiva ${idx + 1}`,
            duration: Math.max(5, parseInt(s.duration) || 20),
            lotteryCount: Math.min(5, Math.max(1, parseInt(s.lotteryCount) || 5)),
            lotteries: Array.isArray(s.lotteries) ? s.lotteries : []
          });
        }
      });
    }

    // 2. Sección Estadísticas (1 a 10 diapositivas)
    if (sections.estadisticas && sections.estadisticas.enabled !== false && Array.isArray(sections.estadisticas.slides)) {
      sections.estadisticas.slides.forEach((s, idx) => {
        if (s && s.enabled !== false) {
          slidesQueue.push({
            type: 'estadisticas',
            section: 'estadisticas',
            id: s.id || `slide_stat_${idx}`,
            name: s.name || `Radiografía Estadística 30D & Pronósticos`,
            duration: Math.max(5, parseInt(s.duration) || 20)
          });
        }
      });
    }

    // 3. Sección Publicidad (1 a 10 diapositivas)
    if (sections.publicidad && sections.publicidad.enabled !== false && Array.isArray(sections.publicidad.slides)) {
      sections.publicidad.slides.forEach((s, idx) => {
        if (s && s.enabled !== false) {
          slidesQueue.push({
            type: 'publicidad',
            section: 'publicidad',
            id: s.id || `slide_pub_${idx}`,
            name: s.name || `Publicidad Oficial de Loterías`,
            duration: Math.max(5, parseInt(s.duration) || 15)
          });
        }
      });
    }
  }

  if (slidesQueue.length === 0) {
    slidesQueue.push({
      type: 'resultados',
      section: 'resultados',
      id: 'slide_1',
      name: 'Top 5 Animalitos Principales',
      duration: 20,
      lotteryCount: 5,
      lotteries: ['la-granjita', 'guacharo-activo', 'lotto-activo', 'guacharito-millonario', 'chance-animal']
    });
    slidesQueue.push({
      type: 'resultados',
      section: 'resultados',
      id: 'slide_2',
      name: 'Triples y Terminales Estrella',
      duration: 20,
      lotteryCount: 5,
      lotteries: ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-zamorano', 'triple-caliente']
    });
  }

  return slidesQueue;
}
window.getActiveCarouselSlides = getActiveCarouselSlides;

function updateLotteryPageIndicator(idx, total) {
  const pageStr = `${idx + 1} de ${total}`;
  const pageEl = document.getElementById('lblLotteryPageText');
  if (pageEl) pageEl.textContent = pageStr;

  const headerPageEl = document.getElementById('lblHeaderPageCounter') || document.getElementById('lblCintilloPage');
  if (headerPageEl) headerPageEl.textContent = pageStr;
}
window.updateLotteryPageIndicator = updateLotteryPageIndicator;

function renderCurrentCarouselSlide() {
  const slides = getActiveCarouselSlides();
  if (slides.length === 0) return 20;

  if (currentCarouselSlideIdx >= slides.length) {
    currentCarouselSlideIdx = 0;
  } else if (currentCarouselSlideIdx < 0) {
    currentCarouselSlideIdx = slides.length - 1;
  }

  const activeSlide = slides[currentCarouselSlideIdx];
  const stage = document.getElementById('lotteryCarouselStage');

  const lblModule = document.getElementById('lblActiveModuleName');
  if (lblModule) {
    lblModule.textContent = activeSlide.name || 'RESULTADOS DE LOTERÍAS';
  }

  updateLotteryPageIndicator(currentCarouselSlideIdx, slides.length);

  if (stage) {
    try {
      if (activeSlide.type === 'resultados') {
        renderCustomResultSlide(activeSlide, stage);
      } else if (activeSlide.type === 'estadisticas') {
        renderModuleEstadisticas({ duration: activeSlide.duration }, stage);
      } else if (activeSlide.type === 'publicidad') {
        renderModulePublicidad({ duration: activeSlide.duration }, stage);
      } else {
        renderCustomResultSlide(activeSlide, stage);
      }
    } catch (slideErr) {
      console.error('[LotteryCarousel] Error renderizando diapositiva activa:', slideErr);
      if (stage) {
        stage.innerHTML = `
          <div style="display:flex; justify-content:center; align-items:center; height:320px; color:#cbd5e1; font-weight:700;">
            <div style="text-align:center;">
              <div style="font-size:2rem; margin-bottom:8px;">🎰</div>
              <div>Cargando sorteos de ${activeSlide.name || 'Loterías'}...</div>
            </div>
          </div>
        `;
      }
    }
  }

  return activeSlide.duration || 20;
}
window.renderCurrentCarouselSlide = renderCurrentCarouselSlide;

function scheduleNextCarouselTransition(durationSec) {
  if (carouselTransitionTimer) {
    clearTimeout(carouselTransitionTimer);
    carouselTransitionTimer = null;
  }
  if (!isCarouselPaused) {
    carouselTransitionTimer = setTimeout(() => {
      goToNextLotteryModule(false);
    }, durationSec * 1000);
  }
}

function toggleLotteryCarouselPause() {
  isCarouselPaused = !isCarouselPaused;

  const btnPause = document.getElementById('btnHeaderPause') || document.getElementById('btnCintilloPause');
  const textPause = document.getElementById('lblHeaderPauseText') || document.getElementById('lblCintilloPauseText');
  const svgPause = document.getElementById('svgHeaderPause') || document.getElementById('svgCintilloPause');
  const svgPlay = document.getElementById('svgHeaderPlay') || document.getElementById('svgCintilloPlay');

  if (isCarouselPaused) {
    if (btnPause) btnPause.classList.add('is-paused');
    if (svgPause) svgPause.style.display = 'none';
    if (svgPlay) svgPlay.style.display = 'block';
    if (textPause) textPause.textContent = 'Reanudar';

    if (carouselTransitionTimer) {
      clearTimeout(carouselTransitionTimer);
      carouselTransitionTimer = null;
    }
    console.log('[LotteryCarousel] Carrusel en PAUSA.');
  } else {
    if (btnPause) btnPause.classList.remove('is-paused');
    if (svgPause) svgPause.style.display = 'block';
    if (svgPlay) svgPlay.style.display = 'none';
    if (textPause) textPause.textContent = 'Pausar';

    console.log('[LotteryCarousel] Carrusel REANUDADO.');
    const durSec = renderCurrentCarouselSlide();
    scheduleNextCarouselTransition(durSec);
  }
}
window.toggleLotteryCarouselPause = toggleLotteryCarouselPause;

function goToFirstLotteryModule(isManual = true) {
  currentCarouselSlideIdx = 0;
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log('[LotteryCarousel] Navegación: Primera diapositiva');
}
window.goToFirstLotteryModule = goToFirstLotteryModule;

function goToLastLotteryModule(isManual = true) {
  const slides = getActiveCarouselSlides();
  currentCarouselSlideIdx = Math.max(0, slides.length - 1);
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log('[LotteryCarousel] Navegación: Última diapositiva');
}
window.goToLastLotteryModule = goToLastLotteryModule;

function goToPrevLotteryModule(isManual = true) {
  const slides = getActiveCarouselSlides();
  currentCarouselSlideIdx = (currentCarouselSlideIdx - 1 + slides.length) % slides.length;
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Diapositiva anterior (${currentCarouselSlideIdx + 1})`);
}
window.goToPrevLotteryModule = goToPrevLotteryModule;

function goToNextLotteryModule(isManual = true) {
  const slides = getActiveCarouselSlides();
  currentCarouselSlideIdx = (currentCarouselSlideIdx + 1) % slides.length;
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Siguiente diapositiva (${currentCarouselSlideIdx + 1})`);
}
window.goToNextLotteryModule = goToNextLotteryModule;

function goToLotteryModuleByIndex(index, isManual = true) {
  const slides = getActiveCarouselSlides();
  if (!slides || slides.length === 0) return;
  currentCarouselSlideIdx = Math.max(0, Math.min(index, slides.length - 1));
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación directa: Diapositiva ${currentCarouselSlideIdx + 1}`);
}
window.goToLotteryModuleByIndex = goToLotteryModuleByIndex;

function runAutonomousCarouselLoop() {
  const durSec = renderCurrentCarouselSlide();
  scheduleNextCarouselTransition(durSec);
}

// Cargar Datos de Loterías desde API
async function loadLotteryTop10Data(silent = false) {
  try {
    const res = await fetch('/api/lottery/top10');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.games) {
      lotteryTop10 = data.games;
      checkForNewDrawAnnouncements(lotteryTop10);
      updateAdminManualLotteryDropdowns();
    }
  } catch (err) {
    if (!silent) console.error('Error cargando Top 10 loterías:', err);
  }
}

async function loadLotteryStats() {
  try {
    const res = await fetch('/api/lottery/stats');
    if (!res.ok) return;
    lotteryStatsData = await res.json();
    renderLotteryTicker();
  } catch (err) {
    console.warn('[Lottery Stats]', err);
  }
}

function renderLotteryTicker() {
  const track = document.getElementById('tickerContentTrack');
  if (!track || !lotteryStatsData) return;

  const items = lotteryStatsData.ticker || lotteryStatsData.tickerFeed || [];
  if (items.length === 0) return;

  const itemsHtml = items.map(it => {
    let valClass = 'val-winner';
    if (it.type === 'hot') valClass = 'val-hot';
    if (it.type === 'cold') valClass = 'val-cold';
    return `
      <div class="ticker-item">
        <span class="game-tag">${it.gameName || ''}</span>:
        <span style="font-size:0.95rem; opacity:0.85;">${it.badge || it.label || ''}</span>
        <strong class="${valClass}">${it.text || it.value || ''}</strong>
      </div>
    `;
  }).join('');

  track.innerHTML = itemsHtml + itemsHtml;
}

function startLotteryEngineView() {
  startLotteryClock();
  Promise.all([loadLotteryTop10Data(), loadLotteryMasterCatalog()]).then(() => {
    runAutonomousCarouselLoop();
  });
  loadLotteryStats();

  if (!lotteryPollingTimer) {
    lotteryPollingTimer = setInterval(() => {
      loadLotteryTop10Data(true);
      loadLotteryStats();
    }, 40000);
  }
}

function stopLotteryEngineView() {
  if (carouselTransitionTimer) {
    clearTimeout(carouselTransitionTimer);
    carouselTransitionTimer = null;
  }
  if (lotteryPollingTimer) {
    clearInterval(lotteryPollingTimer);
    lotteryPollingTimer = null;
  }
  if (lotteryClockTimer) {
    clearInterval(lotteryClockTimer);
    lotteryClockTimer = null;
  }
  CircusMusicEngine.stop();
}

// ==========================================
// Panel Administrativo de Configuración de Pantallas (Peticiones 2, 4, 5)
// ==========================================
let approvedDevicesCache = [];

async function loadScreenConfigManager() {
  const container = document.getElementById('screenConfigDeviceList');
  const selSource = document.getElementById('selCopyConfigSource');
  if (!container) return;

  try {
    let devUrl = '/api/admin/devices';
    if (currentUser && currentUser.role === 'CLIENT_MANAGER') {
      devUrl += `?clientId=${encodeURIComponent(currentUser.clientId || 'fenix')}`;
    }
    const res = await fetch(devUrl, { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const data = await res.json();
    approvedDevicesCache = data.devices || [];

    // Renderizar Checklist de Pantallas
    if (approvedDevicesCache.length === 0) {
      container.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem;">No hay pantallas autorizadas disponibles.</div>';
    } else {
      container.innerHTML = approvedDevicesCache.map(dev => `
        <label class="screen-check-item">
          <input type="checkbox" class="chk-screen-config" value="${dev.id}" checked>
          <span>📺 <strong>${dev.tvName || dev.id}</strong> <small style="color:#64748b;">(${dev.clientId || 'Fenix'})</small></span>
        </label>
      `).join('');
    }

    // Poblar Selector de Pantalla Origen para Clonar
    if (selSource) {
      selSource.innerHTML = '<option value="">Seleccione pantalla origen...</option>' +
        approvedDevicesCache.map(dev => `<option value="${dev.id}">📺 ${dev.tvName || dev.id} (${dev.clientId || 'Fenix'})</option>`).join('');

      if (!selSource.dataset.hasChangeListener) {
        selSource.dataset.hasChangeListener = 'true';
        selSource.addEventListener('change', () => {
          const devId = selSource.value;
          if (!devId) return;
          const targetDev = approvedDevicesCache.find(d => d.id === devId);
          if (targetDev && targetDev.config) {
            syncScreenConfigFormWithState(targetDev.config);
          }
        });
      }
    }

    // Cargar catálogo maestro antes de inicializar los selectores
    await loadLotteryMasterCatalog();

    // Poblar Selector de Loterías para Módulos 1, 2, 3
    populateModuleLotteryPickers();

    // Sincronizar campos del formulario con la configuración guardada del cliente (Petición 6)
    const cfgToSync = (currentUser && currentUser.config) ? currentUser.config : currentScreenConfig;
    syncScreenConfigFormWithState(cfgToSync);
  } catch (err) {
    console.error('Error cargando gestor de configuración de pantallas:', err);
  }
}

function populateModuleLotteryPickers() {
  const pickerAnim1 = document.getElementById('picker_top5_animalitos');
  const pickerTrip = document.getElementById('picker_top5_triples');
  const pickerAnim2 = document.getElementById('picker_group2_animalitos');

  const allAnimal = lotteryTop10.filter(g => g.type === 'animalitos');
  const allTriples = lotteryTop10.filter(g => g.type === 'triples');

  const selectedAnim1 = currentScreenConfig.modules.top5_animalitos?.games || ['guacharo-activo', 'granjita', 'lotto-activo', 'la-ricachona', 'lotto-rey'];
  const selectedTrip = currentScreenConfig.modules.top5_triples?.games || ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-caracas', 'triple-zamorano'];
  const selectedAnim2 = currentScreenConfig.modules.animalitos_group2?.games || ['selva-plus', 'ruleta-activa', 'granjita-plus'];

  if (pickerAnim1) {
    pickerAnim1.innerHTML = allAnimal.map(g => {
      const gId = g.id || g.gameId;
      const isChk = selectedAnim1.includes(gId);
      return `<label class="picker-lottery-pill"><input type="checkbox" class="chk-lottery-anim1" value="${gId}" ${isChk ? 'checked' : ''}> <span>${g.name}</span></label>`;
    }).join('');
  }

  if (pickerTrip) {
    pickerTrip.innerHTML = allTriples.map(g => {
      const gId = g.id || g.gameId;
      const isChk = selectedTrip.includes(gId);
      return `<label class="picker-lottery-pill"><input type="checkbox" class="chk-lottery-trip" value="${gId}" ${isChk ? 'checked' : ''}> <span>${g.name}</span></label>`;
    }).join('');
  }

  if (pickerAnim2) {
    pickerAnim2.innerHTML = allAnimal.map(g => {
      const gId = g.id || g.gameId;
      const isChk = selectedAnim2.includes(gId);
      return `<label class="picker-lottery-pill"><input type="checkbox" class="chk-lottery-anim2" value="${gId}" ${isChk ? 'checked' : ''}> <span>${g.name}</span></label>`;
    }).join('');
  }
}

// ==========================================
// GESTOR DE CATÁLOGO MAESTRO DE LOTERÍAS (FRONTEND)
// ==========================================
async function loadLotteryMasterCatalog() {
  try {
    const res = await fetch('/api/lottery/catalog');
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.catalog)) {
      lotteryMasterCatalog = data.catalog;
    }
  } catch (err) {
    console.warn('[LotteryCatalog] Error cargando catálogo:', err);
  }
}
window.loadLotteryMasterCatalog = loadLotteryMasterCatalog;

function openLotteryCatalogModal() {
  const modal = document.getElementById('lotteryCatalogModal');
  if (modal) {
    modal.style.display = 'flex';
    renderLotteryCatalogTable();
  }
}
window.openLotteryCatalogModal = openLotteryCatalogModal;

function closeLotteryCatalogModal() {
  const modal = document.getElementById('lotteryCatalogModal');
  if (modal) modal.style.display = 'none';
}
window.closeLotteryCatalogModal = closeLotteryCatalogModal;

function renderLotteryCatalogTable() {
  const tbody = document.getElementById('tblLotteryCatalogBody');
  if (!tbody) return;

  if (lotteryMasterCatalog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:16px;">No hay loterías registradas en el catálogo.</td></tr>';
    return;
  }

  tbody.innerHTML = lotteryMasterCatalog.map(g => `
    <tr>
      <td>
        <span style="display:inline-block; width:18px; height:18px; border-radius:4px; background:${g.color || '#10b981'}; vertical-align:middle; border:1px solid rgba(255,255,255,0.3);"></span>
      </td>
      <td>
        ${g.logoUrl ? `<img src="${g.logoUrl}" style="width:24px; height:24px; object-fit:contain; border-radius:50%; background:#fff;" onerror="this.style.display='none'">` : (g.icon || '🎰')}
      </td>
      <td>
        <strong>${g.name}</strong>
        ${g.shortName ? `<small style="color:#94a3b8; margin-left:6px;">(${g.shortName})</small>` : ''}
      </td>
      <td>
        <span style="background:${g.type === 'animalitos' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}; color:${g.type === 'animalitos' ? '#34d399' : '#60a5fa'}; padding:2px 8px; border-radius:10px; font-weight:800; font-size:0.75rem;">
          ${g.type === 'animalitos' ? '🐾 Animalitos' : '🎰 Triples'}
        </span>
      </td>
      <td style="font-size:0.78rem; color:#94a3b8;">
        ${(g.hours && g.hours.length > 0) ? `${g.hours.length} sorteos diarios (${g.hours[0]} - ${g.hours[g.hours.length - 1]})` : 'Horario continuo'}
      </td>
      <td style="text-align:center;">
        <button type="button" onclick="window.handleDeleteCatalogLottery('${g.id}')" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#fca5a5; font-size:0.75rem; font-weight:700; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Eliminar del catálogo">
          🗑️ Eliminar
        </button>
      </td>
    </tr>
  `).join('');
}
window.renderLotteryCatalogTable = renderLotteryCatalogTable;

async function handleSaveNewCatalogLottery() {
  const txtName = document.getElementById('txtNewLotteryName');
  const txtShort = document.getElementById('txtNewLotteryShortName');
  const selType = document.getElementById('selNewLotteryType');
  const colColor = document.getElementById('colNewLotteryColor');
  const txtLogo = document.getElementById('txtNewLotteryLogoUrl');

  const name = txtName?.value.trim();
  if (!name) {
    alert('Ingrese el nombre de la lotería.');
    return;
  }

  const payload = {
    name,
    shortName: txtShort?.value.trim() || name,
    type: selType?.value || 'animalitos',
    color: colColor?.value || '#10b981',
    logoUrl: txtLogo?.value.trim() || '',
    icon: (selType?.value === 'triples') ? '🎰' : '🐾'
  };

  try {
    const res = await fetch('/api/lottery/catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`¡Lotería "${name}" agregada exitosamente!`);
      if (txtName) txtName.value = '';
      if (txtShort) txtShort.value = '';
      if (txtLogo) txtLogo.value = '';
      await loadLotteryMasterCatalog();
      renderLotteryCatalogTable();
      renderResultadosSlidesEditor();
    } else {
      alert(data.error || 'Error registrando la lotería.');
    }
  } catch (err) {
    alert('Error de conexión al guardar lotería.');
  }
}
window.handleSaveNewCatalogLottery = handleSaveNewCatalogLottery;

async function handleDeleteCatalogLottery(id) {
  if (!confirm(`¿Está seguro de eliminar la lotería "${id}" del catálogo maestro?`)) return;

  try {
    const res = await fetch(`/api/lottery/catalog/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadLotteryMasterCatalog();
      renderLotteryCatalogTable();
      renderResultadosSlidesEditor();
    } else {
      alert(data.error || 'Error al eliminar lotería.');
    }
  } catch (err) {
    alert('Error de conexión al eliminar lotería.');
  }
}
window.handleDeleteCatalogLottery = handleDeleteCatalogLottery;

// ==========================================
// GESTOR DE 3 SECCIONES & DIAPOSITIVAS (CONFIGURACIÓN)
// ==========================================
function switchLotteryConfigSection(secKey) {
  // 1. Guardar cambios en caliente del DOM actual antes de alternar pestaña
  saveResultadosSlidesFromDOM();
  saveEstadisticasSlidesFromDOM();
  savePublicidadSlidesFromDOM();

  const tabs = document.querySelectorAll('.sec-subtab-btn');
  tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-sec') === secKey));

  const pRes = document.getElementById('subpanelSecResultados');
  const pStat = document.getElementById('subpanelSecEstadisticas');
  const pPub = document.getElementById('subpanelSecPublicidad');

  if (pRes) pRes.style.display = (secKey === 'resultados') ? 'block' : 'none';
  if (pStat) pStat.style.display = (secKey === 'estadisticas') ? 'block' : 'none';
  if (pPub) pPub.style.display = (secKey === 'publicidad') ? 'block' : 'none';
}
window.switchLotteryConfigSection = switchLotteryConfigSection;

/**
 * Desplaza suavemente el scroll hasta la tarjeta de la diapositiva solicitada
 * y le aplica un brillo temporal para que el usuario la identifique al instante.
 */
function scrollToSlideEditor(secKey, idx) {
  let containerId = 'slidesResultadosContainer';
  if (secKey === 'estadisticas') containerId = 'slidesEstadisticasContainer';
  if (secKey === 'publicidad') containerId = 'slidesPublicidadContainer';

  const container = document.getElementById(containerId);
  if (!container) return;

  const cards = container.querySelectorAll('.slide-editor-card');
  const targetCard = cards[idx];
  if (targetCard) {
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetCard.classList.remove('slide-card-new-highlight');
    void targetCard.offsetWidth; // reiniciar animación css
    targetCard.classList.add('slide-card-new-highlight');
    setTimeout(() => {
      targetCard.classList.remove('slide-card-new-highlight');
    }, 2200);

    const nameInput = targetCard.querySelector('.slide-name-input');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }
}
window.scrollToSlideEditor = scrollToSlideEditor;

function ensureLotterySectionsStructure() {
  if (!currentScreenConfig.lotterySections) {
    currentScreenConfig.lotterySections = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG.lotterySections));
  }
  if (!currentScreenConfig.lotterySections.resultados) {
    currentScreenConfig.lotterySections.resultados = { enabled: true, slides: [] };
  }
  if (!currentScreenConfig.lotterySections.estadisticas) {
    currentScreenConfig.lotterySections.estadisticas = { enabled: true, slides: [] };
  }
  if (!currentScreenConfig.lotterySections.publicidad) {
    currentScreenConfig.lotterySections.publicidad = { enabled: true, slides: [] };
  }
}

function renderResultadosSlidesEditor() {
  ensureLotterySectionsStructure();
  const container = document.getElementById('slidesResultadosContainer');
  const countLabel = document.getElementById('lblResultadosSlideCount');
  const quickNav = document.getElementById('quickNavResultados');
  if (!container) return;

  const slides = currentScreenConfig.lotterySections.resultados.slides;
  if (countLabel) {
    countLabel.textContent = `(${slides.length} configuradas / máx 15)`;
  }

  // Renderizar píldoras de navegación rápida en la cabecera sticky
  if (quickNav) {
    if (slides.length > 0) {
      quickNav.innerHTML = `
        <span class="slides-quick-nav-label">Ir a:</span>
        ${slides.map((s, i) => `
          <button type="button" class="btn-quick-slide-jump" onclick="window.scrollToSlideEditor('resultados', ${i})" title="${s.name || `Diapositiva #${i + 1}`}">
            #${i + 1}
          </button>
        `).join('')}
      `;
    } else {
      quickNav.innerHTML = '';
    }
  }

  if (slides.length === 0) {
    container.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem; padding:12px; text-align:center;">No hay diapositivas de resultados configuradas. Haga clic en "+ Agregar Diapositiva".</div>';
    return;
  }

  const catalog = (lotteryMasterCatalog.length > 0) ? lotteryMasterCatalog : (lotteryTop10.length > 0 ? lotteryTop10 : [
    { id: 'la-granjita', name: 'LA GRANJITA', type: 'animalitos' },
    { id: 'guacharo-activo', name: 'GUACHARO ACTIVO', type: 'animalitos' },
    { id: 'lotto-activo', name: 'LOTTO ACTIVO', type: 'animalitos' },
    { id: 'guacharito-millonario', name: 'GUACHARITO MILLONARIO', type: 'animalitos' },
    { id: 'chance-animal', name: 'CHANCE ANIMAL', type: 'animalitos' },
    { id: 'triple-zulia', name: 'TRIPLE ZULIA', type: 'triples' },
    { id: 'triple-tachira', name: 'TRIPLE TÁCHIRA', type: 'triples' },
    { id: 'triple-chance', name: 'TRIPLE CHANCE', type: 'triples' },
    { id: 'triple-chance-1', name: 'TRIPLE CHANCE (9 AM - 2 PM)', type: 'triples' },
    { id: 'triple-chance-2', name: 'TRIPLE CHANCE (3 PM - 7 PM)', type: 'triples' },
    { id: 'triple-caracas', name: 'TRIPLE CARACAS', type: 'triples' },
    { id: 'triple-zamorano', name: 'TRIPLE ZAMORANO', type: 'triples' },
    { id: 'triple-caliente', name: 'TRIPLE CALIENTE', type: 'triples' }
  ]);

  const cardsHtml = slides.map((slide, sIdx) => {
    const lotCount = Math.min(5, Math.max(1, parseInt(slide.lotteryCount) || 5));
    slide.lotteryCount = lotCount;
    if (!Array.isArray(slide.lotteries)) slide.lotteries = [];

    const countBtnsHtml = [1, 2, 3, 4, 5].map(n => `
      <button type="button" class="btn-count-lottery ${n === lotCount ? 'active' : ''}" onclick="window.setSlideLotteryCount('resultados', ${sIdx}, ${n})">
        ${n} ${n === 1 ? 'Lotería' : 'Loterías'}
      </button>
    `).join('');

    let slotsHtml = '';
    for (let slotIdx = 0; slotIdx < lotCount; slotIdx++) {
      const selectedGameId = slide.lotteries[slotIdx] || catalog[slotIdx % catalog.length]?.id || '';
      if (!slide.lotteries[slotIdx]) slide.lotteries[slotIdx] = selectedGameId;

      const optionsHtml = catalog.map(g => `
        <option value="${g.id}" ${g.id === selectedGameId ? 'selected' : ''}>
          ${g.type === 'animalitos' ? '🐾' : '🎰'} ${g.name}
        </option>
      `).join('');

      slotsHtml += `
        <div class="slot-item-box">
          <span class="slot-label">Columna ${slotIdx + 1}:</span>
          <select class="slot-select" onchange="window.setSlideLotterySlot('resultados', ${sIdx}, ${slotIdx}, this.value)">
            ${optionsHtml}
          </select>
        </div>
      `;
    }

    return `
      <div class="slide-editor-card" id="slideCard_res_${sIdx}">
        <div class="slide-editor-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <label class="switch-label" style="margin:0;">
              <input type="checkbox" ${slide.enabled !== false ? 'checked' : ''} onchange="window.toggleSlideEnabled('resultados', ${sIdx}, this.checked)">
            </label>
            <span class="slide-number-badge">Diapositiva #${sIdx + 1}</span>
          </div>

          <div class="slide-name-input-group">
            <input type="text" class="slide-name-input" value="${slide.name || ''}" placeholder="Nombre de la diapositiva (ej: Animalitos Líderes)" oninput="window.updateSlideName('resultados', ${sIdx}, this.value)">
            <button type="button" class="btn-clear-name" onclick="window.clearSlideName('resultados', ${sIdx})" title="Limpiar / Quitar nombre">Limpiar</button>
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            <div class="slide-duration-box">
              <span>Duración:</span>
              <input type="number" class="slide-duration-input" value="${slide.duration || 20}" min="5" max="180" onchange="window.updateSlideDuration('resultados', ${sIdx}, this.value)">
              <span>seg</span>
            </div>
            <button type="button" class="btn-delete-slide" onclick="window.deleteSlide('resultados', ${sIdx})" title="Eliminar diapositiva">
              🗑️
            </button>
          </div>
        </div>

        <div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
            <span style="font-size:0.82rem; font-weight:700; color:#94a3b8;">¿Cuántas loterías mostrar en esta diapositiva?</span>
            <div class="lottery-count-selector-group">
              ${countBtnsHtml}
            </div>
          </div>
          <div class="slide-slots-grid">
            ${slotsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Botón siempre visible al final de la lista para agregar diapositiva #4, #5, etc.
  const addBtnHtml = (slides.length < 15) ? `
    <div style="margin-top:16px; margin-bottom:12px; text-align:center;">
      <button type="button" id="btnBottomAddResultSlide" onclick="window.addNewResultSlide()" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-size:0.95rem; padding:10px 24px; font-weight:800; border-radius:8px; border:none; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.35); display:inline-flex; align-items:center; gap:8px;">
        ➕ AGREGAR NUEVA DIAPOSITIVA #${slides.length + 1} (Hasta 15)
      </button>
    </div>
  ` : `
    <div style="margin-top:16px; text-align:center; color:#94a3b8; font-size:0.88rem; font-weight:700;">
      ✅ Límite máximo de 15 diapositivas alcanzado para la sección Resultados.
    </div>
  `;

  container.innerHTML = cardsHtml + addBtnHtml;
}
window.renderResultadosSlidesEditor = renderResultadosSlidesEditor;

function renderEstadisticasSlidesEditor() {
  ensureLotterySectionsStructure();
  const container = document.getElementById('slidesEstadisticasContainer');
  const countLabel = document.getElementById('lblEstadisticasSlideCount');
  const quickNav = document.getElementById('quickNavEstadisticas');
  if (!container) return;

  const slides = currentScreenConfig.lotterySections.estadisticas.slides;
  if (countLabel) countLabel.textContent = `(${slides.length} configuradas / máx 15)`;

  // Barra de navegación rápida
  if (quickNav) {
    if (slides.length > 0) {
      quickNav.innerHTML = `
        <span class="slides-quick-nav-label">Ir a:</span>
        ${slides.map((s, i) => `
          <button type="button" class="btn-quick-slide-jump" onclick="window.scrollToSlideEditor('estadisticas', ${i})" title="${s.name || `Estadísticas #${i + 1}`}">
            #${i + 1}
          </button>
        `).join('')}
      `;
    } else {
      quickNav.innerHTML = '';
    }
  }

  if (slides.length === 0) {
    container.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem; padding:12px; text-align:center;">No hay diapositivas de estadísticas configuradas. Haga clic en "+ Agregar Diapositiva".</div>';
    return;
  }

  const cardsHtml = slides.map((s, idx) => `
    <div class="slide-editor-card" id="slideCard_stat_${idx}">
      <div class="slide-editor-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <label class="switch-label" style="margin:0;">
            <input type="checkbox" ${s.enabled !== false ? 'checked' : ''} onchange="window.toggleSlideEnabled('estadisticas', ${idx}, this.checked)">
          </label>
          <span class="slide-number-badge">Estadísticas #${idx + 1}</span>
        </div>
        <div class="slide-name-input-group">
          <input type="text" class="slide-name-input" value="${s.name || ''}" placeholder="Nombre de la diapositiva" oninput="window.updateSlideName('estadisticas', ${idx}, this.value)">
          <button type="button" class="btn-clear-name" onclick="window.clearSlideName('estadisticas', ${idx})">Limpiar</button>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="slide-duration-box">
            <span>Duración:</span>
            <input type="number" class="slide-duration-input" value="${s.duration || 20}" min="5" max="180" onchange="window.updateSlideDuration('estadisticas', ${idx}, this.value)">
            <span>seg</span>
          </div>
          <button type="button" class="btn-delete-slide" onclick="window.deleteSlide('estadisticas', ${idx})">🗑️</button>
        </div>
      </div>
      <p style="margin:0; font-size:0.85rem; color:#94a3b8;">Despliega la radiografía de 30 días de animalitos (más calientes, fríos / por reventar y pronósticos recomendados).</p>
    </div>
  `).join('');

  const addBtnStatsHtml = (slides.length < 15) ? `
    <div style="margin-top:16px; margin-bottom:12px; text-align:center;">
      <button type="button" id="btnBottomAddStatsSlide" onclick="window.addNewStatsSlide()" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-size:0.95rem; padding:10px 24px; font-weight:800; border-radius:8px; border:none; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.35); display:inline-flex; align-items:center; gap:8px;">
        ➕ AGREGAR NUEVA DIAPOSITIVA #${slides.length + 1} (Hasta 15)
      </button>
    </div>
  ` : `
    <div style="margin-top:16px; text-align:center; color:#94a3b8; font-size:0.88rem; font-weight:700;">
      ✅ Límite máximo de 15 diapositivas alcanzado para la sección Estadísticas.
    </div>
  `;

  container.innerHTML = cardsHtml + addBtnStatsHtml;
}
window.renderEstadisticasSlidesEditor = renderEstadisticasSlidesEditor;

function renderPublicidadSlidesEditor() {
  ensureLotterySectionsStructure();
  const container = document.getElementById('slidesPublicidadContainer');
  const countLabel = document.getElementById('lblPublicidadSlideCount');
  const quickNav = document.getElementById('quickNavPublicidad');
  if (!container) return;

  const slides = currentScreenConfig.lotterySections.publicidad.slides;
  if (countLabel) countLabel.textContent = `(${slides.length} configuradas / máx 15)`;

  // Barra de navegación rápida
  if (quickNav) {
    if (slides.length > 0) {
      quickNav.innerHTML = `
        <span class="slides-quick-nav-label">Ir a:</span>
        ${slides.map((s, i) => `
          <button type="button" class="btn-quick-slide-jump" onclick="window.scrollToSlideEditor('publicidad', ${i})" title="${s.name || `Publicidad #${i + 1}`}">
            #${i + 1}
          </button>
        `).join('')}
      `;
    } else {
      quickNav.innerHTML = '';
    }
  }

  if (slides.length === 0) {
    container.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem; padding:12px; text-align:center;">No hay diapositivas de publicidad configuradas. Haga clic en "+ Agregar Diapositiva".</div>';
    return;
  }

  const cardsHtml = slides.map((s, idx) => `
    <div class="slide-editor-card" id="slideCard_pub_${idx}">
      <div class="slide-editor-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <label class="switch-label" style="margin:0;">
            <input type="checkbox" ${s.enabled !== false ? 'checked' : ''} onchange="window.toggleSlideEnabled('publicidad', ${idx}, this.checked)">
          </label>
          <span class="slide-number-badge">Publicidad #${idx + 1}</span>
        </div>
        <div class="slide-name-input-group">
          <input type="text" class="slide-name-input" value="${s.name || ''}" placeholder="Nombre de la diapositiva" oninput="window.updateSlideName('publicidad', ${idx}, this.value)">
          <button type="button" class="btn-clear-name" onclick="window.clearSlideName('publicidad', ${idx})">Limpiar</button>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="slide-duration-box">
            <span>Duración:</span>
            <input type="number" class="slide-duration-input" value="${s.duration || 15}" min="5" max="180" onchange="window.updateSlideDuration('publicidad', ${idx}, this.value)">
            <span>seg</span>
          </div>
          <button type="button" class="btn-delete-slide" onclick="window.deleteSlide('publicidad', ${idx})">🗑️</button>
        </div>
      </div>
      <p style="margin:0; font-size:0.85rem; color:#94a3b8;">Diapositiva promocional con logos oficiales, llamados a la acción en taquilla y respaldo oficial de la agencia.</p>
    </div>
  `).join('');

  const addBtnPubHtml = (slides.length < 15) ? `
    <div style="margin-top:16px; margin-bottom:12px; text-align:center;">
      <button type="button" id="btnBottomAddPubSlide" onclick="window.addNewPubSlide()" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-size:0.95rem; padding:10px 24px; font-weight:800; border-radius:8px; border:none; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.35); display:inline-flex; align-items:center; gap:8px;">
        ➕ AGREGAR NUEVA DIAPOSITIVA #${slides.length + 1} (Hasta 15)
      </button>
    </div>
  ` : `
    <div style="margin-top:16px; text-align:center; color:#94a3b8; font-size:0.88rem; font-weight:700;">
      ✅ Límite máximo de 15 diapositivas alcanzado para la sección Publicidad.
    </div>
  `;

  container.innerHTML = cardsHtml + addBtnPubHtml;
}
window.renderPublicidadSlidesEditor = renderPublicidadSlidesEditor;

// Capturar valores actuales del DOM antes de mutar arrays de diapositivas
function saveResultadosSlidesFromDOM() {
  if (!currentScreenConfig.lotterySections?.resultados?.slides) return;
  const container = document.getElementById('slidesResultadosContainer');
  if (!container) return;
  const cards = container.querySelectorAll('.slide-editor-card');
  cards.forEach((card, idx) => {
    const slide = currentScreenConfig.lotterySections.resultados.slides[idx];
    if (!slide) return;
    const chkEnabled = card.querySelector('input[type="checkbox"]');
    if (chkEnabled) slide.enabled = chkEnabled.checked;
    const txtName = card.querySelector('.slide-name-input');
    if (txtName) slide.name = txtName.value.trim();
    const numDur = card.querySelector('.slide-duration-input');
    if (numDur) slide.duration = parseInt(numDur.value) || 20;
    const selects = card.querySelectorAll('.slot-select');
    if (selects.length > 0) {
      slide.lotteries = Array.from(selects).map(s => s.value);
      slide.lotteryCount = selects.length;
    }
  });
}

function saveEstadisticasSlidesFromDOM() {
  if (!currentScreenConfig.lotterySections?.estadisticas?.slides) return;
  const container = document.getElementById('slidesEstadisticasContainer');
  if (!container) return;
  const cards = container.querySelectorAll('.slide-editor-card');
  cards.forEach((card, idx) => {
    const slide = currentScreenConfig.lotterySections.estadisticas.slides[idx];
    if (!slide) return;
    const chkEnabled = card.querySelector('input[type="checkbox"]');
    if (chkEnabled) slide.enabled = chkEnabled.checked;
    const txtName = card.querySelector('.slide-name-input');
    if (txtName) slide.name = txtName.value.trim();
    const numDur = card.querySelector('.slide-duration-input');
    if (numDur) slide.duration = parseInt(numDur.value) || 20;
  });
}

function savePublicidadSlidesFromDOM() {
  if (!currentScreenConfig.lotterySections?.publicidad?.slides) return;
  const container = document.getElementById('slidesPublicidadContainer');
  if (!container) return;
  const cards = container.querySelectorAll('.slide-editor-card');
  cards.forEach((card, idx) => {
    const slide = currentScreenConfig.lotterySections.publicidad.slides[idx];
    if (!slide) return;
    const chkEnabled = card.querySelector('input[type="checkbox"]');
    if (chkEnabled) slide.enabled = chkEnabled.checked;
    const txtName = card.querySelector('.slide-name-input');
    if (txtName) slide.name = txtName.value.trim();
    const numDur = card.querySelector('.slide-duration-input');
    if (numDur) slide.duration = parseInt(numDur.value) || 15;
  });
}

function addNewResultSlide() {
  ensureLotterySectionsStructure();
  saveResultadosSlidesFromDOM();
  const slides = currentScreenConfig.lotterySections.resultados.slides;
  if (slides.length >= 15) {
    alert('Ha alcanzado el límite máximo de 15 diapositivas para la sección Resultados.');
    return;
  }
  const catalog = (lotteryMasterCatalog.length > 0) ? lotteryMasterCatalog : (lotteryTop10.length > 0 ? lotteryTop10 : []);
  const initialGames = catalog.slice(0, 5).map(g => g.id);

  slides.push({
    id: `slide_res_${Date.now()}`,
    name: `Diapositiva ${slides.length + 1}`,
    enabled: true,
    duration: 20,
    lotteryCount: 5,
    lotteries: initialGames.length > 0 ? initialGames : ['la-granjita', 'guacharo-activo', 'lotto-activo', 'guacharito-millonario', 'chance-animal']
  });

  const newIdx = slides.length - 1;
  renderResultadosSlidesEditor();
  setTimeout(() => {
    window.scrollToSlideEditor('resultados', newIdx);
  }, 60);
}
window.addNewResultSlide = addNewResultSlide;

function addNewStatsSlide() {
  ensureLotterySectionsStructure();
  saveEstadisticasSlidesFromDOM();
  const slides = currentScreenConfig.lotterySections.estadisticas.slides;
  if (slides.length >= 15) {
    alert('Ha alcanzado el límite máximo de 15 diapositivas para la sección Estadísticas.');
    return;
  }
  slides.push({
    id: `slide_stat_${Date.now()}`,
    name: `Radiografía Estadística #${slides.length + 1}`,
    enabled: true,
    duration: 20
  });

  const newIdx = slides.length - 1;
  renderEstadisticasSlidesEditor();
  setTimeout(() => {
    window.scrollToSlideEditor('estadisticas', newIdx);
  }, 60);
}
window.addNewStatsSlide = addNewStatsSlide;

function addNewPubSlide() {
  ensureLotterySectionsStructure();
  savePublicidadSlidesFromDOM();
  const slides = currentScreenConfig.lotterySections.publicidad.slides;
  if (slides.length >= 15) {
    alert('Ha alcanzado el límite máximo de 15 diapositivas para la sección Publicidad.');
    return;
  }
  slides.push({
    id: `slide_pub_${Date.now()}`,
    name: `Publicidad Oficial #${slides.length + 1}`,
    enabled: true,
    duration: 15
  });

  const newIdx = slides.length - 1;
  renderPublicidadSlidesEditor();
  setTimeout(() => {
    window.scrollToSlideEditor('publicidad', newIdx);
  }, 60);
}
window.addNewPubSlide = addNewPubSlide;

function deleteSlide(secKey, idx) {
  ensureLotterySectionsStructure();
  if (secKey === 'resultados') saveResultadosSlidesFromDOM();
  if (secKey === 'estadisticas') saveEstadisticasSlidesFromDOM();
  if (secKey === 'publicidad') savePublicidadSlidesFromDOM();

  const slides = currentScreenConfig.lotterySections[secKey].slides;
  if (slides.length <= 1) {
    if (!confirm('Esta es la única diapositiva de esta sección. ¿Desea eliminarla de todos modos?')) return;
  }
  slides.splice(idx, 1);
  if (secKey === 'resultados') renderResultadosSlidesEditor();
  if (secKey === 'estadisticas') renderEstadisticasSlidesEditor();
  if (secKey === 'publicidad') renderPublicidadSlidesEditor();
}
window.deleteSlide = deleteSlide;

function updateSlideName(secKey, idx, val) {
  ensureLotterySectionsStructure();
  const slide = currentScreenConfig.lotterySections[secKey].slides[idx];
  if (slide) slide.name = val;
}
window.updateSlideName = updateSlideName;

function clearSlideName(secKey, idx) {
  ensureLotterySectionsStructure();
  if (secKey === 'resultados') saveResultadosSlidesFromDOM();
  if (secKey === 'estadisticas') saveEstadisticasSlidesFromDOM();
  if (secKey === 'publicidad') savePublicidadSlidesFromDOM();

  const slide = currentScreenConfig.lotterySections[secKey].slides[idx];
  if (slide) slide.name = '';
  if (secKey === 'resultados') renderResultadosSlidesEditor();
  if (secKey === 'estadisticas') renderEstadisticasSlidesEditor();
  if (secKey === 'publicidad') renderPublicidadSlidesEditor();
}
window.clearSlideName = clearSlideName;

function updateSlideDuration(secKey, idx, val) {
  ensureLotterySectionsStructure();
  const slide = currentScreenConfig.lotterySections[secKey].slides[idx];
  if (slide) slide.duration = Math.max(5, parseInt(val) || 20);
}
window.updateSlideDuration = updateSlideDuration;

function toggleSlideEnabled(secKey, idx, isChecked) {
  ensureLotterySectionsStructure();
  const slide = currentScreenConfig.lotterySections[secKey].slides[idx];
  if (slide) slide.enabled = isChecked;
}
window.toggleSlideEnabled = toggleSlideEnabled;

function setSlideLotteryCount(secKey, idx, count) {
  ensureLotterySectionsStructure();
  saveResultadosSlidesFromDOM();
  const slide = currentScreenConfig.lotterySections[secKey].slides[idx];
  if (slide) {
    slide.lotteryCount = count;
    renderResultadosSlidesEditor();
  }
}
window.setSlideLotteryCount = setSlideLotteryCount;

function setSlideLotterySlot(secKey, sIdx, slotIdx, gameId) {
  ensureLotterySectionsStructure();
  const slide = currentScreenConfig.lotterySections[secKey].slides[sIdx];
  if (slide) {
    if (!Array.isArray(slide.lotteries)) slide.lotteries = [];
    slide.lotteries[slotIdx] = gameId;
  }
}
window.setSlideLotterySlot = setSlideLotterySlot;

function syncScreenConfigFormWithState(cfg) {
  if (!cfg) return;

  // Sincronizar secciones y módulos en el estado global activo
  if (cfg.lotterySections) {
    currentScreenConfig.lotterySections = JSON.parse(JSON.stringify(cfg.lotterySections));
  }
  if (cfg.modules) {
    currentScreenConfig.modules = JSON.parse(JSON.stringify(cfg.modules));
  }
  if (cfg.themeMode) currentScreenConfig.themeMode = cfg.themeMode;
  if (cfg.colorStyle || cfg.colorScheme) currentScreenConfig.colorStyle = cfg.colorStyle || cfg.colorScheme;
  if (cfg.defaultService) currentScreenConfig.defaultService = cfg.defaultService;
  if (cfg.tickerActive !== undefined) currentScreenConfig.tickerActive = Boolean(cfg.tickerActive);
  if (cfg.tickerSpeed) currentScreenConfig.tickerSpeed = parseInt(cfg.tickerSpeed) || 160;

  // Modo de Tema
  const radTheme = document.querySelectorAll('input[name="cfgThemeMode"]');
  radTheme.forEach(r => { r.checked = (r.value === cfg.themeMode); });

  // Estilo de Color
  const selColor = document.getElementById('cfgColorScheme');
  if (selColor) selColor.value = cfg.colorStyle || 'emerald';

  // Servicio por defecto
  const selService = document.getElementById('cfgDefaultService');
  if (selService) selService.value = cfg.defaultService || 'loteria';

  // Cintillo
  const chkTicker = document.getElementById('cfgTickerActive');
  const rngTicker = document.getElementById('cfgTickerSpeed');
  const lblTicker = document.getElementById('lblCfgTickerSpeed');
  if (chkTicker) chkTicker.checked = cfg.tickerActive !== false;
  if (rngTicker) rngTicker.value = cfg.tickerSpeed || 160;
  if (lblTicker) lblTicker.textContent = `${cfg.tickerSpeed || 160}s`;

  // Audio y Voz
  const chkVoice = document.getElementById('cfgVoiceEnabled');
  const rngVoice = document.getElementById('cfgVoiceVolume');
  const lblVoice = document.getElementById('lblCfgVoiceVol');
  const chkAnimalSfx = document.getElementById('cfgAnimalSfx');
  if (chkVoice) chkVoice.checked = cfg.voiceEnabled !== false;
  if (rngVoice) rngVoice.value = Math.round((cfg.voiceVolume || 0.9) * 100);
  if (lblVoice) lblVoice.textContent = `${Math.round((cfg.voiceVolume || 0.9) * 100)}%`;
  if (chkAnimalSfx) chkAnimalSfx.checked = cfg.animalSfxEnabled !== false;

  // Música de Fondo
  const chkMusic = document.getElementById('cfgBgMusicEnabled');
  const selTrack = document.getElementById('cfgBgMusicTrack');
  const rngMusicVol = document.getElementById('cfgBgMusicVolume');
  const lblMusicVol = document.getElementById('lblCfgMusicVol');
  const grpCustom = document.getElementById('groupCustomMusicUrl');
  const txtCustom = document.getElementById('cfgBgMusicCustomUrl');
  const isMusicActive = (cfg.bgMusicEnabled !== undefined ? cfg.bgMusicEnabled : cfg.circusMusicEnabled) === true;
  if (chkMusic) chkMusic.checked = isMusicActive;
  if (selTrack) selTrack.value = cfg.circusMusicTrack || cfg.bgMusicTrack || 'circus_waltz';
  const trackVol = cfg.circusMusicVolume !== undefined ? cfg.circusMusicVolume : cfg.bgMusicVolume;
  if (rngMusicVol) rngMusicVol.value = Math.round((trackVol || 0.25) * 100);
  if (lblMusicVol) lblMusicVol.textContent = `${Math.round((trackVol || 0.25) * 100)}%`;
  if (txtCustom) txtCustom.value = cfg.customMusicUrl || cfg.bgMusicCustomUrl || '';
  if (grpCustom) grpCustom.style.display = ((cfg.circusMusicTrack || cfg.bgMusicTrack) === 'custom') ? 'block' : 'none';

  // Renderizar Editores de Diapositivas de las 3 Secciones
  renderResultadosSlidesEditor();
  renderEstadisticasSlidesEditor();
  renderPublicidadSlidesEditor();

  // Duraciones y estados de los 7 módulos (retrocompatibilidad)
  const modules = cfg.modules || {};
  const modMap = {
    top5_animalitos: { chk: 'modEnabled_top5_animalitos', dur: 'modDuration_top5_animalitos' },
    top5_triples: { chk: 'modEnabled_top5_triples', dur: 'modDuration_top5_triples' },
    animalitos_group2: { chk: 'modEnabled_group2_animalitos', dur: 'modDuration_group2_animalitos' },
    pizarra_1000: { chk: 'modEnabled_pizarra_1000', dur: 'modDuration_pizarra_1000' },
    estadisticas_30d: { chk: 'modEnabled_estadisticas', dur: 'modDuration_estadisticas' },
    publicidad_loteria: { chk: 'modEnabled_publicidad', dur: 'modDuration_publicidad' },
    ultimos_5_sorteos: { chk: 'modEnabled_ultimos_5_sorteos', dur: 'modDuration_ultimos_5_sorteos' }
  };

  for (const [key, ids] of Object.entries(modMap)) {
    const mod = modules[key] || {};
    const elChk = document.getElementById(ids.chk);
    const elDur = document.getElementById(ids.dur);
    if (elChk) elChk.checked = mod.enabled !== false;
    if (elDur) elDur.value = mod.duration || 20;
  }
}

// Bindeo de Eventos para el Formulario de Configuración
function setupScreenConfigEventListeners() {
  // Botón Abrir Catálogo Máster de Loterías
  const btnOpenCat = document.getElementById('btnOpenLotteryCatalogModal');
  if (btnOpenCat) {
    btnOpenCat.addEventListener('click', () => {
      openLotteryCatalogModal();
    });
  }

  // Seleccionar / Deseleccionar todas las pantallas
  const btnSelAll = document.getElementById('btnSelectAllScreens');
  const btnDeselAll = document.getElementById('btnDeselectAllScreens');
  if (btnSelAll) {
    btnSelAll.addEventListener('click', () => {
      document.querySelectorAll('.chk-screen-config').forEach(c => { c.checked = true; });
    });
  }
  if (btnDeselAll) {
    btnDeselAll.addEventListener('click', () => {
      document.querySelectorAll('.chk-screen-config').forEach(c => { c.checked = false; });
    });
  }

  // Deslizador de Velocidad del Cintillo
  const rngTicker = document.getElementById('cfgTickerSpeed');
  const lblTicker = document.getElementById('lblCfgTickerSpeed');
  if (rngTicker && lblTicker) {
    rngTicker.addEventListener('input', () => {
      lblTicker.textContent = `${rngTicker.value}s`;
    });
  }

  // Deslizador de Volumen de Voz
  const rngVoice = document.getElementById('cfgVoiceVolume');
  const lblVoice = document.getElementById('lblCfgVoiceVol');
  if (rngVoice && lblVoice) {
    rngVoice.addEventListener('input', () => {
      lblVoice.textContent = `${rngVoice.value}%`;
    });
  }

  // Selector de Pista de Música de Circo
  const selTrack = document.getElementById('cfgBgMusicTrack');
  const grpCustom = document.getElementById('groupCustomMusicUrl');
  if (selTrack && grpCustom) {
    selTrack.addEventListener('change', () => {
      grpCustom.style.display = (selTrack.value === 'custom') ? 'block' : 'none';
    });
  }

  // Deslizador de Volumen de Música
  const rngMusicVol = document.getElementById('cfgBgMusicVolume');
  const lblMusicVol = document.getElementById('lblCfgMusicVol');
  if (rngMusicVol && lblMusicVol) {
    rngMusicVol.addEventListener('input', () => {
      lblMusicVol.textContent = `${rngMusicVol.value}%`;
    });
  }

  // Carga de archivo personalizado de música
  const fileMusic = document.getElementById('fileCustomMusic');
  const txtMusicUrl = document.getElementById('cfgBgMusicCustomUrl');
  if (fileMusic && txtMusicUrl) {
    fileMusic.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        txtMusicUrl.value = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Ejecutar Clonación de Configuración entre Pantallas Existentes
  const btnExecuteClone = document.getElementById('btnExecuteCopyConfig');
  if (btnExecuteClone) {
    btnExecuteClone.addEventListener('click', async () => {
      const sourceDeviceId = document.getElementById('selCopyConfigSource')?.value;
      const checkedBoxes = Array.from(document.querySelectorAll('.chk-screen-config:checked')).map(c => c.value);
      const msg = document.getElementById('screenConfigMsg');

      if (!sourceDeviceId) {
        alert('Seleccione la pantalla origen de la cual desea copiar la configuración.');
        return;
      }
      if (checkedBoxes.length === 0) {
        alert('Seleccione al menos una pantalla destino en el recuadro superior.');
        return;
      }

      try {
        const res = await fetch('/api/client/devices/clone-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ sourceDeviceId, targetDeviceIds: checkedBoxes })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (msg) {
            msg.style.color = '#34d399';
            msg.textContent = `¡${data.message}!`;
          }
          if (checkedBoxes.includes(currentDeviceId)) {
            await checkDeviceAuthorization();
          }
        } else {
          if (msg) {
            msg.style.color = '#fca5a5';
            msg.textContent = data.error || 'Error al clonar configuración.';
          }
        }
      } catch (err) {
        alert('Error de conexión al clonar configuración.');
      }
    });
  }

  // Guardar Configuración en Bloque para las Pantallas Seleccionadas
  const btnSaveConfig = document.getElementById('btnSaveScreenConfig');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.chk-screen-config:checked')).map(c => c.value);
      const msg = document.getElementById('screenConfigMsg');

      if (checkedBoxes.length === 0) {
        alert('Seleccione al menos una pantalla a la cual aplicar la configuración.');
        return;
      }

      const radTheme = document.querySelector('input[name="cfgThemeMode"]:checked')?.value || 'dark';
      const colorStyle = document.getElementById('cfgColorScheme')?.value || 'emerald';
      const defaultService = document.getElementById('cfgDefaultService')?.value || 'loteria';
      const tickerActive = document.getElementById('cfgTickerActive')?.checked !== false;
      const tickerSpeed = parseInt(document.getElementById('cfgTickerSpeed')?.value) || 160;
      const voiceEnabled = document.getElementById('cfgVoiceEnabled')?.checked !== false;
      const voiceVolume = (parseInt(document.getElementById('cfgVoiceVolume')?.value) || 90) / 100;
      const animalSfxEnabled = document.getElementById('cfgAnimalSfx')?.checked !== false;
      const isMusicChecked = document.getElementById('cfgBgMusicEnabled')?.checked === true;
      const circusMusicTrack = document.getElementById('cfgBgMusicTrack')?.value || 'circus_waltz';
      const circusMusicVolume = (parseInt(document.getElementById('cfgBgMusicVolume')?.value) || 25) / 100;
      const customMusicUrl = document.getElementById('cfgBgMusicCustomUrl')?.value.trim() || '';

      saveResultadosSlidesFromDOM();
      saveEstadisticasSlidesFromDOM();
      savePublicidadSlidesFromDOM();

      const anim1Games = Array.from(document.querySelectorAll('.chk-lottery-anim1:checked')).map(c => c.value);
      const tripGames = Array.from(document.querySelectorAll('.chk-lottery-trip:checked')).map(c => c.value);
      const anim2Games = Array.from(document.querySelectorAll('.chk-lottery-anim2:checked')).map(c => c.value);

      const assembledConfig = {
        themeMode: radTheme,
        colorStyle,
        colorScheme: colorStyle,
        defaultService,
        tickerActive,
        tickerSpeed,
        voiceEnabled,
        voiceVolume,
        animalSfxEnabled,
        bgMusicEnabled: isMusicChecked,
        circusMusicEnabled: isMusicChecked,
        bgMusicTrack: circusMusicTrack,
        circusMusicTrack,
        bgMusicVolume: circusMusicVolume,
        circusMusicVolume,
        bgMusicCustomUrl: customMusicUrl,
        customMusicUrl,
        lotterySections: currentScreenConfig.lotterySections,
        modules: {
          top5_animalitos: {
            enabled: document.getElementById('modEnabled_top5_animalitos')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_top5_animalitos')?.value) || 20,
            games: anim1Games.length > 0 ? anim1Games : ['guacharo-activo', 'granjita', 'lotto-activo', 'la-ricachona', 'lotto-rey']
          },
          top5_triples: {
            enabled: document.getElementById('modEnabled_top5_triples')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_top5_triples')?.value) || 20,
            games: tripGames.length > 0 ? tripGames : ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-caracas', 'triple-zamorano']
          },
          animalitos_group2: {
            enabled: document.getElementById('modEnabled_group2_animalitos')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_group2_animalitos')?.value) || 18,
            games: anim2Games.length > 0 ? anim2Games : ['selva-plus', 'ruleta-activa', 'granjita-plus']
          },
          pizarra_1000: {
            enabled: document.getElementById('modEnabled_pizarra_1000')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_pizarra_1000')?.value) || 28
          },
          estadisticas_30d: {
            enabled: document.getElementById('modEnabled_estadisticas')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_estadisticas')?.value) || 20
          },
          publicidad_loteria: {
            enabled: document.getElementById('modEnabled_publicidad')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_publicidad')?.value) || 15
          },
          ultimos_5_sorteos: {
            enabled: document.getElementById('modEnabled_ultimos_5_sorteos')?.checked !== false,
            duration: parseInt(document.getElementById('modDuration_ultimos_5_sorteos')?.value) || 25
          }
        }
      };

      try {
        const res = await fetch('/api/client/devices/batch-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ deviceIds: checkedBoxes, config: assembledConfig })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (msg) {
            msg.style.color = '#34d399';
            const resSlidesCount = assembledConfig.lotterySections?.resultados?.slides?.length || 0;
            const statSlidesCount = assembledConfig.lotterySections?.estadisticas?.slides?.length || 0;
            const pubSlidesCount = assembledConfig.lotterySections?.publicidad?.slides?.length || 0;
            msg.textContent = `¡Configuración guardada y sincronizada en ${checkedBoxes.length} televisor(es) de agencia! (${resSlidesCount} Resultados, ${statSlidesCount} Estadísticas, ${pubSlidesCount} Publicidad)`;
          }
          applyScreenConfig(assembledConfig);
          if (currentUser) {
            currentUser.config = assembledConfig;
            try {
              localStorage.setItem('visual_fx_user', JSON.stringify(currentUser));
            } catch (e) {}
          }
          try {
            localStorage.setItem('visual_fx_screen_config', JSON.stringify(assembledConfig));
          } catch (e) {}
        } else {
          if (msg) {
            msg.style.color = '#fca5a5';
            msg.textContent = data.error || 'Error al guardar configuración.';
          }
        }
      } catch (err) {
        alert('Error al guardar configuración de pantallas.');
      }
    });
  }
}

// Inicializar configuración al arrancar
setTimeout(() => {
  setupScreenConfigEventListeners();
}, 200);

// ==========================================
// Carga Manual de Resultados (Tab 6 Técnico)
// ==========================================
function updateAdminManualLotteryDropdowns() {
  const selGame = document.getElementById('selManualGame');
  if (!selGame || !lotteryTop10 || lotteryTop10.length === 0) return;

  const currentVal = selGame.value;
  selGame.innerHTML = lotteryTop10.map(g => {
    const gId = g.gameId || g.id;
    const icon = g.icon || (g.type === 'animalitos' ? '🐾' : '🎰');
    return `<option value="${gId}" ${gId === currentVal ? 'selected' : ''}>${icon} ${g.name}</option>`;
  }).join('');

  if (!currentVal && lotteryTop10.length > 0) {
    selGame.value = lotteryTop10[0].gameId || lotteryTop10[0].id;
  }

  updateManualHoursDropdown();
}

function updateManualHoursDropdown() {
  const selGame = document.getElementById('selManualGame');
  const selHour = document.getElementById('selManualHour');
  const boxAnimal = document.getElementById('boxManualAnimal');
  const boxTriple = document.getElementById('boxManualTriple');
  if (!selGame || !selHour) return;

  const game = lotteryTop10.find(g => (g.gameId || g.id) === selGame.value);
  if (!game) return;

  if (game.type === 'animalitos') {
    if (boxAnimal) boxAnimal.style.display = 'flex';
    if (boxTriple) boxTriple.style.display = 'none';
  } else {
    if (boxAnimal) boxAnimal.style.display = 'none';
    if (boxTriple) boxTriple.style.display = 'flex';
  }

  const draws = game.draws || game.results || [];
  const hours = draws.map(d => d.time || d.hour);
  selHour.innerHTML = hours.map(h => `<option value="${h}">${h}</option>`).join('');
}

// Controladores de Teclado y Compatibilidad de Carrusel
function advanceLotteryCarousel() {
  runAutonomousCarouselLoop();
}

function toggleLotteryCarousel() {
  toggleLotteryCarouselPause();
}

function selectLotteryGame(gameId) {
  // Avance manual si se requiere
  runAutonomousCarouselLoop();
}

function toggleLotteryVoiceAnnouncements() {
  lotteryVoiceEnabled = !lotteryVoiceEnabled;
  currentScreenConfig.voiceEnabled = lotteryVoiceEnabled;
}

function toggleLotteryViewMode() {}
function setLotteryDisplayMode() {}
function switchDirectToLotteryGame() {}
function openLotteryStatsModal() {}
function closeLotteryStatsModal() {}
function selectStatsGame() {}

// ==========================================
// Gestor Universal de Control Remoto para Smart TV, FireStick y Android TV (APK)
// ==========================================
function handleTvRemoteKey(keyName) {
  console.log(`[TvRemote] Tecla procesada: "${keyName}" | Servicio: ${selectedService}`);

  const activeEl = document.activeElement;
  const isInputActive = activeEl && ['INPUT', 'TEXTAREA'].includes(activeEl.tagName);

  // 1. Si hay un campo de texto activo (ej. login o cambio de nombre):
  if (isInputActive) {
    if (keyName >= '0' && keyName <= '9') {
      const start = activeEl.selectionStart || activeEl.value.length;
      const end = activeEl.selectionEnd || activeEl.value.length;
      activeEl.value = activeEl.value.slice(0, start) + keyName + activeEl.value.slice(end);
      activeEl.selectionStart = activeEl.selectionEnd = start + 1;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (keyName === 'Enter' || keyName === 'Center') {
      const form = activeEl.closest('form') || activeEl.closest('.modal-content') || activeEl.closest('.modal-card');
      const submitBtn = form ? form.querySelector('button[type="submit"], button.btn-primary, button:not([disabled])') : null;
      if (submitBtn) {
        submitBtn.click();
      } else {
        activeEl.blur();
      }
      return true;
    }
    if (keyName === 'ArrowDown' || keyName === 'ArrowUp') {
      const form = activeEl.closest('form') || document;
      const inputs = Array.from(form.querySelectorAll('input, button, select'));
      const currentIndex = inputs.indexOf(activeEl);
      if (currentIndex !== -1) {
        const nextIndex = keyName === 'ArrowDown'
          ? (currentIndex + 1) % inputs.length
          : (currentIndex - 1 + inputs.length) % inputs.length;
        inputs[nextIndex]?.focus();
      }
      return true;
    }
    return false;
  }

  // 2. Si hay un botón o enlace enfocado en un modal y se presiona Enter, ejecutar clic
  if (activeEl && (activeEl.tagName === 'BUTTON' || activeEl.tagName === 'A') && (keyName === 'Enter' || keyName === 'Center')) {
    if (activeEl !== document.body && !activeEl.classList.contains('btn-cintillo-nav')) {
      activeEl.click();
      return true;
    }
  }

  // 3. Procesar acciones universales de navegación de pantalla
  switch (keyName) {
    case 'ArrowRight':
    case 'Next':
    case 'ChannelUp':
    case 'PageDown':
      if (selectedService === 'loteria') {
        goToNextLotteryModule(true);
      } else if (selectedService === 'hipica') {
        if (focusedCellIndex < activeGridMode) {
          setFocusedCell(focusedCellIndex + 1);
        } else {
          setFocusedCell(1);
        }
      }
      showHeaderTemporarily(2500);
      break;

    case 'ArrowLeft':
    case 'Prev':
    case 'ChannelDown':
    case 'PageUp':
      if (selectedService === 'loteria') {
        goToPrevLotteryModule(true);
      } else if (selectedService === 'hipica') {
        if (focusedCellIndex > 1) {
          setFocusedCell(focusedCellIndex - 1);
        } else {
          setFocusedCell(activeGridMode);
        }
      }
      showHeaderTemporarily(2500);
      break;

    case 'ArrowUp':
      if (selectedService === 'hipica') {
        if (activeGridMode >= 3 && focusedCellIndex > 2) {
          setFocusedCell(focusedCellIndex - 2);
        }
      } else if (selectedService === 'loteria') {
        showHeaderTemporarily(3500);
      }
      break;

    case 'ArrowDown':
      if (selectedService === 'hipica') {
        if (activeGridMode >= 3 && focusedCellIndex <= 2) {
          setFocusedCell(focusedCellIndex + 2 <= activeGridMode ? focusedCellIndex + 2 : activeGridMode);
        }
      } else if (selectedService === 'loteria') {
        showHeaderTemporarily(3500);
      }
      break;

    case 'Enter':
    case 'Center':
    case 'Space':
    case ' ':
      if (selectedService === 'loteria') {
        toggleLotteryCarouselPause();
      } else if (selectedService === 'hipica') {
        setAudioFocus(focusedCellIndex);
      }
      break;

    case '1':
      if (selectedService === 'hipica') {
        updateGridView(1);
      } else if (selectedService === 'loteria') {
        goToLotteryModuleByIndex(0);
      }
      showHeaderTemporarily(2000);
      break;

    case '2':
      if (selectedService === 'hipica') {
        updateGridView(2);
      } else if (selectedService === 'loteria') {
        goToLotteryModuleByIndex(1);
      }
      showHeaderTemporarily(2000);
      break;

    case '3':
      if (selectedService === 'hipica') {
        updateGridView(3);
      } else if (selectedService === 'loteria') {
        goToLotteryModuleByIndex(2);
      }
      showHeaderTemporarily(2000);
      break;

    case '4':
      if (selectedService === 'hipica') {
        updateGridView(4);
      } else if (selectedService === 'loteria') {
        goToLotteryModuleByIndex(3);
      }
      showHeaderTemporarily(2000);
      break;

    case 'Menu':
    case 'Info':
    case 'Guide':
    case 'Settings':
      showHeaderTemporarily(8000);
      break;

    case 'Red':
      switchDirectService('hipica');
      break;

    case 'Green':
      switchDirectService('loteria');
      break;

    case 'Yellow':
    case 'Blue':
      toggleAppFullscreen();
      break;

    case 'f':
    case 'F':
      toggleAppFullscreen();
      break;
  }
  return true;
}
window.handleTvRemoteKey = handleTvRemoteKey;

// D-Pad Remote Navigation & Universal Shortcuts para Smart TV y PC
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Si el foco está en un input/textarea/select, permitir escritura y uso normal de teclas
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Si el foco está en un botón o elemento interactivo y se presiona Enter o Espacio, permitir clic nativo
    if (['BUTTON', 'A'].includes(document.activeElement?.tagName) || (document.activeElement && document.activeElement.hasAttribute('tabindex'))) {
      if (document.activeElement !== document.body && (e.key === 'Enter' || e.key === ' ')) {
        return; // El navegador ejecutará el clic nativo del elemento enfocado
      }
    }

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleAppFullscreen();
      return;
    }
    if (e.key === 'h' || e.key === 'H' || e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      showHeaderTemporarily(8000);
      return;
    }
    if ((e.key === 'a' || e.key === 'A') && e.shiftKey) {
      e.preventDefault();
      openAdminModalDirectly();
      return;
    }

    // Teclas estándar procesadas a través del gestor universal
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', '1', '2', '3', '4', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      handleTvRemoteKey(e.key);
    }
  });
}

// ==========================================
// Exposición Global de Controladores para HTML
// ==========================================
window.openAdminModalDirectly = openAdminModalDirectly;
window.closeLoginModalSafely = closeLoginModalSafely;
window.openExecutiveAdminModal = openExecutiveAdminModal;
window.switchAdminTab = switchAdminTab;
window.previewChannelInMonitor = previewChannelInMonitor;
window.stopTestMonitorPlayer = stopTestMonitorPlayer;
window.toggleChannelOnAirApi = toggleChannelOnAirApi;
window.deleteChannelApi = deleteChannelApi;
window.adjustClientQuotaPrompt = adjustClientQuotaPrompt;
window.toggleClientStatusApi = toggleClientStatusApi;
window.deleteClientApi = deleteClientApi;
window.renameDevicePrompt = renameDevicePrompt;
window.unlinkDeviceApi = unlinkDeviceApi;
window.updateDeviceDefaultServiceApi = updateDeviceDefaultServiceApi;
window.quickActivateForClient = quickActivateForClient;
window.goToLiveStreams = goToLiveStreams;
window.deleteSystemUser = deleteSystemUser;
window.loadApprovedDevicesList = loadApprovedDevicesList;
window.loadClientsList = loadClientsList;
window.loadSystemAnalytics = loadSystemAnalytics;
window.loadSystemUsersList = loadSystemUsersList;
window.selectLotteryGame = selectLotteryGame;
window.toggleLotteryCarousel = toggleLotteryCarousel;
window.loadLotteryTop10Data = loadLotteryTop10Data;
window.toggleAppFullscreen = toggleAppFullscreen;
window.switchDirectService = switchDirectService;
window.toggleHeaderPin = toggleHeaderPin;
window.toggleLotteryVoiceAnnouncements = toggleLotteryVoiceAnnouncements;
window.toggleLotteryViewMode = toggleLotteryViewMode;
window.setLotteryDisplayMode = setLotteryDisplayMode;
window.openLotteryStatsModal = openLotteryStatsModal;
window.closeLotteryStatsModal = closeLotteryStatsModal;
window.selectStatsGame = selectStatsGame;
window.switchDirectToLotteryGame = switchDirectToLotteryGame;

window.requestDeviceActivation = function() {
  openAdminModalDirectly();
};
window.showLoginFormView = function() {
  if (elements.loginModal) elements.loginModal.style.setProperty('display', 'flex', 'important');
};
window.handleTvRemoteKey = handleTvRemoteKey;
window.goToLotteryModuleByIndex = goToLotteryModuleByIndex;


