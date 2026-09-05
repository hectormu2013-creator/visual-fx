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
  'hipica': { name: 'Carreras de Caballos', panelId: null },
  'loteria': { name: 'Resultados Loterías', panelId: 'panelLottery' },
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
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initDeviceId();
  setupEventListeners();
  setupKeyboardNavigation();
  setupAdminTabs();
  
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

  if (tabBtnClients) tabBtnClients.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (tabBtnDevices) tabBtnDevices.style.display = 'inline-block';
  if (tabBtnChannels) tabBtnChannels.style.display = isTech ? 'inline-block' : 'none';
  if (tabBtnUsers) tabBtnUsers.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (tabBtnAnalytics) tabBtnAnalytics.style.display = (isSuperAdmin || isTech) ? 'inline-block' : 'none';

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
      
      const hls = new Hls({
        enableWorker: !IS_SMART_TV, // Web Workers disable on Smart TVs to prevent thread lock/RAM crashes
        lowLatencyMode: false,
        capLevelToPlayerSize: true, // Scales stream bitrate & resolution to container dimensions
        maxBufferLength: IS_SMART_TV ? (isMultiCell ? 5 : 8) : (isMultiCell ? 10 : 25),
        maxMaxBufferLength: IS_SMART_TV ? (isMultiCell ? 10 : 15) : (isMultiCell ? 20 : 40),
        maxBufferSize: IS_SMART_TV ? (isMultiCell ? 8 * 1024 * 1024 : 12 * 1024 * 1024) : 30 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetries: 5,
        startLevel: -1,
        testBandwidth: true
      });

      hls.loadSource(targetUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (loader) loader.style.display = 'none';

        // Limit quality levels on Smart TVs if higher than 720p 30fps
        if (IS_SMART_TV && data.levels && data.levels.length > 1) {
          const safeLevels = data.levels
            .map((lvl, index) => ({ ...lvl, index }))
            .filter(lvl => (lvl.height <= 720));
          if (safeLevels.length > 0) {
            const maxSafeIndex = safeLevels[safeLevels.length - 1].index;
            hls.autoLevelCappedAt = maxSafeIndex;
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

  // Open Admin Portal Button
  elements.btnAdminModal.addEventListener('click', () => {
    if (!currentToken || !currentUser) {
      openAdminModalDirectly();
    } else {
      openExecutiveAdminModal();
    }
  });

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

// D-Pad Remote Navigation
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
        if (focusedCellIndex < activeGridMode) {
          setFocusedCell(focusedCellIndex + 1);
        }
        break;
      case 'ArrowLeft':
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
        setAudioFocus(focusedCellIndex);
        break;
      case 'f':
      case 'F':
        toggleCellFullscreen(focusedCellIndex);
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
