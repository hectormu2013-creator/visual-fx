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

  const lbl = document.getElementById('lblActiveService');
  if (lbl && SERVICES_MAP[selectedService]) {
    lbl.textContent = SERVICES_MAP[selectedService].name;
  }

  // Actualizar botones de acceso directo 1-Click en el Cintillo Superior
  const btnHipica = document.getElementById('btnDirectHipica');
  const btnLoteria = document.getElementById('btnDirectLoteria');
  if (btnHipica) btnHipica.classList.toggle('active', selectedService === 'hipica');
  if (btnLoteria) btnLoteria.classList.toggle('active', selectedService === 'loteria');

  // Alternar controles de cintillo según el servicio activo
  const hipControls = document.getElementById('hipicaHeaderControls');
  const lotControls = document.getElementById('lotteryHeaderControls');
  if (hipControls) hipControls.style.display = (selectedService === 'hipica' ? 'flex' : 'none');
  if (lotControls) lotControls.style.display = (selectedService === 'loteria' ? 'flex' : 'none');

  // Ocultar todos los paneles de servicios alternativos
  document.querySelectorAll('.service-view-panel').forEach(p => p.style.display = 'none');

  if (selectedService === 'hipica') {
    if (elements.sidebarChannels) elements.sidebarChannels.style.display = 'flex';
    if (elements.gridViewport) elements.gridViewport.style.display = 'grid';
  } else {
    if (elements.sidebarChannels) elements.sidebarChannels.style.display = 'none';
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

function switchDirectService(serviceId) {
  console.log(`[Visual-FX] Cambio directo de servicio solicitado: ${serviceId}`);
  applyActiveServiceView(serviceId);
}
window.switchDirectService = switchDirectService;

// ==========================================
// Floating Header & Auto-Hide Controller
// ==========================================
let headerAutoHideTimer = null;
let isHeaderPinned = localStorage.getItem('visual_fx_header_pinned') === 'true';

function initFloatingHeader() {
  const header = document.getElementById('appHeader');
  const triggerBtn = document.getElementById('btnShowHeaderFloating');
  const hoverZone = document.getElementById('topHeaderHoverZone');
  const pinBtn = document.getElementById('btnPinHeader');
  const pinLbl = document.getElementById('lblPinState');

  if (isHeaderPinned) {
    document.body.classList.add('header-pinned-active');
    if (header) header.classList.add('header-pinned');
    if (pinBtn) pinBtn.classList.add('pinned');
    if (pinLbl) pinLbl.textContent = 'Desanclar';
  } else {
    document.body.classList.remove('header-pinned-active');
    if (header) header.classList.remove('header-pinned');
    if (pinBtn) pinBtn.classList.remove('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijar';
  }

  function showHeaderTemporarily(durationMs = 4000) {
    if (isHeaderPinned || !header) return;
    header.classList.add('visible');
    if (headerAutoHideTimer) clearTimeout(headerAutoHideTimer);
    headerAutoHideTimer = setTimeout(() => {
      header.classList.remove('visible');
    }, durationMs);
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
      header.classList.add('visible');
    });
    header.addEventListener('mouseleave', () => {
      if (!isHeaderPinned) {
        headerAutoHideTimer = setTimeout(() => {
          header.classList.remove('visible');
        }, 1200);
      }
    });
  }

  // Detect mouse movement near the top 20px
  document.addEventListener('mousemove', (e) => {
    if (!isHeaderPinned && e.clientY <= 20) {
      showHeaderTemporarily(4000);
    }
  });
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
      header.classList.add('header-pinned');
      header.classList.remove('visible');
    }
    if (pinBtn) pinBtn.classList.add('pinned');
    if (pinLbl) pinLbl.textContent = 'Desanclar';
  } else {
    document.body.classList.remove('header-pinned-active');
    if (header) {
      header.classList.remove('header-pinned');
      header.classList.add('visible');
    }
    if (pinBtn) pinBtn.classList.remove('pinned');
    if (pinLbl) pinLbl.textContent = 'Fijar';
    setTimeout(() => {
      if (!isHeaderPinned && header) header.classList.remove('visible');
    }, 3000);
  }
}
window.toggleHeaderPin = toggleHeaderPin;

// ==========================================
// Pantalla Completa Universal (Tecla F & Botón) - Petición 4
// ==========================================
function toggleAppFullscreen() {
  const isCssFull = document.body.classList.toggle('app-fullscreen-mode');
  const isNativeFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  if (isCssFull && !isNativeFull) {
    const docEl = document.documentElement;
    try {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => console.warn('[Native Fullscreen Fallback]', err));
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    } catch (e) {}
  } else if (!isCssFull && isNativeFull) {
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('[Exit Fullscreen Fallback]', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (e) {}
  }

  // Actualizar estado en todos los botones de pantalla completa
  const btns = document.querySelectorAll('#btnToggleAppFullscreen, .btn-fullscreen-lottery, .btn-ticker-fullscreen, #btnFullscreenLotteryMain');
  btns.forEach(b => {
    b.innerHTML = isCssFull ? '✕ Salir Pantalla Completa' : '⛶ Pantalla Completa';
  });
}
window.toggleAppFullscreen = toggleAppFullscreen;

// Capturador Global de Tecla F para Pantalla Completa
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    e.stopPropagation();
    toggleAppFullscreen();
  } else if (e.key === 'Escape') {
    if (document.body.classList.contains('app-fullscreen-mode')) {
      document.body.classList.remove('app-fullscreen-mode');
      const btns = document.querySelectorAll('#btnToggleAppFullscreen, .btn-fullscreen-lottery, .btn-ticker-fullscreen, #btnFullscreenLotteryMain');
      btns.forEach(b => { b.innerHTML = '⛶ Pantalla Completa'; });
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

// Device Authorization Check with Telemetry Heartbeat
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

    const isAuthorized = (data.status === 'APPROVED') || (currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'CLIENT_MANAGER'));

    if (isAuthorized) {
      if (elements.unauthorizedBanner) elements.unauthorizedBanner.style.display = 'none';
      if (elements.gridViewport && selectedService === 'hipica') {
        elements.gridViewport.style.display = 'grid';
      }
      elements.deviceBadgeText.textContent = data.device ? `${data.device.tvName} [AUTORIZADO]` : `Consola Administrador [AUTORIZADO]`;
      if (devicePollingTimer) {
        clearInterval(devicePollingTimer);
        devicePollingTimer = null;
      }

      // 1. Marca Dinámica por Cliente: Reemplazar "Agencias Fenix" por el nombre real del cliente
      const clientTitle = data.clientName || (data.device && data.device.clientName) || (currentUser && (currentUser.clientName || currentUser.clientId)) || 'Fenix';
      const subEl = document.getElementById('lblBrandSubtitle');
      if (subEl) {
        subEl.textContent = `${clientTitle.toUpperCase()} • HÍPICA EN DIRECTO`;
      }
      const adminSub = document.getElementById('lblAdminModalSubtitle');
      if (adminSub) {
        adminSub.textContent = `Gestión Centralizada ${clientTitle} • Dispositivos, Canales y Usuarios`;
      }

      // 2. Jerarquía de Seguridad: Las pantallas/Smart TVs NO son consolas administrativas
      const isSuperAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN');
      const isTvDisplay = IS_SMART_TV || (!isSuperAdmin && data.device && data.device.tvName);

      if (isTvDisplay) {
        document.body.classList.add('authorized-screen');
        if (elements.btnAdminModal) elements.btnAdminModal.style.display = 'none';
        const profileArea = document.getElementById('userProfileArea');
        if (profileArea) profileArea.style.display = 'none';

        // Si el televisor guardó accidentalmente credenciales de cliente en localStorage, purgarlas
        if (IS_SMART_TV) {
          localStorage.removeItem('visual_fx_token');
          localStorage.removeItem('visual_fx_user');
          currentToken = null;
          currentUser = null;
        }
      } else {
        document.body.classList.remove('authorized-screen');
        if (elements.btnAdminModal) elements.btnAdminModal.style.display = 'inline-flex';
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
      elements.lblDevicePin.textContent = data.pin || 'FX-PENDING';
      elements.deviceBadgeText.textContent = `Dispositivo No Autorizado (${currentDeviceId})`;
      if (!devicePollingTimer) {
        devicePollingTimer = setInterval(checkDeviceAuthorization, 3000);
      }
    }
  } catch (err) {
    console.error('Error verificando dispositivo:', err);
  }
}

