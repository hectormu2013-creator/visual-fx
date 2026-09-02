// App State
let currentUser = null;
let currentToken = null;
let currentDeviceId = null;
let channelCatalog = [];
let activeGridMode = 1;
let activeAudioCell = 1;
let focusedCellIndex = 1;

// HLS Player Instances
const hlsPlayers = { 1: null, 2: null, 3: null, 4: null };

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

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initDeviceId();
  setupEventListeners();
  setupKeyboardNavigation();
  setupAdminTabs();
  
  await checkDeviceAuthorization();
  checkUserSession();
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

// Device Authorization Check
async function checkDeviceAuthorization() {
  try {
    const res = await fetch(`/api/device/verify?deviceId=${currentDeviceId}`);
    const data = await res.json();
    
    if (data.status === 'APPROVED') {
      elements.unauthorizedBanner.style.display = 'none';
      elements.deviceBadgeText.textContent = `${data.device.tvName} [AUTORIZADO]`;
      if (devicePollingTimer) {
        clearInterval(devicePollingTimer);
        devicePollingTimer = null;
      }
    } else {
      elements.unauthorizedBanner.style.display = 'flex';
      elements.lblDevicePin.textContent = data.pin || 'FX-PENDING';
      elements.deviceBadgeText.textContent = `Dispositivo No Autorizado (${currentDeviceId})`;
      if (!devicePollingTimer) {
        devicePollingTimer = setInterval(checkDeviceAuthorization, 4000);
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
    currentToken = savedToken;
    currentUser = JSON.parse(savedUser);
    
    let roleBadge = '🏢 AGENCIA';
    if (currentUser.role === 'SUPER_ADMIN') roleBadge = '👑 SUPER ADMIN';
    else if (currentUser.role === 'TECH_CHIEF') roleBadge = '🛠️ JEFE TÉCNICO';

    elements.lblUserName.textContent = `${currentUser.name} (${roleBadge})`;
    elements.loginModal.style.display = 'none';
  } else {
    elements.loginModal.style.display = 'flex';
  }
}

// User Login
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
    } else {
      elements.loginError.textContent = data.error || 'Credenciales inválidas.';
      elements.loginError.style.display = 'block';
    }
  } catch (err) {
    elements.loginError.textContent = 'Error de conexión con el servidor.';
    elements.loginError.style.display = 'block';
  }
});

// Logout handler
function handleLogout() {
  localStorage.removeItem('visual_fx_token');
  localStorage.removeItem('visual_fx_user');
  location.reload();
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
  const cell = document.getElementById(`cell-${cellNum}`);
  const wrapper = cell.querySelector('.video-wrapper');
  if (!wrapper) return;

  if (hlsPlayers[cellNum]) {
    hlsPlayers[cellNum].destroy();
    hlsPlayers[cellNum] = null;
  }

  wrapper.innerHTML = `
    <iframe src="${iframeUrl}" style="width:100%; height:100%; border:none;" allowfullscreen allow="autoplay"></iframe>
  `;
}

