// App State
let currentUser = null;
let currentToken = null;
let currentDeviceId = null;
let channelCatalog = [];
let activeGridMode = 1;
let activeAudioCell = null;
let focusedCellIndex = 1;

// Smart TV Detection for Ultra-Low Memory & Hardware Decoding Optimization
function detectSmartTv() {
  const ua = navigator.userAgent.toLowerCase();
  return /smarttv|tizen|webos|hbbtv|netcast|vizio|opera tv|appletv|firetv|roku|android tv|googletv|smart-tv/i.test(ua);
}
const IS_SMART_TV = detectSmartTv();

// HLS Player Instances
const hlsPlayers = { 1: null, 2: null, 3: null, 4: null };

// Strict Player Cleanup & Hardware Memory Release
function stopAndDestroyPlayer(cellNum) {
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

// Selected Service State (Prioridad 4)
let selectedService = localStorage.getItem('visual_fx_service') || 'hipica';

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
let headerAutoHideTimer = null;
let isHeaderPinned = localStorage.getItem('visual_fx_header_pinned') === 'true'; // Flotante por defecto

function initFloatingHeader() {
  const header = document.getElementById('appHeader');
  const triggerBtn = document.getElementById('btnShowHeaderFloating');
  const hoverZone = document.getElementById('topHeaderHoverZone');
  const pinBtn = document.getElementById('btnPinHeader');
  const pinLbl = document.getElementById('lblPinState');

  if (isHeaderPinned) {
    document.body.classList.add('header-pinned-active');
    if (header) {
      header.classList.remove('header-hidden');
      header.classList.add('header-pinned');
    }
    if (pinBtn) pinBtn.classList.add('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijado';
  } else {
    document.body.classList.remove('header-pinned-active');
    if (header) header.classList.remove('header-pinned');
    if (pinBtn) pinBtn.classList.remove('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijar';
  }

  function showHeaderTemporarily(durationMs = 4000) {
    if (!header) return;
    header.classList.remove('header-hidden');
    header.classList.add('visible');
    document.body.classList.add('header-is-visible');
    if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
    if (!isHeaderPinned) {
      headerAutoHideTimer = setTimeout(() => {
        if (!isHeaderPinned && header) {
          header.classList.remove('visible');
          header.classList.add('header-hidden');
          document.body.classList.remove('header-is-visible');
        }
      }, durationMs);
    }
  }

  if (hoverZone) {
    hoverZone.addEventListener('mouseenter', () => showHeaderTemporarily(5000));
  }
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => showHeaderTemporarily(6000));
  }
  if (header) {
    header.addEventListener('mouseenter', () => {
      if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
      header.classList.remove('header-hidden');
      header.classList.add('visible');
      document.body.classList.add('header-is-visible');
    });
    header.addEventListener('mouseleave', () => {
      if (!isHeaderPinned) {
        headerAutoHideTimer = setTimeout(() => {
          if (!isHeaderPinned && header) {
            header.classList.remove('visible');
            header.classList.add('header-hidden');
            document.body.classList.remove('header-is-visible');
          }
        }, 1500);
      }
    });
  }

  // Activar barra superior al mover el cursor hacia el borde superior (<= 25px)
  document.addEventListener('mousemove', (e) => {
    if (!isHeaderPinned && e.clientY <= 25) {
      showHeaderTemporarily(4000);
    }
  });

  // Si no está fijada, ocultar suavemente tras 3.5 segundos en el arranque inicial
  if (!isHeaderPinned && header) {
    setTimeout(() => {
      if (!isHeaderPinned && header) {
        header.classList.add('header-hidden');
      }
    }, 3500);
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
    }
    if (pinBtn) pinBtn.classList.add('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijado';
  } else {
    document.body.classList.remove('header-pinned-active');
    if (header) {
      header.classList.remove('header-pinned');
      header.classList.add('visible');
    }
    if (pinBtn) pinBtn.classList.remove('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijar';
    setTimeout(() => {
      if (!isHeaderPinned && header) {
        header.classList.remove('visible');
        header.classList.add('header-hidden');
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
    (window.innerHeight === screen.height && screen.height > 0)
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
  }
}
window.toggleAppFullscreen = toggleAppFullscreen;

function updateFullscreenButtons(isFs) {
  const btns = document.querySelectorAll(
    '#btnToggleAppFullscreen, #btnHeaderFullscreen, .btn-header-fullscreen, #btnCintilloFullscreen, .btn-fullscreen-lottery, #btnFullscreenLotteryMain'
  );
  btns.forEach(b => {
    if (b.id === 'btnCintilloFullscreen') {
      const txt = b.querySelector('.cintillo-fs-text');
      const svg = b.querySelector('.cintillo-fs-svg');
      if (txt) {
        txt.textContent = isFs ? 'Salir Pantalla Completa' : 'Pantalla Completa';
      }
      if (svg) {
        svg.innerHTML = isFs
          ? '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
          : '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
      }
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
  const loginErr = document.getElementById('loginError');
  const btnClose = document.getElementById('btnCloseLoginModal');

  if (txtUser) txtUser.value = '';
  if (txtPass) txtPass.value = '';
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
    if (txtUser) txtUser.focus();
  }, 100);
}

// Cerrar Modal de Login con 'X'
function closeLoginModalSafely() {
  elements.loginModal.style.display = 'none';
  const txtUser = document.getElementById('txtUser');
  const txtPass = document.getElementById('txtPass');
  if (txtUser) txtUser.value = '';
  if (txtPass) txtPass.value = '';
}

// User Login Submission
elements.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('txtUser').value.trim();
  const password = document.getElementById('txtPass').value.trim();
  
  elements.loginError.style.display = 'none';
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
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
    
    // Reasignar hipódromos activos a las 4 celdas si la celda tiene un canal inactivo o nulo
    if (activeChannels.length > 0) {
      [1, 2, 3, 4].forEach((num, idx) => {
        if (!activeChannels.some(c => c.id === cellChannels[num])) {
          cellChannels[num] = activeChannels[idx % activeChannels.length].id;
        }
      });
    }

    // Filtrar y renderizar según pestaña activa (por defecto: solo los que tienen carreras en vivo)
    filterAndRenderChannels(elements.txtSearchChannel ? elements.txtSearchChannel.value.trim().toLowerCase() : '');
    populateSelectDropdowns();
    
    updateGridView(activeGridMode);
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
      
      const hls = new Hls({
        enableWorker: !IS_SMART_TV, // Web Workers deshabilitado en Smart TVs para no bloquear hilos del navegador
        lowLatencyMode: false,
        capLevelToPlayerSize: true, // Escala la resolución al tamaño real del contenedor
        backBufferLength: IS_SMART_TV ? 0 : 30, // En Smart TV libera memoria RAM de inmediato
        maxBufferLength: IS_SMART_TV ? (isUltraMulti ? 3 : (isMultiCell ? 4 : 8)) : (isMultiCell ? 10 : 25),
        maxMaxBufferLength: IS_SMART_TV ? (isUltraMulti ? 5 : (isMultiCell ? 7 : 15)) : (isMultiCell ? 20 : 40),
        maxBufferSize: IS_SMART_TV ? (isUltraMulti ? 2 * 1024 * 1024 : (isMultiCell ? 4 * 1024 * 1024 : 8 * 1024 * 1024)) : 30 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetries: 5,
        startLevel: (IS_SMART_TV && isUltraMulti) ? 0 : -1,
        testBandwidth: true
      });

      hls.loadSource(targetUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (loader) loader.style.display = 'none';

        // Limitación inteligente de resolución para Smart TV:
        if (IS_SMART_TV && data.levels && data.levels.length > 1) {
          if (activeGridMode >= 3) {
            // En 3 o 4 pantallas en Smart TV: forzar el nivel más liviano (360p/480p) para ahorrar 75% CPU/RAM
            hls.autoLevelCappedAt = 0;
            hls.currentLevel = 0;
          } else if (activeGridMode === 2) {
            // En 2 pantallas: permitir hasta 480p
            const safeLevels = data.levels
              .map((lvl, index) => ({ ...lvl, index }))
              .filter(lvl => (lvl.height <= 480));
            if (safeLevels.length > 0) {
              hls.autoLevelCappedAt = safeLevels[safeLevels.length - 1].index;
            } else {
              hls.autoLevelCappedAt = 0;
            }
          } else {
            // En 1 sola pantalla: permitir hasta 720p HD
            const safeLevels = data.levels
              .map((lvl, index) => ({ ...lvl, index }))
              .filter(lvl => (lvl.height <= 720));
            if (safeLevels.length > 0) {
              const maxSafeIndex = safeLevels[safeLevels.length - 1].index;
              hls.autoLevelCappedAt = maxSafeIndex;
            }
          }
        }

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

function toggleCellFullscreen(cellNum) {
  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;
  if (!document.fullscreenElement) {
    if (cell.requestFullscreen) cell.requestFullscreen();
    else if (cell.webkitRequestFullscreen) cell.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}
window.toggleCellFullscreen = toggleCellFullscreen;

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

function toggleCellFullscreen(cellNum) {
  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;

  if (!document.fullscreenElement) {
    if (cell.requestFullscreen) cell.requestFullscreen();
    else if (cell.webkitRequestFullscreen) cell.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
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
    } else if (name.includes('perro') || name.includes('chivo') || name.includes('zorro')) {
      this.synthesizeDog(ctx, now);
    } else if (name.includes('gato') || name.includes('tigre') || name.includes('leona') || name.includes('pantera')) {
      this.synthesizeCat(ctx, now);
    } else if (name.includes('gallo') || name.includes('gallina') || name.includes('pavo')) {
      this.synthesizeRooster(ctx, now);
    } else if (name.includes('toro') || name.includes('buey') || name.includes('vaca')) {
      this.synthesizeBull(ctx, now);
    } else if (name.includes('cochino') || name.includes('cerdo') || name.includes('jabali')) {
      this.synthesizePig(ctx, now);
    } else if (name.includes('mono')) {
      this.synthesizeMonkey(ctx, now);
    } else if (name.includes('elefante')) {
      this.synthesizeElephant(ctx, now);
    } else if (name.includes('pajaro') || name.includes('canario') || name.includes('aguila') || name.includes('paloma') || name.includes('zamuro')) {
      this.synthesizeBird(ctx, now);
    } else {
      playChimeAlert();
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

function speakLotteryDraw(gameName, drawTime, resultText) {
  if (!lotteryVoiceEnabled) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Atención. Resultado oficial de ${gameName}, sorteo de las ${drawTime}: ${resultText}.`);
    utterance.lang = 'es-VE';
    utterance.rate = 0.90;
    utterance.pitch = 1.02;
    utterance.volume = currentScreenConfig.voiceVolume || 0.90;
    const bestVoice = getBestSpanishVoice();
    if (bestVoice) utterance.voice = bestVoice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[SpeechSynthesis]', e);
  }
}

function checkForNewDrawAnnouncements(games) {
  if (!games || games.length === 0) return;
  games.forEach(game => {
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.number || d.tripleA));
    if (completed.length > 0) {
      const latest = completed[completed.length - 1];
      const drawId = `${game.id || game.gameId}-${latest.time || latest.hour}-${latest.number || latest.tripleA}`;
      const gKey = game.id || game.gameId;

      if (!lastAnnouncedDrawId[gKey]) {
        lastAnnouncedDrawId[gKey] = drawId;
      } else if (lastAnnouncedDrawId[gKey] !== drawId) {
        lastAnnouncedDrawId[gKey] = drawId;
        const resultDesc = game.type === 'animalitos'
          ? `Número ${latest.number}, ${latest.name}`
          : `Triple A ${latest.tripleA}, Triple B ${latest.tripleB}${latest.signo ? ', Signo ' + latest.signo : ''}`;

        if (game.type === 'animalitos' && currentScreenConfig.animalSfxEnabled) {
          AnimalSFXEngine.playAnimalSound(latest.name);
          setTimeout(() => {
            speakLotteryDraw(game.name, latest.time || latest.hour, resultDesc);
          }, 950);
        } else {
          playChimeAlert();
          setTimeout(() => {
            speakLotteryDraw(game.name, latest.time || latest.hour, resultDesc);
          }, 350);
        }
      }
    }
  });
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

    return `
      <div class="board-col-card">
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
  const allowedGames = modCfg.games || ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-caracas', 'triple-zamorano'];
  let games = lotteryTop10.filter(g => allowedGames.includes(g.id || g.gameId));
  if (games.length === 0) {
    games = lotteryTop10.filter(g => g.type === 'triples').slice(0, 5);
  }

  const colsHtml = games.map(game => {
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.tripleA || d.tripleB || d.tripleC));
    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && (draw.tripleA || draw.tripleB || draw.tripleC);
      const tripleA = isDone ? (draw.tripleA || '--') : '--';
      const tripleB = isDone ? (draw.tripleB || '--') : '--';
      const tripleC = isDone ? (draw.tripleC || '') : '';
      const cStr = tripleC ? ` C:${tripleC}` : '';
      const signo = isDone ? (draw.signo || '') : '';
      const zData = getZodiacData(signo);

      return `
        <div class="board-draw-row ${isDone ? 'done' : 'pending'}">
          <span class="draw-time-cell">${draw.time || draw.hour}</span>
          <div class="draw-info-cell">
            <span class="draw-triple-badge">A:${tripleA} B:${tripleB}${cStr}</span>
            ${signo ? `<span class="draw-sign-label">${zData ? `${zData.symbol} ${zData.name}` : signo}</span>` : ''}
          </div>
          <div class="draw-avatar-cell">
            ${zData ? `<img src="/images/zodiac/${zData.file}" class="draw-zodiac-thumb" alt="${zData.name}" title="${zData.name}">` : (signo ? '<span style="font-size:1rem;">♈</span>' : (isDone ? '<span style="font-size:0.85rem;">⭐</span>' : '<span class="draw-pending-icon">⏳</span>'))}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="board-col-card">
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

    return `
      <div class="board-col-card">
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
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.number || d.tripleA || d.tripleB || d.tripleC));

    const rowsHtml = draws.map(draw => {
      const isDone = !draw.isPending && (draw.number || draw.tripleA || draw.tripleB || draw.tripleC);
      const isAnimal = game.type === 'animalitos';
      const cStr = (!isAnimal && draw.tripleC) ? ` C:${draw.tripleC}` : '';
      const num = isDone ? (isAnimal ? draw.number : `A:${draw.tripleA || '--'}`) : '--';
      const name = isDone ? (isAnimal ? (draw.name || '') : `B:${draw.tripleB || '--'}${cStr} ${draw.signo || ''}`) : 'Esperando...';
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

    return `
      <div class="board-col-card">
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
    const num = isAnimal ? (draw.number || '--') : `A: ${draw.tripleA || '--'}`;
    const name = isAnimal ? (draw.name || '') : `B: ${draw.tripleB || '--'}${draw.tripleC ? ` • C: ${draw.tripleC}` : ''}`;
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
// Bucle de Rotación Continua y Autónoma (Zero-Touch TV Carousel)
// ==========================================
const CAROUSEL_MODULE_ORDER = [
  'top5_animalitos',
  'top5_triples',
  'animalitos_group2',
  'pizarra_1000',
  'estadisticas_30d',
  'publicidad_loteria',
  'ultimos_5_sorteos'
];

const MODULE_TITLES = {
  top5_animalitos: '🐾 TOP 5 ANIMALITOS MÁS VENDIDOS',
  top5_triples: '🎰 TOP 5 TRIPLES Y TERMINALES',
  animalitos_group2: '🐾 ANIMALITOS GRUPO 2',
  pizarra_1000: '📋 PIZARRA GENERAL DE LOTERÍAS',
  estadisticas_30d: '📊 RADIOGRAFÍA ESTADÍSTICA 30D',
  publicidad_loteria: '📢 PUBLICIDAD OFICIAL DE LOTERÍAS',
  ultimos_5_sorteos: '⭐ ÚLTIMOS 5 SORTEOS EMITIDOS'
};

let currentCarouselModuleIdx = 0;
let currentActiveModuleKey = 'top5_animalitos';
let carouselTransitionTimer = null;
let adSlideIndex = 0;
let isCarouselPaused = false;

// Obtener lista ordenada de módulos activos/habilitados para la pantalla
function getActiveCarouselModules() {
  const modulesCfg = (currentScreenConfig && currentScreenConfig.modules) ? currentScreenConfig.modules : {};
  const active = CAROUSEL_MODULE_ORDER.filter(key => {
    const mod = modulesCfg[key];
    return !mod || mod.enabled !== false;
  });
  return active.length > 0 ? active : ['top5_animalitos'];
}
window.getActiveCarouselModules = getActiveCarouselModules;

// Actualizar numeración de páginas (ej. 1 de 5, 2 de 5)
function updateLotteryPageIndicator(currentKey) {
  const active = getActiveCarouselModules();
  let currentIdx = active.indexOf(currentKey);
  if (currentIdx === -1) currentIdx = 0;
  const pageStr = `${currentIdx + 1} de ${active.length}`;

  const pageEl = document.getElementById('lblLotteryPageText');
  if (pageEl) pageEl.textContent = pageStr;

  const headerPageEl = document.getElementById('lblHeaderPageCounter') || document.getElementById('lblCintilloPage');
  if (headerPageEl) headerPageEl.textContent = pageStr;
}
window.updateLotteryPageIndicator = updateLotteryPageIndicator;

// Renderizar módulo específico por su identificador
function renderLotteryModuleByKey(foundKey) {
  currentActiveModuleKey = foundKey;
  const modCfg = (currentScreenConfig && currentScreenConfig.modules && currentScreenConfig.modules[foundKey]) || { duration: 20 };
  const durationSec = Math.max(5, parseInt(modCfg.duration) || 20);

  const lblModule = document.getElementById('lblActiveModuleName');
  if (lblModule) {
    lblModule.textContent = MODULE_TITLES[foundKey] || 'PANTALLA EN VIVO';
  }

  const stage = document.getElementById('lotteryCarouselStage');
  if (stage) {
    switch (foundKey) {
      case 'top5_animalitos':
        renderModuleTop5Animalitos(modCfg, stage);
        break;
      case 'top5_triples':
        renderModuleTop5Triples(modCfg, stage);
        break;
      case 'animalitos_group2':
        renderModuleAnimalitosGroup2(modCfg, stage);
        break;
      case 'pizarra_1000':
        renderModulePizarra1000(modCfg, stage);
        break;
      case 'estadisticas_30d':
        renderModuleEstadisticas(modCfg, stage);
        break;
      case 'publicidad_loteria':
        renderModulePublicidad(modCfg, stage);
        break;
      case 'ultimos_5_sorteos':
        renderModuleUltimos5Sorteos(modCfg, stage);
        break;
      default:
        renderModuleTop5Animalitos(modCfg, stage);
    }
  }

  updateLotteryPageIndicator(foundKey);
  return durationSec;
}
window.renderLotteryModuleByKey = renderLotteryModuleByKey;

// Programar siguiente salto del carrusel si no está en pausa
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

// Pausar / Reanudar Carrusel desde la Cabecera Broadcast o Teclado
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
    const modCfg = (currentScreenConfig && currentScreenConfig.modules && currentScreenConfig.modules[currentActiveModuleKey]) || { duration: 20 };
    const durSec = Math.max(5, parseInt(modCfg.duration) || 20);
    scheduleNextCarouselTransition(durSec);
  }
}
window.toggleLotteryCarouselPause = toggleLotteryCarouselPause;

// Navegación ágil: Ir al primer módulo
function goToFirstLotteryModule(isManual = true) {
  const active = getActiveCarouselModules();
  const targetKey = active[0];
  currentCarouselModuleIdx = CAROUSEL_MODULE_ORDER.indexOf(targetKey);
  const durSec = renderLotteryModuleByKey(targetKey);
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Ir al primer módulo (${targetKey})`);
}
window.goToFirstLotteryModule = goToFirstLotteryModule;

// Navegación ágil: Ir al último módulo
function goToLastLotteryModule(isManual = true) {
  const active = getActiveCarouselModules();
  const targetKey = active[active.length - 1];
  currentCarouselModuleIdx = CAROUSEL_MODULE_ORDER.indexOf(targetKey);
  const durSec = renderLotteryModuleByKey(targetKey);
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Ir al último módulo (${targetKey})`);
}
window.goToLastLotteryModule = goToLastLotteryModule;

// Navegación ágil: Retroceder un módulo
function goToPrevLotteryModule(isManual = true) {
  const active = getActiveCarouselModules();
  let idx = active.indexOf(currentActiveModuleKey);
  if (idx === -1) idx = 0;
  const prevIdx = (idx - 1 + active.length) % active.length;
  const targetKey = active[prevIdx];
  currentCarouselModuleIdx = CAROUSEL_MODULE_ORDER.indexOf(targetKey);
  const durSec = renderLotteryModuleByKey(targetKey);
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Retroceder módulo (${targetKey})`);
}
window.goToPrevLotteryModule = goToPrevLotteryModule;

// Navegación ágil: Avanzar un módulo
function goToNextLotteryModule(isManual = true) {
  const active = getActiveCarouselModules();
  let idx = active.indexOf(currentActiveModuleKey);
  if (idx === -1) idx = 0;
  const nextIdx = (idx + 1) % active.length;
  const targetKey = active[nextIdx];
  currentCarouselModuleIdx = CAROUSEL_MODULE_ORDER.indexOf(targetKey);
  const durSec = renderLotteryModuleByKey(targetKey);
  scheduleNextCarouselTransition(durSec);
  if (isManual) console.log(`[LotteryCarousel] Navegación: Avanzar módulo (${targetKey})`);
}
window.goToNextLotteryModule = goToNextLotteryModule;

// Bucle autónomo continuo del carrusel
function runAutonomousCarouselLoop() {
  const active = getActiveCarouselModules();
  let key = CAROUSEL_MODULE_ORDER[currentCarouselModuleIdx];
  if (!active.includes(key)) {
    key = active[0];
    currentCarouselModuleIdx = CAROUSEL_MODULE_ORDER.indexOf(key);
  }
  const durSec = renderLotteryModuleByKey(key);
  currentCarouselModuleIdx = (currentCarouselModuleIdx + 1) % CAROUSEL_MODULE_ORDER.length;
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
        <span style="font-size:0.78rem; opacity:0.85;">${it.badge || it.label || ''}</span>
        <strong class="${valClass}">${it.text || it.value || ''}</strong>
      </div>
    `;
  }).join('');

  track.innerHTML = itemsHtml + itemsHtml;
}

function startLotteryEngineView() {
  startLotteryClock();
  loadLotteryTop10Data().then(() => {
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
    }

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

function syncScreenConfigFormWithState(cfg) {
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

  // Duraciones y estados de los 7 módulos
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
            msg.textContent = `¡Configuración guardada y sincronizada en ${checkedBoxes.length} pantalla(s)!`;
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

    switch (e.key) {
      case '1':
        if (selectedService === 'hipica') updateGridView(1);
        break;
      case '2':
        if (selectedService === 'hipica') updateGridView(2);
        break;
      case '3':
        if (selectedService === 'hipica') updateGridView(3);
        break;
      case '4':
        if (selectedService === 'hipica') updateGridView(4);
        break;
      case 'ArrowRight':
        if (selectedService === 'loteria') {
          // Si no hay botón enfocado, avanzar módulo en carrusel
          if (!document.activeElement || document.activeElement === document.body) {
            goToNextLotteryModule(true);
          }
        } else if (focusedCellIndex < activeGridMode) {
          setFocusedCell(focusedCellIndex + 1);
        }
        break;
      case 'ArrowLeft':
        if (selectedService === 'loteria') {
          if (!document.activeElement || document.activeElement === document.body) {
            goToPrevLotteryModule(true);
          }
        } else if (focusedCellIndex > 1) {
          setFocusedCell(focusedCellIndex - 1);
        }
        break;
      case 'ArrowDown':
        if (selectedService === 'hipica') {
          if (activeGridMode >= 3 && focusedCellIndex <= 2) {
            setFocusedCell(focusedCellIndex + 2 <= activeGridMode ? focusedCellIndex + 2 : activeGridMode);
          }
        }
        break;
      case 'ArrowUp':
        if (selectedService === 'hipica') {
          if (activeGridMode >= 3 && focusedCellIndex > 2) {
            setFocusedCell(focusedCellIndex - 2);
          }
        }
        break;
      case 'Enter':
        if (selectedService === 'loteria') {
          toggleLotteryCarouselPause();
        } else {
          setAudioFocus(focusedCellIndex);
        }
        break;
      case ' ':
        if (selectedService === 'loteria') {
          e.preventDefault();
          toggleLotteryCarouselPause();
        }
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleAppFullscreen();
        break;
      case 'h':
      case 'H':
      case 'm':
      case 'M':
        e.preventDefault();
        showHeaderTemporarily(8000);
        break;
      case 'a':
      case 'A':
        if (e.shiftKey) {
          e.preventDefault();
          openAdminModalDirectly();
        }
        break;
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