// User Session
function checkUserSession() {
  // En Smart TVs nunca restauramos sesiones administrativas de usuario en el arranque
  if (IS_SMART_TV) {
    localStorage.removeItem('visual_fx_token');
    localStorage.removeItem('visual_fx_user');
    currentToken = null;
    currentUser = null;
    const profileArea = document.getElementById('userProfileArea');
    if (profileArea) profileArea.style.display = 'none';
    if (elements.btnAdminModal) elements.btnAdminModal.style.display = 'none';
    document.body.classList.add('authorized-screen');
    return;
  }

  const savedToken = localStorage.getItem('visual_fx_token');
  const savedUser = localStorage.getItem('visual_fx_user');
  
  if (savedToken && savedUser) {
    try {
      currentToken = savedToken;
      currentUser = JSON.parse(savedUser);
      
      let roleBadge = '🏢 CLIENTE';
      if (currentUser.role === 'SUPER_ADMIN') roleBadge = '👑 SUPER ADMIN';
      else if (currentUser.role === 'TECH_CHIEF') roleBadge = '🛠️ JEFE TÉCNICO';

      if (elements.lblUserName) {
        elements.lblUserName.textContent = `${currentUser.name} (${roleBadge})`;
      }
      elements.loginModal.style.display = 'none';
      if (elements.unauthorizedBanner) elements.unauthorizedBanner.style.display = 'none';
      const profileArea = document.getElementById('userProfileArea');
      if (profileArea) profileArea.style.display = 'flex';
      if (elements.gridViewport && selectedService === 'hipica') {
        elements.gridViewport.style.display = 'grid';
      }
    } catch (e) {
      localStorage.removeItem('visual_fx_token');
      localStorage.removeItem('visual_fx_user');
      currentToken = null;
      currentUser = null;
    }
  } else {
    currentToken = null;
    currentUser = null;
    const profileArea = document.getElementById('userProfileArea');
    if (profileArea) profileArea.style.display = 'none';
    elements.loginModal.style.display = 'none';
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

  if (tabBtnClients) tabBtnClients.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (tabBtnDevices) tabBtnDevices.style.display = 'inline-block';
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

      // Abrir inmediatamente el panel de control correspondiente al rol
      openExecutiveAdminModal();

      // Si estamos en la pantalla de TV principal y es servicio de carreras, cargar catálogo e iniciar transmisiones
      if (selectedService === 'hipica') {
        if (elements.sidebarChannels) elements.sidebarChannels.style.display = 'flex';
        if (elements.gridViewport) elements.gridViewport.style.display = 'grid';
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

// Logout handler (Cierre de Sesión Limpio)
function handleLogout() {
  localStorage.removeItem('visual_fx_token');
  localStorage.removeItem('visual_fx_user');
  currentToken = null;
  currentUser = null;

  stopTestMonitorPlayer();
  if (elements.deviceModal) elements.deviceModal.style.display = 'none';

  const profileArea = document.getElementById('userProfileArea');
  if (profileArea) profileArea.style.display = 'none';

  // Mostrar el login limpio y vacío con opción de cerrar si solo se quiere volver a la pantalla
  openAdminModalDirectly();
}

elements.btnLogout.addEventListener('click', handleLogout);
const btnLogoutAdminModal = document.getElementById('btnLogoutAdminModal');
if (btnLogoutAdminModal) {
  btnLogoutAdminModal.addEventListener('click', handleLogout);
}

// Load Channels & Prioritize Active RTN On Air Simulcasts
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

    const activeCount = channelCatalog.filter(c => c.onAir).length;
    elements.lblChannelCount.textContent = `${activeCount} EN VIVO (${channelCatalog.length} TOTAL)`;
    
    renderChannelList(channelCatalog);
    populateSelectDropdowns();
    
    updateGridView(activeGridMode);
  } catch (err) {
    console.error('Error cargando canales:', err);
  }
}

// Render Channel Sidebar List
function renderChannelList(channels) {
  elements.channelListContainer.innerHTML = '';
  
  channels.forEach(ch => {
    const card = document.createElement('div');
    card.className = `channel-card ${ch.onAir ? 'on-air' : 'off-air'}`;
    card.setAttribute('tabindex', '0');
    
    const liveBadgeHtml = ch.onAir
      ? `<span class="badge-live active"><span class="live-dot green"></span> EN VIVO</span>`
      : `<span class="badge-live off"><span class="live-dot gray"></span> FUERA DE AIRE</span>`;

    card.innerHTML = `
      <div class="channel-card-top">
        <span class="channel-card-name">${ch.flag} ${ch.name}</span>
        ${liveBadgeHtml}
      </div>
      <div class="channel-card-loc">📍 ${ch.location} • ${ch.nextRace || 'Transmisión RTN'}</div>
      <div class="channel-card-actions">
        <button class="btn-assign-cell" data-cell="1" data-channel="${ch.id}">P1</button>
        <button class="btn-assign-cell" data-cell="2" data-channel="${ch.id}">P2</button>
        <button class="btn-assign-cell" data-cell="3" data-channel="${ch.id}">P3</button>
        <button class="btn-assign-cell" data-cell="4" data-channel="${ch.id}">P4</button>
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
  });
}

// Populate Select Dropdowns inside each Video Cell (Priorizando ON AIR Simulcasts)
function populateSelectDropdowns() {
  [1, 2, 3, 4].forEach(cellNum => {
    const select = document.getElementById(`selectCell${cellNum}`);
    if (!select) return;
    
    select.innerHTML = '';

    const activeChannels = channelCatalog.filter(c => c.onAir);
    const inactiveChannels = channelCatalog.filter(c => !c.onAir);

    // Grupo 1: Hipódromos Transmitiendo EN VIVO en RTN.tv
    const groupLive = document.createElement('optgroup');
    groupLive.label = `🟢 HIPÓDROMOS EN VIVO (${activeChannels.length} ON AIR)`;

    activeChannels.forEach(ch => {
      const option = document.createElement('option');
      option.value = ch.id;
      option.textContent = `🟢 ${ch.flag} ${ch.name} - ${ch.nextRace || 'EN VIVO'}`;
      if (ch.id === cellChannels[cellNum]) {
        option.selected = true;
      }
      groupLive.appendChild(option);
    });
    select.appendChild(groupLive);

    // Grupo 2: Resto de Hipódromos
    if (inactiveChannels.length > 0) {
      const groupOther = document.createElement('optgroup');
      groupOther.label = `⚪ RESTO DE HIPÓDROMOS (${inactiveChannels.length})`;

      inactiveChannels.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.id;
        option.textContent = `⚪ ${ch.flag} ${ch.name}`;
        if (ch.id === cellChannels[cellNum]) {
          option.selected = true;
        }
        groupOther.appendChild(option);
      });
      select.appendChild(groupOther);
    }

    select.addEventListener('change', (e) => {
      assignChannelToCell(cellNum, e.target.value);
    });
  });
}

// Assign Channel to Cell & Play
function assignChannelToCell(cellNum, channelId) {
  const channel = channelCatalog.find(c => c.id === channelId);
  if (!channel) return;
  
  cellChannels[cellNum] = channelId;
  
  document.getElementById(`cell${cellNum}Flag`).textContent = channel.flag;
  document.getElementById(`cell${cellNum}Name`).textContent = channel.name;
  document.getElementById(`cell${cellNum}StatusText`).textContent = channel.statusText;
  
  const select = document.getElementById(`selectCell${cellNum}`);
  if (select) select.value = channelId;

  const targetUrl = channel.streamUrl || channel.iframeUrl;
  if (channel.type === 'iframe') {
    playIframeInCell(cellNum, targetUrl);
  } else {
    playStreamInCell(cellNum, channel.proxyUrl, targetUrl);
  }
}

// Play iFrame Embed
function playIframeInCell(cellNum, iframeUrl) {
  stopAndDestroyPlayer(cellNum);

  const cell = document.getElementById(`cell-${cellNum}`);
  if (!cell) return;
  const wrapper = cell.querySelector('.video-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <iframe src="${iframeUrl}" style="width:100%; height:100%; border:none;" allowfullscreen allow="autoplay"></iframe>
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

// Audio Focus (Toggle Audio On / Mute All)
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
        btnAudio.innerHTML = `<span class="icon">🔊</span> AUDIO ACTIVO`;
      } else {
        btnAudio.classList.remove('active');
        btnAudio.innerHTML = `<span class="icon">🔇</span> SILENCIADO`;
      }
    }
  });
}

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
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateGridView(parseInt(btn.dataset.grid));
    });
  });

  [1, 2, 3, 4].forEach(num => {
    const btnAudio = document.getElementById(`btnAudio${num}`);
    if (btnAudio) {
      btnAudio.addEventListener('click', (e) => {
        e.stopPropagation();
        setAudioFocus(num);
      });
    }

    const btnFs = document.getElementById(`btnFullscreen${num}`);
    if (btnFs) btnFs.addEventListener('click', () => toggleCellFullscreen(num));

    const cell = document.getElementById(`cell-${num}`);
    if (cell) {
      cell.addEventListener('click', (e) => {
        setFocusedCell(num);
        if (e.target.closest('.btn-audio')) {
          setAudioFocus(num);
        }
      });
    }
  });

  elements.btnToggleSidebar.addEventListener('click', () => {
    elements.sidebarChannels.classList.toggle('collapsed');
  });

  elements.txtSearchChannel.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = channelCatalog.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.location.toLowerCase().includes(q) ||
      (c.aliases && c.aliases.some(a => a.toLowerCase().includes(q)))
    );
    renderChannelList(filtered);
  });

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
  elements.btnSubmitActivation.addEventListener('click', async () => {
    const pin = elements.txtActivationPin.value.trim();
    const tvName = elements.txtTvName.value.trim();
    const msg = elements.activationMsg;
    const clientId = currentUser?.clientId || 'fenix';

    if (!pin || !tvName) {
      msg.style.color = '#fca5a5';
      msg.textContent = 'Ingrese el código de 6 dígitos mostrado en la pantalla y un nombre único para el dispositivo.';
      return;
    }

    try {
      const res = await fetch('/api/client/activate-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ pin, tvName, clientId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        msg.style.color = '#34d399';
        msg.textContent = `¡${data.message}!`;
        elements.txtActivationPin.value = '';
        elements.txtTvName.value = '';
        await loadApprovedDevicesList();
        await checkDeviceAuthorization();
      } else {
        msg.style.color = '#fca5a5';
        msg.textContent = data.error || 'Error al activar pantalla.';
      }
    } catch (e) {
      msg.style.color = '#fca5a5';
      msg.textContent = 'Error de conexión con el servidor.';
    }
  });

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
        const signo = document.getElementById('txtManualSigno')?.value.trim();
        if (!tripleA && !tripleB) {
          alert('Por favor ingrese al menos el Triple A o Triple B.');
          return;
        }
        resultPayload = { tripleA, tripleB, signo };
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
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">No hay pantallas autorizadas en este filtro.</td></tr>`;
        return;
      }

      devices.forEach(d => {
        const client = clients.find(c => c.clientId === d.clientId);
        const clientDisplayName = client ? client.name : (d.clientName || d.clientId || 'Fenix');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>📺 ${d.tvName}</strong></td>
          <td><code>${d.deviceId}</code></td>
          <td>
            <span class="badge-role tech">🏢 ${clientDisplayName}</span>
          </td>
          <td>
            <select onchange="updateDeviceDefaultServiceApi('${d.deviceId}', this.value)" style="background:#0f172a; color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:3px 8px; font-size:0.8rem;">
              <option value="hipica" ${(!d.defaultService || d.defaultService === 'hipica') ? 'selected' : ''}>🏇 Hípica en Vivo</option>
              <option value="loteria" ${d.defaultService === 'loteria' ? 'selected' : ''}>🎲 Loterías</option>
              <option value="deportes" ${d.defaultService === 'deportes' ? 'selected' : ''}>⚽ Marcadores</option>
              <option value="tv_deportes" ${d.defaultService === 'tv_deportes' ? 'selected' : ''}>📺 Canales Deportivos</option>
              <option value="publicidad" ${d.defaultService === 'publicidad' ? 'selected' : ''}>📢 Publicidad</option>
            </select>
          </td>
          <td>${d.planType || 'MENSUAL'} (${d.expiresAt || '30 días'})</td>
          <td><span style="color:#34d399; font-weight:bold;">🟢 AUTORIZADA</span></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-action-sm renew" onclick="renameDevicePrompt('${d.deviceId}', '${d.tvName}')">✏️ Renombrar</button>
              <button class="btn-danger-sm" onclick="unlinkDeviceApi('${d.deviceId}', '${d.tvName}')">🗑️ Desvincular</button>
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
// Top 10 Loterías & Animalitos State & Engine
// ==========================================
let lotteryTop10 = [];
let selectedLotteryGameId = 'guacharo-activo';
let lotteryCarouselActive = true;
let lotteryCarouselTimer = null;
let lotteryProgressStartTime = null;
let lotteryProgressAnimFrame = null;
let lotteryPollingTimer = null;
let lotteryDisplayMode = 'carousel'; // 'carousel' | 'overview'
let lotteryStatsData = null;
let activeStatsGameId = 'guacharo-activo';
let lastAnnouncedDrawId = {};
const LOTTERY_ROTATION_INTERVAL_MS = 15000; // 15 segundos por juego

// ==========================================
// Mapa Oficial de Signos Zodiacales (Petición 6)
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
// Reloj en Tiempo Real para Pizarra (Petición 3)
// ==========================================
let lotteryClockTimer = null;
function startLotteryClock() {
  if (lotteryClockTimer) clearInterval(lotteryClockTimer);
  function updateClock() {
    const clockEl = document.getElementById('lblLotteryLiveClock');
    if (!clockEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    clockEl.innerHTML = `🕒 <strong>${timeStr}</strong>`;
  }
  updateClock();
  lotteryClockTimer = setInterval(updateClock, 1000);
}
window.startLotteryClock = startLotteryClock;

// ==========================================
// Pantalla Completa Universal (Petición 4)
// ==========================================
function toggleAppFullscreen() {
  const isCurrentlyFs = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    document.body.classList.contains('app-fullscreen-mode')
  );

  const btnLottery = document.getElementById('btnFullscreenLotteryMain');
  const btnTicker = document.querySelector('.btn-ticker-fullscreen');

  if (!isCurrentlyFs) {
    document.body.classList.add('app-fullscreen-mode');
    const docEl = document.documentElement;
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    if (req) {
      req.call(docEl).catch(err => {
        console.log('[Fullscreen] Fallback CSS activo (API denegada por navegador):', err.message);
      });
    }
    if (btnLottery) btnLottery.innerHTML = '🗗 Salir Pantalla Completa';
    if (btnTicker) btnTicker.innerHTML = '🗗 SALIR PANTALLA COMPLETA';
  } else {
    document.body.classList.remove('app-fullscreen-mode');
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) {
      exit.call(document).catch(e => console.warn(e));
    }
    if (btnLottery) btnLottery.innerHTML = '⛶ Pantalla Completa';
    if (btnTicker) btnTicker.innerHTML = '⛶ PANTALLA COMPLETA';
  }
}
window.toggleAppFullscreen = toggleAppFullscreen;

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    if (!isNativeFs && !document.body.classList.contains('app-fullscreen-mode')) {
      const btnLottery = document.getElementById('btnFullscreenLotteryMain');
      const btnTicker = document.querySelector('.btn-ticker-fullscreen');
      if (btnLottery) btnLottery.innerHTML = '⛶ Pantalla Completa';
      if (btnTicker) btnTicker.innerHTML = '⛶ PANTALLA COMPLETA';
    }
  });
});