// Play HLS Stream with Smart Fallback & TV Performance Optimization
function playStreamInCell(cellNum, proxyUrl, rawStreamUrl) {
  const cell = document.getElementById(`cell-${cellNum}`);
  const wrapper = cell.querySelector('.video-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <video id="video-${cellNum}" autoplay muted playsinline style="width:100%; height:100%; object-fit:contain; transform: translateZ(0); -webkit-transform: translateZ(0);"></video>
    <div class="video-loader" id="loader-${cellNum}"><div class="spinner"></div><span>Conectando Señal HD...</span></div>
  `;

  const video = document.getElementById(`video-${cellNum}`);
  const loader = document.getElementById(`loader-${cellNum}`);

  if (hlsPlayers[cellNum]) {
    hlsPlayers[cellNum].destroy();
    hlsPlayers[cellNum] = null;
  }

  const primaryUrl = `${proxyUrl}&deviceId=${currentDeviceId}`;

  function startHls(targetUrl, isFallback = false) {
    if (Hls.isSupported()) {
      const isMultiCell = activeGridMode > 1;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // Smart TV TV browser optimization for maximum fluidity without stuttering
        capLevelToPlayerSize: isMultiCell, // Auto-balance resolution in multi-channel grid to prevent TV GPU overload
        maxBufferLength: isMultiCell ? 10 : 25,
        maxMaxBufferLength: isMultiCell ? 20 : 40,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 3,
        nudgeMaxRetries: 5
      });

      hls.loadSource(targetUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (loader) loader.style.display = 'none';
        video.play().catch(e => console.log('Auto-play defer:', e));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('Network error in HLS, recovering...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('Media error in HLS, recovering media...');
              hls.recoverMediaError();
              break;
            default:
              if (!isFallback && rawStreamUrl) {
                hls.destroy();
                startHls(rawStreamUrl, true);
              } else {
                hls.destroy();
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

// Grid Layout Matrix Switcher
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
      if (hlsPlayers[cellNum]) {
        hlsPlayers[cellNum].destroy();
        hlsPlayers[cellNum] = null;
      }
    }
  });

  if (focusedCellIndex > gridCount) {
    setFocusedCell(1);
  }
}

// Audio Focus
function setAudioFocus(targetCellNum) {
  activeAudioCell = targetCellNum;
  
  [1, 2, 3, 4].forEach(num => {
    const video = document.getElementById(`video-${num}`);
    const btnAudio = document.getElementById(`btnAudio${num}`);
    
    if (video) {
      video.muted = (num !== targetCellNum);
    }
    
    if (btnAudio) {
      if (num === targetCellNum) {
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
function setupAdminTabs() {
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');
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
    if (btnAudio) btnAudio.addEventListener('click', () => setAudioFocus(num));

    const btnFs = document.getElementById(`btnFullscreen${num}`);
    if (btnFs) btnFs.addEventListener('click', () => toggleCellFullscreen(num));

    const cell = document.getElementById(`cell-${num}`);
    if (cell) {
      cell.addEventListener('click', () => {
        setFocusedCell(num);
        setAudioFocus(num);
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

  // Open Admin Portal Modal
  elements.btnAdminModal.addEventListener('click', async () => {
    elements.deviceModal.style.display = 'flex';
    
    // Ocultar/Mostrar pestañas según Rol del Usuario
    const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
    const isTech = isSuperAdmin || (currentUser && currentUser.role === 'TECH_CHIEF');

    const tabUsersBtn = document.getElementById('tabBtnUsers');
    if (tabUsersBtn) tabUsersBtn.style.display = isSuperAdmin ? 'block' : 'none';

    const tabChannelsBtn = document.getElementById('tabBtnChannels');
    if (tabChannelsBtn) tabChannelsBtn.style.display = isTech ? 'block' : 'none';

    // Cargar datos
    await loadApprovedDevicesList();
    if (isTech) populateAdminChannelsTable();
    if (isSuperAdmin) await loadSystemUsersList();
  });

  // Activate TV
  elements.btnSubmitActivation.addEventListener('click', async () => {
    const pin = elements.txtActivationPin.value.trim();
    const tvName = elements.txtTvName.value.trim();
    if (!pin) return;
    
    try {
      const res = await fetch('/api/admin/authorize-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, tvName, agencyId: currentUser?.agencyId || 'GLOBAL_HQ' })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        elements.activationMsg.style.color = '#34d399';
        elements.activationMsg.textContent = `¡Televisor ${data.deviceId} Activado con Éxito!`;
        elements.txtActivationPin.value = '';
        elements.txtTvName.value = '';
        await loadApprovedDevicesList();
        await checkDeviceAuthorization();
      } else {
        elements.activationMsg.style.color = '#fca5a5';
        elements.activationMsg.textContent = data.error || 'Error de activación.';
      }
    } catch (e) {
      elements.activationMsg.textContent = 'Error de comunicación.';
    }
  });

  // Create User
  const btnCreateUser = document.getElementById('btnCreateUser');
  if (btnCreateUser) {
    btnCreateUser.addEventListener('click', async () => {
      const username = document.getElementById('newTxtUsername').value.trim();
      const pass = document.getElementById('newTxtPassword').value.trim();
      const name = document.getElementById('newTxtName').value.trim();
      const role = document.getElementById('newSelRole').value;
      const msg = document.getElementById('userCreateMsg');

      if (!username || !pass || !name) {
        msg.style.color = '#fca5a5';
        msg.textContent = 'Por favor complete todos los campos.';
        return;
      }

      try {
        const res = await fetch('/api/admin/users/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ username, pass, name, role, agencyId: username.toUpperCase() })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          msg.style.color = '#34d399';
          msg.textContent = `¡Usuario ${username} creado exitosamente!`;
          document.getElementById('newTxtUsername').value = '';
          document.getElementById('newTxtPassword').value = '';
          document.getElementById('newTxtName').value = '';
          await loadSystemUsersList();
        } else {
          msg.style.color = '#fca5a5';
          msg.textContent = data.error || 'Error creando usuario.';
        }
      } catch (e) {
        msg.textContent = 'Error de conexión.';
      }
    });
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

  elements.btnCloseDeviceModal.addEventListener('click', () => {
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

// Populate Admin Channels Table
function populateAdminChannelsTable() {
  const tableBody = elements.adminChannelsTableBody;
  const select = document.getElementById('selAdminChannel');
  if (!tableBody) return;

  tableBody.innerHTML = '';
  if (select) select.innerHTML = '';

  channelCatalog.forEach(c => {
    if (select) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.flag} ${c.name}`;
      select.appendChild(opt);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.flag} ${c.name}</strong></td>
      <td>${c.location}</td>
      <td><span class="badge-role tech">${c.type.toUpperCase()}</span></td>
      <td><span style="color:#34d399; font-weight:bold;">🟢 EN VIVO</span></td>
      <td style="font-family:var(--font-code); font-size:0.75rem; color:var(--text-muted); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${c.streamUrl || c.iframeUrl}
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// Render Approved Devices Table
async function loadApprovedDevicesList() {
  try {
    const res = await fetch('/api/admin/devices');
    const data = await res.json();
    
    const tableBody = elements.approvedDeviceTableBody;
    if (!tableBody) return;

    tableBody.innerHTML = '';
    (data.devices || []).forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>📺 ${d.tvName}</strong></td>
        <td><code>${d.deviceId}</code></td>
        <td>${d.agencyId}</td>
        <td>${d.registeredAt}</td>
        <td><span style="color:#34d399; font-weight:bold;">AUTORIZADO</span></td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error cargando lista de dispositivos:', e);
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
      let roleHtml = '<span class="badge-role agency">🏢 Encargado Agencia</span>';
      if (u.role === 'SUPER_ADMIN') roleHtml = '<span class="badge-role super">👑 Super Admin</span>';
      else if (u.role === 'TECH_CHIEF') roleHtml = '<span class="badge-role tech">🛠️ Jefe Técnico</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>@${u.username}</strong></td>
        <td>${u.name}</td>
        <td>${roleHtml}</td>
        <td>${u.location}</td>
        <td>
          ${u.username !== 'hector_owner' ? `<button class="btn-danger-sm" onclick="deleteSystemUser('${u.username}')">ELIMINAR</button>` : '<span style="color:var(--text-muted); font-size:0.75rem;">Protegido</span>'}
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
    const res = await fetch('/api/admin/users/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (data.success) {
      await loadSystemUsersList();
    } else {
      alert(data.error || 'Error al eliminar usuario');
    }
  } catch (e) {
    alert('Error de conexión');
  }
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