// Audio Chime & Speech Synthesis
let audioCtx = null;
let lotteryVoiceEnabled = localStorage.getItem('visual_fx_lottery_voice') !== 'false';

function playChimeAlert() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
    osc2.frequency.setValueAtTime(659.25, now + 0.05); // E5
    osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2); // C6

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now + 0.05);
    osc1.stop(now + 0.75);
    osc2.stop(now + 0.75);
  } catch (e) {
    console.warn('[Chime Alert]', e);
  }
}

function updateVoiceButtonsUI() {
  const btnHeader = document.getElementById('btnHeaderVoiceToggle');
  const btnMain = document.getElementById('btnVoiceToggleMain');
  const icon = document.getElementById('lblVoiceIcon');
  const txt = document.getElementById('lblVoiceText');

  const textVal = lotteryVoiceEnabled ? 'Voz: ON' : 'Voz: OFF';
  const iconVal = lotteryVoiceEnabled ? '🔊' : '🔇';

  if (btnHeader) btnHeader.textContent = `${iconVal} ${textVal}`;
  if (btnMain) {
    btnMain.classList.toggle('active', lotteryVoiceEnabled);
  }
  if (icon) icon.textContent = iconVal;
  if (txt) txt.textContent = textVal;
}

function toggleLotteryVoiceAnnouncements() {
  lotteryVoiceEnabled = !lotteryVoiceEnabled;
  localStorage.setItem('visual_fx_lottery_voice', lotteryVoiceEnabled);
  updateVoiceButtonsUI();
}
window.toggleLotteryVoiceAnnouncements = toggleLotteryVoiceAnnouncements;

// Voz Humana Natural (Petición 7)
function getBestSpanishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Voces Naturales / Neurales (Edge / Windows / Chrome)
  const naturalSpanish = voices.find(v => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    return lang.startsWith('es') && (name.includes('natural') || name.includes('online') || name.includes('neural'));
  });
  if (naturalSpanish) return naturalSpanish;

  // 2. Voces Google de alta fidelidad o nombres reconocidos
  const googleSpanish = voices.find(v => {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    return lang.startsWith('es') && (name.includes('google') || name.includes('sabina') || name.includes('dalia') || name.includes('jorge') || name.includes('paulina'));
  });
  if (googleSpanish) return googleSpanish;

  // 3. Voces latinoamericanas
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
  playChimeAlert();
  setTimeout(() => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Atención. Resultado oficial de ${gameName}, sorteo de las ${drawTime}: ${resultText}.`);
      utterance.lang = 'es-VE';
      utterance.rate = 0.90; // Ritmo pausado y más natural
      utterance.pitch = 1.02; // Tono amigable y balanceado
      utterance.volume = 1.0;
      const bestVoice = getBestSpanishVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[SpeechSynthesis]', e);
    }
  }, 350);
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
        // Inicialización: marcar el más reciente sin disparar ráfaga de 10 voces
        lastAnnouncedDrawId[gKey] = drawId;
      } else if (lastAnnouncedDrawId[gKey] !== drawId) {
        lastAnnouncedDrawId[gKey] = drawId;
        const resultDesc = game.type === 'animalitos'
          ? `Número ${latest.number}, ${latest.name}`
          : `Triple A ${latest.tripleA}, Triple B ${latest.tripleB}${latest.signo ? ', Signo ' + latest.signo : ''}`;
        speakLotteryDraw(game.name, latest.time || latest.hour, resultDesc);
      }
    }
  });
}

// Barra Indicadora de Tiempo / Cuenta Regresiva en Tarjeta Destacada (Petición 5)
function startLotteryProgressBar() {
  stopLotteryProgressBar();
  if (!lotteryCarouselActive) return;
  lotteryProgressStartTime = Date.now();

  function updateProgress() {
    const elapsed = Date.now() - lotteryProgressStartTime;
    const remainingMs = Math.max(0, LOTTERY_ROTATION_INTERVAL_MS - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const pct = Math.min(100, (elapsed / LOTTERY_ROTATION_INTERVAL_MS) * 100);

    const fill = document.getElementById('heroCountdownFill');
    const lbl = document.getElementById('lblHeroCountdown');
    if (fill) fill.style.width = `${pct}%`;
    if (lbl) lbl.textContent = `${remainingSec}s`;

    if (elapsed < LOTTERY_ROTATION_INTERVAL_MS && lotteryCarouselActive) {
      lotteryProgressAnimFrame = requestAnimationFrame(updateProgress);
    }
  }
  lotteryProgressAnimFrame = requestAnimationFrame(updateProgress);
}

function stopLotteryProgressBar() {
  if (lotteryProgressAnimFrame) {
    cancelAnimationFrame(lotteryProgressAnimFrame);
    lotteryProgressAnimFrame = null;
  }
  const fill = document.getElementById('heroCountdownFill');
  const lbl = document.getElementById('lblHeroCountdown');
  if (fill) fill.style.width = '0%';
  if (lbl) lbl.textContent = '15s';
}

function startLotteryCarousel() {
  stopLotteryCarousel();
  if (!lotteryCarouselActive || lotteryDisplayMode !== 'carousel') return;

  startLotteryProgressBar();
  lotteryCarouselTimer = setTimeout(() => {
    advanceLotteryCarousel();
  }, LOTTERY_ROTATION_INTERVAL_MS);
}

function stopLotteryCarousel() {
  if (lotteryCarouselTimer) {
    clearTimeout(lotteryCarouselTimer);
    lotteryCarouselTimer = null;
  }
  stopLotteryProgressBar();
}

function advanceLotteryCarousel() {
  if (!lotteryTop10 || lotteryTop10.length === 0) return;
  const currentIndex = lotteryTop10.findIndex(g => (g.gameId || g.id) === selectedLotteryGameId);
  const nextIndex = (currentIndex + 1) % lotteryTop10.length;
  const nextGame = lotteryTop10[nextIndex];
  selectLotteryGame(nextGame.gameId || nextGame.id, false);
}

function toggleLotteryCarousel() {
  lotteryCarouselActive = !lotteryCarouselActive;
  const btn = document.getElementById('btnToggleLotteryCarousel');
  const lbl = document.getElementById('lblCarouselState');
  if (lotteryCarouselActive) {
    if (btn) {
      btn.classList.add('active');
      btn.classList.remove('paused');
    }
    if (lbl) lbl.textContent = 'Rotación: ACTIVA (15s)';
    if (lotteryDisplayMode === 'carousel') startLotteryCarousel();
  } else {
    if (btn) {
      btn.classList.remove('active');
      btn.classList.add('paused');
    }
    if (lbl) lbl.textContent = 'Rotación: EN PAUSA';
    stopLotteryCarousel();
  }
}

// Selector Desplegable de Lotería en la barra superior (Petición 2)
function updateLotteryDropdownNav() {
  const sel = document.getElementById('selLotteryGameNav');
  if (!sel || !lotteryTop10 || lotteryTop10.length === 0) return;

  const currentVal = selectedLotteryGameId;
  sel.innerHTML = lotteryTop10.map(g => {
    const gId = g.gameId || g.id;
    const icon = g.type === 'animalitos' ? '🐾' : '🎰';
    return `<option value="${gId}" ${gId === currentVal ? 'selected' : ''}>${icon} ${g.name}</option>`;
  }).join('');
}

function selectLotteryGame(gameId, userInitiated = true) {
  selectedLotteryGameId = gameId;

  // Sincronizar dropdown
  const sel = document.getElementById('selLotteryGameNav');
  if (sel && sel.value !== gameId) sel.value = gameId;

  // Auto-ajustar categoría en la pizarra según el tipo del juego seleccionado
  const game = lotteryTop10.find(g => (g.gameId || g.id) === gameId);
  if (game) {
    if (game.type === 'animalitos' && currentTimelineCategory !== 'animalitos') {
      currentTimelineCategory = 'animalitos';
      const btnAnim = document.getElementById('btnCatAnimalitos');
      const btnTrip = document.getElementById('btnCatTriples');
      if (btnAnim) btnAnim.classList.add('active');
      if (btnTrip) btnTrip.classList.remove('active');
    } else if (game.type === 'triples' && currentTimelineCategory !== 'triples') {
      currentTimelineCategory = 'triples';
      const btnAnim = document.getElementById('btnCatAnimalitos');
      const btnTrip = document.getElementById('btnCatTriples');
      if (btnAnim) btnAnim.classList.remove('active');
      if (btnTrip) btnTrip.classList.add('active');
    }
  }

  renderActiveLotteryBoard();

  if (lotteryCarouselActive && lotteryDisplayMode === 'carousel') {
    startLotteryCarousel();
  }
}
window.selectLotteryGame = selectLotteryGame;

// Pizarra Multicolumna Estilo 1000Resultados (Petición 4)
let currentTimelineCategory = 'animalitos';
function setTimelineCategory(cat) {
  currentTimelineCategory = cat;
  const btnAnim = document.getElementById('btnCatAnimalitos');
  const btnTrip = document.getElementById('btnCatTriples');
  if (btnAnim) btnAnim.classList.toggle('active', cat === 'animalitos');
  if (btnTrip) btnTrip.classList.toggle('active', cat === 'triples');
  renderPizarra1000Board();
}
window.setTimelineCategory = setTimelineCategory;

function renderPizarra1000Board() {
  const container = document.getElementById('pizarra1000Board');
  if (!container || !lotteryTop10 || lotteryTop10.length === 0) return;

  // Filtrar según la categoría activa
  let filteredGames = lotteryTop10.filter(g => {
    if (currentTimelineCategory === 'animalitos') {
      return g.type === 'animalitos';
    } else {
      return g.type === 'triples';
    }
  });

  if (filteredGames.length === 0) {
    filteredGames = lotteryTop10.slice(0, 4);
  } else if (filteredGames.length > 4) {
    filteredGames = filteredGames.slice(0, 4);
  }

  container.innerHTML = filteredGames.map(game => {
    const gId = game.gameId || game.id;
    const isCurrentActive = (gId === selectedLotteryGameId);
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.number || d.tripleA));

    const rowsHtml = draws.slice(0, 10).map(draw => {
      const isDone = !draw.isPending && (draw.number || draw.tripleA);
      const drawTime = draw.time || draw.hour || '';

      if (game.type === 'animalitos') {
        const num = isDone ? (draw.number || '--') : '--';
        const name = isDone ? (draw.name || '') : 'Esperando...';
        const img = isDone ? (draw.image || '') : '';
        return `
          <div class="pizarra-row-item ${isDone ? 'done' : ''}">
            <span class="pizarra-row-time">${drawTime}</span>
            <div class="pizarra-row-center">
              <span class="pizarra-row-num" style="${!isDone ? 'color:#64748b; font-size:1rem;' : ''}">${num}</span>
              <span class="pizarra-row-name" style="${!isDone ? 'color:#64748b; font-size:0.75rem;' : ''}">${name}</span>
            </div>
            ${img ? `<img src="${img}" class="pizarra-row-thumb" alt="${name}" onerror="this.style.display='none'">` : (isDone ? '' : '<span style="font-size:0.7rem; color:#475569;">⏳</span>')}
          </div>
        `;
      } else {
        // Triples
        const tripleA = isDone ? (draw.tripleA || '--') : '--';
        const tripleB = isDone ? (draw.tripleB || '--') : '--';
        const signo = isDone ? (draw.signo || '') : '';
        const zData = getZodiacData(signo);
        return `
          <div class="pizarra-row-item ${isDone ? 'done' : ''}">
            <span class="pizarra-row-time">${drawTime}</span>
            <div class="pizarra-row-center">
              <span class="pizarra-row-num" style="${!isDone ? 'color:#64748b; font-size:0.95rem;' : ''}">${isDone ? `A:${tripleA} B:${tripleB}` : '--'}</span>
            </div>
            ${zData ? `<img src="/images/zodiac/${zData.file}" class="pizarra-row-zodiac" title="${zData.name}" alt="${zData.name}">` : (signo ? `<span style="font-size:0.72rem; color:#f59e0b; font-weight:800;">${signo}</span>` : '')}
          </div>
        `;
      }
    }).join('');

    return `
      <div class="pizarra-col ${isCurrentActive ? 'active-game' : ''}" onclick="window.selectLotteryGame('${gId}', true)" style="cursor:pointer;" title="Click para destacar en carrusel">
        <div class="pizarra-col-header ${game.type === 'animalitos' ? 'green' : ''}">
          <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
            ${game.logoUrl ? `<img src="${game.logoUrl}" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <span>${game.name}</span>
          </div>
          <span style="font-size:0.7rem; font-weight:800; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:8px;">
            ${completed.length}/${draws.length}
          </span>
        </div>
        <div class="pizarra-rows-list">
          ${rowsHtml}
        </div>
      </div>
    `;
  }).join('');
}

async function loadLotteryTop10Data(silent = false) {
  try {
    const res = await fetch('/api/lottery/top10');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.games) {
      lotteryTop10 = data.games;

      const lblDate = document.getElementById('lblLotteryCurrentDate');
      if (lblDate && data.date) {
        const parts = data.date.split('-');
        if (parts.length === 3) {
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          const dateStr = dateObj.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
          lblDate.textContent = `📅 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}`;
        } else {
          lblDate.textContent = `📅 ${data.date}`;
        }
      }

      startLotteryClock();
      checkForNewDrawAnnouncements(lotteryTop10);
      updateLotteryDropdownNav();
      renderActiveLotteryBoard();
      if (lotteryDisplayMode === 'overview') {
        renderLotteryOverviewGrid();
      }
      updateAdminManualLotteryDropdowns();
    }
  } catch (err) {
    if (!silent) console.error('Error cargando Top 10 loterías:', err);
  }
}

function renderActiveLotteryBoard() {
  const heroCard = document.getElementById('lotteryHeroCard');
  const lblTitle = document.getElementById('lblTimelineGameTitle');
  const lblProgress = document.getElementById('lblTimelineProgress');

  if (!lotteryTop10 || lotteryTop10.length === 0) return;
  const game = lotteryTop10.find(g => (g.gameId || g.id) === selectedLotteryGameId) || lotteryTop10[0];
  if (!game) return;

  const draws = game.draws || game.results || [];
  const completedResults = draws.filter(d => !d.isPending && (d.number || d.tripleA));
  const latestResult = completedResults.length > 0 ? completedResults[completedResults.length - 1] : null;

  if (lblTitle) {
    lblTitle.textContent = `📊 Pizarra de Resultados: ${game.name}`;
  }
  if (lblProgress) {
    lblProgress.textContent = `${completedResults.length} de ${draws.length} sorteos emitidos`;
  }

  // A) RENDER HERO CARD (Con Barra de Tiempo y Fuentes Grandes - Petición 5 y 6)
  if (heroCard) {
    const typeLabel = game.type === 'animalitos' ? '🐾 RULETA DE ANIMALITOS' : '🎰 LOTERÍA DE TRIPLES';
    let heroContent = '';

    const logoHtml = game.logoUrl ? `<img src="${game.logoUrl}" class="hero-game-logo" alt="${game.name}" onerror="this.style.display='none'">` : '';

    // Barra de cuenta regresiva en tarjeta destacada
    const countdownBarHtml = `
      <div class="hero-countdown-container">
        <div class="hero-countdown-header">
          <span>⏱️ TIEMPO EN PANTALLA</span>
          <span id="lblHeroCountdown">15s</span>
        </div>
        <div class="hero-countdown-track">
          <div id="heroCountdownFill" class="hero-countdown-fill"></div>
        </div>
      </div>
    `;

    if (!latestResult) {
      const firstHour = draws.length > 0 ? (draws[0].time || draws[0].hour) : '08:00 AM';
      heroContent = `
        <span class="hero-lottery-badge">${typeLabel}</span>
        ${countdownBarHtml}
        ${logoHtml}
        <h2 style="font-size:1.6rem; font-weight:900; color:#fff; margin:6px 0 10px 0;">${game.name}</h2>
        <div style="margin:30px 0; color:#94a3b8; text-align:center;">
          <div style="font-size:3.5rem; margin-bottom:12px;">⏳</div>
          <strong style="font-size:1.1rem; color:#f1f5f9; display:block;">Sorteos de hoy en preparación</strong>
          <span style="font-size:0.9rem;">Primer sorteo programado a las <strong>${firstHour}</strong></span>
        </div>
        <div class="hero-time-footer">
          <span>Sincronización: Activa</span>
          <span>Modo: Automático (+2m)</span>
        </div>
      `;
    } else if (game.type === 'animalitos') {
      const num = latestResult.number || '--';
      const name = latestResult.name || '';
      const img = latestResult.image || '';
      const isManual = Boolean(latestResult.isManual);
      const drawTime = latestResult.time || latestResult.hour || '';

      heroContent = `
        <span class="hero-lottery-badge">${typeLabel}</span>
        ${countdownBarHtml}
        ${logoHtml}
        <h2 style="font-size:1.55rem; font-weight:900; color:#fff; margin:2px 0;">${game.name}</h2>
        
        <div class="hero-number-giant">${num}</div>
        <div class="hero-name-banner">${name}</div>

        ${img ? `
          <div class="hero-image-aura">
            <img src="${img}" alt="${name}" onerror="this.style.display='none'">
          </div>
        ` : ''}

        <div class="hero-time-footer">
          <span>🕒 Sorteo de las <strong>${drawTime}</strong></span>
          ${isManual ? '<span style="color:#f59e0b; font-weight:700;">✏️ Verificado Manual</span>' : '<span style="color:#10b981; font-weight:700;">🟢 Oficial en Vivo</span>'}
        </div>
      `;
    } else {
      // Triples (Zulia, Táchira, Chance, Zamorano) - Petición 6 con imagen oficial del signo
      const tripleA = latestResult.tripleA || '--';
      const tripleB = latestResult.tripleB || '--';
      const signo = latestResult.signo || '';
      const zData = getZodiacData(signo);
      const isManual = Boolean(latestResult.isManual);
      const drawTime = latestResult.time || latestResult.hour || '';

      heroContent = `
        <span class="hero-lottery-badge">${typeLabel}</span>
        ${countdownBarHtml}
        ${logoHtml}
        <h2 style="font-size:1.55rem; font-weight:900; color:#fff; margin:2px 0 10px 0;">${game.name}</h2>

        <div class="hero-triples-grid">
          <div class="hero-triple-box">
            <div class="hero-triple-label">TRIPLE A</div>
            <div class="hero-triple-value">${tripleA}</div>
          </div>
          <div class="hero-triple-box">
            <div class="hero-triple-label">TRIPLE B</div>
            <div class="hero-triple-value">${tripleB}</div>
          </div>
          ${signo ? `
            <div class="hero-zodiac-box">
              ${zData ? `<img src="/images/zodiac/${zData.file}" class="hero-zodiac-img" alt="${zData.name}">` : '<div style="font-size:2.2rem;">♈</div>'}
              <div class="hero-zodiac-info">
                <span class="hero-zodiac-label">SIGNO ZODIACAL / ASTRAL</span>
                <span class="hero-zodiac-name">${zData ? `${zData.symbol} ${zData.name.toUpperCase()}` : signo.toUpperCase()}</span>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="hero-time-footer" style="margin-top:auto;">
          <span>🕒 Sorteo de las <strong>${drawTime}</strong></span>
          ${isManual ? '<span style="color:#f59e0b; font-weight:700;">✏️ Verificado Manual</span>' : '<span style="color:#10b981; font-weight:700;">🟢 Oficial en Vivo</span>'}
        </div>
      `;
    }

    heroCard.innerHTML = heroContent;
  }

  // B) RENDER PIZARRA MULTICOLUMNA 1000RESULTADOS (Petición 4)
  renderPizarra1000Board();
}


// ==========================================
// Modo Selector: Carrusel vs Resumen General
// ==========================================
function setLotteryDisplayMode(mode) {
  lotteryDisplayMode = mode;
  const carouselView = document.getElementById('lotteryCarouselView');
  const overviewView = document.getElementById('lotteryOverviewView');
  const btnCarousel = document.getElementById('btnModeCarousel');
  const btnOverview = document.getElementById('btnModeOverview');
  const btnHeader = document.getElementById('btnHeaderViewMode');

  if (mode === 'overview') {
    if (carouselView) carouselView.style.display = 'none';
    if (overviewView) overviewView.style.display = 'block';
    if (btnCarousel) btnCarousel.classList.remove('active');
    if (btnOverview) btnOverview.classList.add('active');
    if (btnHeader) btnHeader.textContent = '🎠 Modo Carrusel';
    stopLotteryCarousel();
    renderLotteryOverviewGrid();
  } else {
    if (carouselView) carouselView.style.display = 'block';
    if (overviewView) overviewView.style.display = 'none';
    if (btnCarousel) btnCarousel.classList.add('active');
    if (btnOverview) btnOverview.classList.remove('active');
    if (btnHeader) btnHeader.textContent = '📋 Pizarra Resumen';
    if (lotteryCarouselActive) startLotteryCarousel();
  }
}
window.setLotteryDisplayMode = setLotteryDisplayMode;

function toggleLotteryViewMode() {
  setLotteryDisplayMode(lotteryDisplayMode === 'carousel' ? 'overview' : 'carousel');
}
window.toggleLotteryViewMode = toggleLotteryViewMode;

function renderLotteryOverviewGrid() {
  const grid = document.getElementById('lotteryOverviewGrid');
  if (!grid || !lotteryTop10 || lotteryTop10.length === 0) return;

  grid.innerHTML = lotteryTop10.map(game => {
    const draws = game.draws || game.results || [];
    const completed = draws.filter(d => !d.isPending && (d.number || d.tripleA));
    const latest = completed.length > 0 ? completed[completed.length - 1] : null;

    let latestHtml = '';
    if (!latest) {
      latestHtml = `
        <div class="overview-card-latest" style="justify-content:center; color:#94a3b8; font-size:0.85rem;">
          ⏳ Esperando primer sorteo
        </div>
      `;
    } else if (game.type === 'animalitos') {
      latestHtml = `
        <div class="overview-card-latest">
          <div>
            <div class="overview-latest-num">${latest.number || '--'}</div>
            <div class="overview-latest-name">${latest.name || ''}</div>
            <small style="color:#94a3b8; font-size:0.75rem;">🕒 ${latest.time || latest.hour}</small>
          </div>
          ${latest.image ? `<img src="${latest.image}" class="overview-latest-thumb" alt="${latest.name}" onerror="this.style.display='none'">` : ''}
        </div>
      `;
    } else {
      latestHtml = `
        <div class="overview-card-latest">
          <div>
            <div style="font-size:1.35rem; font-weight:900; color:#fff;">A: ${latest.tripleA || '--'} | B: ${latest.tripleB || '--'}</div>
            ${latest.signo ? `<div style="font-size:0.82rem; font-weight:700; color:#f59e0b;">♈ ${latest.signo}</div>` : ''}
            <small style="color:#94a3b8; font-size:0.75rem;">🕒 ${latest.time || latest.hour}</small>
          </div>
        </div>
      `;
    }

    const miniDrawsHtml = draws.slice(0, 8).map(d => {
      const isDone = !d.isPending && (d.number || d.tripleA);
      const val = isDone ? (game.type === 'animalitos' ? d.number : d.tripleA) : '--';
      return `
        <div class="overview-mini-draw" style="${isDone ? 'border-color:rgba(16,185,129,0.3);' : ''}">
          <span class="time">${d.time || d.hour}</span>
          <span class="val" style="${isDone ? 'color:#34d399;' : 'color:#64748b;'}">${val}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="overview-game-card" onclick="window.switchDirectToLotteryGame('${game.id || game.gameId}')" style="cursor:pointer;" title="Ver en pantalla grande">
        <div class="overview-card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            ${game.logoUrl ? `<img src="${game.logoUrl}" alt="${game.name}" onerror="this.style.display='none'">` : ''}
            <h4>${game.name}</h4>
          </div>
          <span style="font-size:0.7rem; font-weight:800; color:#38bdf8; background:rgba(56,189,248,0.15); padding:2px 8px; border-radius:10px;">
            ${completed.length}/${draws.length}
          </span>
        </div>
        ${latestHtml}
        <div class="overview-mini-draws">${miniDrawsHtml}</div>
      </div>
    `;
  }).join('');
}

function switchDirectToLotteryGame(gameId) {
  setLotteryDisplayMode('carousel');
  selectLotteryGame(gameId, true);
}
window.switchDirectToLotteryGame = switchDirectToLotteryGame;

// ==========================================
// Estadísticas 30D, Pronósticos y Cintillo
// ==========================================
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

  track.innerHTML = itemsHtml + itemsHtml; // Doble para loop continuo fluido
}

function openLotteryStatsModal() {
  const modal = document.getElementById('lotteryStatsModal');
  if (modal) {
    modal.style.display = 'flex';
    renderStatsGameSelector();
    renderGameStats(activeStatsGameId);
  }
}
window.openLotteryStatsModal = openLotteryStatsModal;

function closeLotteryStatsModal() {
  const modal = document.getElementById('lotteryStatsModal');
  if (modal) modal.style.display = 'none';
}
window.closeLotteryStatsModal = closeLotteryStatsModal;

function renderStatsGameSelector() {
  const container = document.getElementById('statsGameSelector');
  if (!container || !lotteryTop10) return;

  container.innerHTML = lotteryTop10.map(game => {
    const gId = game.gameId || game.id;
    const isActive = (gId === activeStatsGameId);
    return `
      <button class="stats-game-btn ${isActive ? 'active' : ''}" onclick="window.selectStatsGame('${gId}')">
        ${game.logoUrl ? `<img src="${game.logoUrl}" style="height:18px; object-fit:contain;" alt="">` : ''}
        <span>${game.name}</span>
      </button>
    `;
  }).join('');
}

function selectStatsGame(gameId) {
  activeStatsGameId = gameId;
  renderStatsGameSelector();
  renderGameStats(gameId);
}
window.selectStatsGame = selectStatsGame;

function renderGameStats(gameId) {
  const body = document.getElementById('statsModalBody');
  if (!body) return;

  const gamesDict = lotteryStatsData?.summary || lotteryStatsData?.games || {};
  if (!lotteryStatsData || !gamesDict[gameId]) {
    body.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">Cargando estadísticas de 30 días...</div>';
    return;
  }

  const gStats = gamesDict[gameId];
  const hot = gStats.hot || [];
  const cold = gStats.cold || [];
  const predictions = gStats.predictions || {};

  const hotHtml = hot.slice(0, 5).map((item, idx) => {
    const rankClass = idx === 0 ? 'r1' : (idx === 1 ? 'r2' : (idx === 2 ? 'r3' : 'rn'));
    const numVal = item.number || item.num || '--';
    const nameVal = item.name ? ` (${item.name})` : '';
    const countVal = item.occurrences || item.count || 0;
    return `
      <div class="stats-list-item">
        <div class="stats-item-left">
          <span class="stats-rank ${rankClass}">${idx + 1}</span>
          <span class="stats-num">${numVal}</span>
          <span class="stats-name">${nameVal}</span>
        </div>
        <span class="stats-badge-count hot">🔥 ${countVal} veces</span>
      </div>
    `;
  }).join('');

  const coldHtml = cold.slice(0, 5).map((item, idx) => {
    const numVal = item.number || item.num || '--';
    const nameVal = item.name ? ` (${item.name})` : '';
    const delayVal = item.daysOverdue !== undefined ? `${item.daysOverdue} días` : (item.delay ? `${item.delay} sorteos` : 'Pendiente');
    return `
      <div class="stats-list-item">
        <div class="stats-item-left">
          <span class="stats-rank rn">${idx + 1}</span>
          <span class="stats-num">${numVal}</span>
          <span class="stats-name">${nameVal}</span>
        </div>
        <span class="stats-badge-count cold">❄️ ${delayVal}</span>
      </div>
    `;
  }).join('');

  const hotPredPills = (predictions.calientes || []).map(p => {
    const n = p.number || p.num || p;
    const nm = p.name ? ` ${p.name}` : '';
    return `<span class="prediction-pill">🔥 ${n}${nm}</span>`;
  }).join('');

  const coldPredPills = (predictions.atrasados || predictions.reventar || []).map(p => {
    const n = p.number || p.num || p;
    const nm = p.name ? ` ${p.name}` : '';
    return `<span class="prediction-pill">⚡ ${n}${nm}</span>`;
  }).join('');

  const dreamPredPills = (predictions.datosFenix || predictions.fijos || []).map(p => {
    const n = p.number || p.num || p;
    const nm = p.name ? ` ${p.name}` : '';
    return `<span class="prediction-pill">🎯 ${n}${nm}</span>`;
  }).join('');

  body.innerHTML = `
    <div class="stats-grid-cards">
      <div class="stats-card-col">
        <h4 style="color:#fbbf24;">🥇 Top 5 Más Premiados (30 Días)</h4>
        <div class="stats-list">${hotHtml || '<p style="color:#64748b;">Sin datos suficientes</p>'}</div>
      </div>
      <div class="stats-card-col">
        <h4 style="color:#60a5fa;">❄️ Top 5 Atrasados (Por Reventar)</h4>
        <div class="stats-list">${coldHtml || '<p style="color:#64748b;">Sin datos suficientes</p>'}</div>
      </div>
      <div class="stats-card-col">
        <h4 style="color:#34d399;">🔮 Pronósticos Estadísticos de Hoy</h4>
        <div class="prediction-card-box">
          <div class="prediction-title">🔥 Datos Calientes Probables</div>
          <div class="prediction-numbers-row">${hotPredPills || '--'}</div>
        </div>
        <div class="prediction-card-box" style="border-color:rgba(59,130,246,0.35); background:linear-gradient(145deg, rgba(59,130,246,0.12), rgba(30,58,138,0.25));">
          <div class="prediction-title" style="color:#60a5fa;">⚡ Por Reventar (Ciclo Vencido)</div>
          <div class="prediction-numbers-row">${coldPredPills || '--'}</div>
        </div>
        <div class="prediction-card-box" style="border-color:rgba(245,158,11,0.35); background:linear-gradient(145deg, rgba(245,158,11,0.12), rgba(120,53,15,0.25));">
          <div class="prediction-title" style="color:#fbbf24;">🎯 Fijos y Sorpresas Recomendadas</div>
          <div class="prediction-numbers-row">${dreamPredPills || '--'}</div>
        </div>
      </div>
    </div>
  `;
}

function startLotteryEngineView() {
  updateVoiceButtonsUI();
  loadLotteryTop10Data();
  loadLotteryStats();
  if (lotteryCarouselActive && lotteryDisplayMode === 'carousel') {
    startLotteryCarousel();
  }
  if (!lotteryPollingTimer) {
    lotteryPollingTimer = setInterval(() => {
      loadLotteryTop10Data(true);
      loadLotteryStats();
    }, 45000);
  }
}

function stopLotteryEngineView() {
  stopLotteryCarousel();
  if (lotteryPollingTimer) {
    clearInterval(lotteryPollingTimer);
    lotteryPollingTimer = null;
  }
}

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

// D-Pad Remote Navigation & Universal Shortcuts
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    switch (e.key) {
      case '1':
        updateGridView(1);
        break;
      case '2':
        updateGridView(2);
        break;
      case '3':
        updateGridView(3);
        break;
      case '4':
        updateGridView(4);
        break;
      case 'ArrowRight':
        if (selectedService === 'loteria') {
          advanceLotteryCarousel();
          break;
        }
        if (focusedCellIndex < activeGridMode) {
          setFocusedCell(focusedCellIndex + 1);
        }
        break;
      case 'ArrowLeft':
        if (selectedService === 'loteria') {
          if (lotteryTop10.length > 0) {
            const curIdx = lotteryTop10.findIndex(g => g.id === selectedLotteryGameId);
            const prevIdx = (curIdx - 1 + lotteryTop10.length) % lotteryTop10.length;
            selectLotteryGame(lotteryTop10[prevIdx].id, true);
          }
          break;
        }
        if (focusedCellIndex > 1) {
          setFocusedCell(focusedCellIndex - 1);
        }
        break;
      case 'ArrowDown':
        if (activeGridMode >= 3 && focusedCellIndex <= 2) {
          setFocusedCell(focusedCellIndex + 2 <= activeGridMode ? focusedCellIndex + 2 : activeGridMode);
        }
        break;
      case 'ArrowUp':
        if (activeGridMode >= 3 && focusedCellIndex > 2) {
          setFocusedCell(focusedCellIndex - 2);
        }
        break;
      case 'Enter':
        if (selectedService === 'loteria') {
          toggleLotteryCarousel();
          break;
        }
        setAudioFocus(focusedCellIndex);
        break;
      case ' ':
        if (selectedService === 'loteria') {
          e.preventDefault();
          toggleLotteryCarousel();
          break;
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
        const header = document.getElementById('appHeader');
        if (header) header.classList.toggle('visible');
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


