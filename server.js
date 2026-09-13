const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const CHANNELS = require('./channels');
const { handleStreamProxy } = require('./stream_proxy');
const { 
  ROLES, 
  loginUser, 
  verifyToken, 
  checkDeviceStatus, 
  getAllClients,
  createClient,
  updateClient,
  toggleClientStatus,
  deleteClient,
  authorizeDeviceForClient,
  deleteDevice,
  renameDevice,
  setDefaultService,
  getApprovedDevicesList,
  getSystemAnalytics,
  getAllUsers,
  createSystemUser,
  deleteSystemUser,
  DEFAULT_SCREEN_CONFIG,
  getDeviceConfig,
  updateDeviceConfig,
  batchUpdateDeviceConfig,
  cloneDeviceConfig,
  createDeviceAccount,
  getDeviceAccounts,
  deleteDeviceAccount,
  updateDevicePassword,
  kickDeviceSession
} = require('./auth_device');
const { initMasterIngest, getMasterState, updateChannelSource } = require('./master_ingest');
const {
  TOP_10_GAMES,
  initLotteryEngine,
  getTop10Results,
  setManualResult,
  syncAllTop10,
  getVenezuelaDateString,
  getLotteryCatalog,
  addLotteryToCatalog,
  updateLotteryInCatalog,
  deleteLotteryFromCatalog
} = require('./lottery_engine');
const {
  getHotNumbers,
  getColdNumbers,
  getDailyPredictions,
  generateTickerFeed,
  getFullGameAnalytics,
  getGameHistory,
  queryHistoricalDraws,
  getHistoryOverview
} = require('./lottery_stats');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());

// Anti-Cache Middleware para forzar la actualización inmediata en Smart TVs y navegadores
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Servir archivos estáticos desde cualquier ubicación posible
const possiblePublicDirs = [
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'public'),
  path.join(__dirname, '..', 'public'),
  path.join(__dirname)
];

possiblePublicDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir, { etag: false, lastModified: false }));
  }
});

// Endpoint de Descarga Directa para la APK Android TV / FireStick (/app)
app.get(['/app', '/download/apk', '/visual-fx-tv.apk'], (req, res) => {
  const possibleApkPaths = [
    path.join(__dirname, 'public', 'visual-fx-tv.apk'),
    path.join(__dirname, 'android-tv-app', 'app', 'build', 'outputs', 'apk', 'release', 'visual-fx-tv.apk'),
    path.join(process.cwd(), 'android-tv-app', 'app', 'build', 'outputs', 'apk', 'release', 'visual-fx-tv.apk')
  ];
  for (const apkPath of possibleApkPaths) {
    if (fs.existsSync(apkPath)) {
      return res.download(apkPath, 'visual-fx-tv.apk');
    }
  }
  return res.redirect('https://github.com/hectormu2013-creator/visual-fx/releases/download/v1.0-tv/visual-fx-tv.apk');
});

// Inicializar Ingestor Máster y Motor de Loterías
initMasterIngest(CHANNELS);
initLotteryEngine();

// Middleware para verificar Roles
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Requiere Token de Acceso.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ 
        error: `Acceso Denegado. Se requiere rol: ${allowedRoles.join(' o ')}.` 
      });
    }
    req.user = decoded;
    next();
  };
}

// Rutas de Landing Page y Acceso
app.get(['/landing', '/login'], (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// 1. API Autenticación de Usuario (Super Admin & Clientes)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Debe proveer usuario y contraseña.' });
  }
  const result = loginUser(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  return res.json(result);
});

// 2. API Verificación de Dispositivo / TV (Heartbeat & Telemetría)
app.get('/api/device/verify', (req, res) => {
  const deviceId = req.query.deviceId || req.headers['x-device-id'];
  const activeService = req.query.activeService || 'hipica';
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '190.202.10.12';

  let decodedUser = null;
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.split(' ')[1] 
    : (req.query.token || null);

  if (token) {
    decodedUser = verifyToken(token);
  }
  
  const status = checkDeviceStatus(deviceId, activeService, clientIp, decodedUser);
  return res.json(status);
});

// ==========================================
// RUTAS DE GESTIÓN DE CLIENTES (SUPER ADMIN)
// ==========================================

// Listar todos los clientes con conteo de dispositivos
app.get('/api/admin/clients', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  return res.json({ clients: getAllClients() });
});

// Crear nuevo Cliente con ficha de cupos
app.post('/api/admin/clients', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = createClient(req.body);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Actualizar ficha de Cliente (cupos, plan, contraseña)
app.put('/api/admin/clients/:id', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = updateClient(req.params.id, req.body);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Suspender o Reactivar Cliente
app.post('/api/admin/clients/toggle-status', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const { clientId } = req.body;
  const result = toggleClientStatus(clientId);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Eliminar Cliente
app.delete('/api/admin/clients/:id', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = deleteClient(req.params.id);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Modificar Cupo de Pantallas de un Cliente (Super Admin)
app.post('/api/admin/clients/:id/quota', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const { maxDevices } = req.body;
  if (!maxDevices) return res.status(400).json({ error: 'Cupo de pantallas requerido.' });
  const result = updateClient(req.params.id, { maxDevices: parseInt(maxDevices) });
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// ==========================================
// RUTAS DE ACTIVACIÓN Y DISPOSITIVOS (CLIENTE / ENCARGADO)
// ==========================================

// Activar Pantalla con Código de 6 Dígitos y Nombre Único
app.post('/api/client/activate-device', (req, res) => {
  const authHeader = req.headers.authorization;
  let clientId = req.body.clientId;
  let userRole = ROLES.CLIENT_MANAGER;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      if (userRole === ROLES.CLIENT_MANAGER) {
        clientId = decoded.clientId;
      }
    }
  }

  // Si no hay token o no se especificó cliente, por defecto asignar a 'fenix'
  if (!clientId) clientId = 'fenix';

  const { tvName, username, password, defaultService, cloneFromDeviceId } = req.body;
  const targetUser = username || tvName;
  const targetPass = password || 'tv1234';
  if (!targetUser) {
    return res.status(400).json({ error: 'El nombre o usuario de pantalla es requerido.' });
  }

  const result = createDeviceAccount(targetUser, targetPass, clientId, tvName, defaultService, cloneFromDeviceId);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Listar Dispositivos (Filtrados por Cliente si es Encargado, o Todos/Filtrados si es Super Admin)
app.get('/api/admin/devices', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;
  const filterClientId = req.query.clientId || null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }
  return res.json({ devices: getApprovedDevicesList(userRole, clientId, filterClientId) });
});

// Obtener Configuración de una Pantalla
app.get('/api/device/:id/config', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = getDeviceConfig(req.params.id, clientId, userRole);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

// Guardar Configuración de una Pantalla Individual
app.post('/api/device/:id/config', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = updateDeviceConfig(req.params.id, req.body, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Guardar Configuración en Lote (Uno, Varios o Todos los Dispositivos)
app.post('/api/client/devices/batch-config', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const { deviceIds, configUpdates, config, applyToAll } = req.body;
  const updates = configUpdates || config || {};
  const result = batchUpdateDeviceConfig(deviceIds, updates, clientId, userRole, Boolean(applyToAll));
  if (!result.success) return res.status(400).json(result);
  return res.json({ success: true, message: `Configuración aplicada exitosamente a ${result.updatedCount || 0} pantalla(s).`, ...result });
});

// Clonar / Exportar Configuración de Pantalla
app.post('/api/client/devices/clone-config', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const { sourceDeviceId, targetDeviceIds } = req.body;
  if (!sourceDeviceId || !targetDeviceIds) {
    return res.status(400).json({ error: 'sourceDeviceId y targetDeviceIds son obligatorios.' });
  }

  const result = cloneDeviceConfig(sourceDeviceId, targetDeviceIds, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json({ success: true, message: `Configuración clonada exitosamente a ${result.updatedCount || 0} pantalla(s).`, ...result });
});

// Renombrar Dispositivo (asegura nombre único)
app.post('/api/client/devices/rename', (req, res) => {
  const authHeader = req.headers.authorization;
  let clientId = null;
  let userRole = ROLES.SUPER_ADMIN;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const { deviceId, newName } = req.body;
  const result = renameDevice(deviceId, newName, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Eliminar / Desvincular Dispositivo (Libera 1 cupo de pantalla)
app.delete('/api/client/devices/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  let clientId = null;
  let userRole = ROLES.SUPER_ADMIN;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = deleteDevice(req.params.id, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// ==========================================
// RUTAS DE GESTIÓN DE CUENTAS DE PANTALLAS (Petición 4)
// ==========================================

// Listar Cuentas de Pantallas
app.get('/api/client/device-accounts', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const accounts = getDeviceAccounts(userRole, clientId);
  return res.json({ accounts });
});

// Crear Nueva Cuenta para Pantalla / TV
app.post(['/api/client/device-accounts', '/api/client/devices'], (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const { username, password, tvName, targetClientId, defaultService, cloneFromDeviceId } = req.body;
  const effectiveClientId = (userRole === ROLES.SUPER_ADMIN && targetClientId) ? targetClientId : clientId;
  if (!effectiveClientId) {
    return res.status(400).json({ error: 'Debe especificar el cliente al que pertenecerá la pantalla.' });
  }

  const result = createDeviceAccount(username, password, effectiveClientId, tvName, defaultService, cloneFromDeviceId);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Cambiar Contraseña de Pantalla
app.put(['/api/client/device-accounts/:username/password', '/api/client/devices/:username/password'], (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = updateDevicePassword(req.params.username, req.body.password, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Desconectar / Expulsar Sesión de Pantalla Remotamente (Control de Concurrencia)
app.post(['/api/client/device-accounts/:username/kick', '/api/client/devices/:username/kick'], (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = kickDeviceSession(req.params.username, clientId, userRole);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Eliminar Cuenta de Pantalla
app.delete(['/api/client/device-accounts/:username', '/api/client/devices/:username'], (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const result = deleteDeviceAccount(req.params.username, userRole, clientId);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Establecer Servicio de Inicio por Defecto de una Pantalla
app.post('/api/device/set-default-service', (req, res) => {
  const { deviceId, defaultService } = req.body;
  if (!deviceId || !defaultService) {
    return res.status(400).json({ error: 'ID de dispositivo y servicio de inicio son requeridos.' });
  }
  const result = setDefaultService(deviceId, defaultService);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Analíticas y Monitoreo de Pantallas en Vivo (con filtro por Cliente para Super Admin)
app.get('/api/admin/analytics', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let clientId = null;
  const filterClientId = req.query.clientId || null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      clientId = decoded.clientId;
    }
  }

  const analytics = getSystemAnalytics(userRole, clientId, filterClientId);
  return res.json(analytics);
});

// ==========================================
// GESTIÓN DE USUARIOS Y ROLES (SUPER ADMIN)
// ==========================================

// Listar todos los usuarios del sistema
app.get('/api/admin/users', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  return res.json({ users: getAllUsers() });
});

// Crear nuevo usuario con rol específico
app.post('/api/admin/users', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = createSystemUser(req.body);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// Eliminar usuario
app.delete('/api/admin/users/:username', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = deleteSystemUser(req.params.username);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// ==========================================
// MASTER CONTROL DE HIPÓDROMOS (SUPER ADMIN & TÉCNICO)
// ==========================================

// Estado del Ingestor Máster Relay
app.get('/api/admin/master-status', (req, res) => {
  return res.json(getMasterState());
});

// Agregar nuevo Hipódromo al Catálogo Máster
app.post('/api/admin/channels/add', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  const { name, flag, location, streamUrl, type } = req.body;
  if (!name || !streamUrl) {
    return res.status(400).json({ error: 'Nombre del hipódromo y URL de transmisión son obligatorios.' });
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const existing = CHANNELS.find(c => c.id === id);
  if (existing) {
    return res.status(400).json({ error: `Ya existe un canal con identificador "${id}".` });
  }

  const newChannel = {
    id,
    name,
    flag: flag || '🏇',
    location: location || 'Internacional',
    type: type || 'hls',
    onAir: true,
    streamUrl,
    iframeUrl: streamUrl,
    nextRace: 'En Vivo'
  };

  CHANNELS.push(newChannel);
  console.log(`📡 [Master Ingest] Nuevo hipódromo agregado: ${name} (${id})`);
  return res.json({ success: true, channel: newChannel, total: CHANNELS.length });
});

// Eliminar Hipódromo del Catálogo
app.delete('/api/admin/channels/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  const index = CHANNELS.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Hipódromo no encontrado.' });
  }

  const removed = CHANNELS.splice(index, 1)[0];
  console.log(`🗑️ [Master Ingest] Hipódromo eliminado: ${removed.name}`);
  return res.json({ success: true, message: `Hipódromo "${removed.name}" eliminado del catálogo.` });
});

// Pausar o Reactivar Señal de Hipódromo (Toggle On/Off Air)
app.post('/api/admin/channels/toggle', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  const { channelId } = req.body;
  const ch = CHANNELS.find(c => c.id === channelId);
  if (!ch) return res.status(404).json({ error: 'Hipódromo no encontrado.' });

  ch.onAir = !ch.onAir;
  return res.json({ success: true, channelId, onAir: ch.onAir });
});

// Actualizar URL de Transmisión (SuperAdmin y Jefe Técnico)
app.post('/api/admin/channels/update', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  const { channelId, streamUrl, type } = req.body;
  if (!channelId || !streamUrl) {
    return res.status(400).json({ error: 'channelId y streamUrl son requeridos.' });
  }

  const ch = CHANNELS.find(c => c.id === channelId);
  if (!ch) {
    return res.status(404).json({ error: 'Hipódromo no encontrado.' });
  }

  ch.streamUrl = streamUrl;
  ch.iframeUrl = streamUrl;
  if (type) ch.type = type;

  updateChannelSource(channelId, streamUrl, type || ch.type);
  console.log(`👤 Usuario [${req.user.name} - ${req.user.role}] actualizó el canal '${ch.name}' a: ${streamUrl}`);

  return res.json({ success: true, message: `Canal ${ch.name} actualizado por ${req.user.name}.`, channel: ch });
});

// Lista de Canales / Hipódromos
app.get('/api/channels', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';
  
  const mappedChannels = CHANNELS.map(ch => ({
    ...ch,
    proxyUrl: `${protocol}://${host}/api/stream/proxy?url=${encodeURIComponent(ch.streamUrl || ch.iframeUrl)}`
  }));

  return res.json({
    total: mappedChannels.length,
    channels: mappedChannels
  });
});

// Proxy HLS de Streaming
app.get('/api/stream/proxy', (req, res) => {
  const targetUrl = req.query.url;
  const deviceId = req.query.deviceId || req.headers['x-device-id'];
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.split(' ')[1] 
    : (req.query.token || null);

  if (!targetUrl) {
    return res.status(400).send('URL de stream requerida.');
  }

  let decodedUser = null;
  if (token) {
    decodedUser = verifyToken(token);
  }

  // Super Admin y Clientes autenticados transmiten sin restricción de hardware
  if (decodedUser && (decodedUser.role === ROLES.SUPER_ADMIN || decodedUser.role === ROLES.CLIENT_MANAGER)) {
    return handleStreamProxy(req, res, targetUrl);
  }

  if (deviceId) {
    const devStatus = checkDeviceStatus(deviceId, 'hipica', null, decodedUser);
    if (devStatus.status === 'UNAUTHORIZED' || devStatus.status === 'SUSPENDED' || devStatus.status === 'EXPIRED') {
      return res.status(403).send('Dispositivo No Autorizado para transmitir.');
    }
  }

  return handleStreamProxy(req, res, targetUrl);
});

// ==========================================
// RUTAS DE LOTERÍAS Y ANIMALITOS (TOP 10 OFICIAL)
// ==========================================
// 1. Obtener Pizarra del Día (Resultados Top 10 y Catálogo)
app.get('/api/lottery/top10', (req, res) => {
  return res.json({
    success: true,
    date: getVenezuelaDateString(),
    games: getTop10Results()
  });
});

// 1.1 Catálogo Maestro de Loterías (Editable)
app.get('/api/lottery/catalog', (req, res) => {
  return res.json({
    success: true,
    catalog: getLotteryCatalog()
  });
});

app.post('/api/lottery/catalog', requireRoles(ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER, ROLES.TECH_CHIEF), (req, res) => {
  const result = addLotteryToCatalog(req.body);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

app.put('/api/lottery/catalog/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER, ROLES.TECH_CHIEF), (req, res) => {
  const result = updateLotteryInCatalog(req.params.id, req.body);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

app.delete('/api/lottery/catalog/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.CLIENT_MANAGER, ROLES.TECH_CHIEF), (req, res) => {
  const result = deleteLotteryFromCatalog(req.params.id);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

app.post('/api/lottery/sync-all', (req, res) => {
  syncAllTop10();
  return res.json({ success: true, message: 'Sincronización completa de loterías en proceso.' });
});

// 2. Registro Manual de Emergencia (SuperAdmin y Jefe Técnico)
app.post('/api/admin/lottery/manual', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), (req, res) => {
  const gameId = req.body.gameId;
  const time = req.body.time || req.body.hour;
  const number = req.body.number || req.body.result?.number;
  const name = req.body.name || req.body.result?.name;
  const tripleA = req.body.tripleA || req.body.result?.tripleA;
  const tripleB = req.body.tripleB || req.body.result?.tripleB;
  const tripleC = req.body.tripleC || req.body.result?.tripleC;
  const signo = req.body.signo || req.body.result?.signo;

  if (!gameId || !time) {
    return res.status(400).json({ error: 'gameId y time son obligatorios.' });
  }
  const result = setManualResult({ gameId, time, number, name, tripleA, tripleB, tripleC, signo });
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

// 3. Forzar sincronización inmediata (SuperAdmin y Jefe Técnico)
app.post('/api/admin/lottery/sync-now', requireRoles(ROLES.SUPER_ADMIN, ROLES.TECH_CHIEF), async (req, res) => {
  try {
    await syncAllTop10();
    return res.json({ success: true, message: 'Sincronización forzada completada con éxito.', games: getTop10Results() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 4. Estadísticas y Pronósticos 30 Días & Ticker Feed (Catálogo Completo)
app.get('/api/lottery/stats', (req, res) => {
  try {
    const catalog = getLotteryCatalog();
    const ticker = generateTickerFeed(catalog);
    const summary = {};
    for (const g of catalog) {
      summary[g.id] = {
        name: g.name,
        shortName: g.shortName,
        logoUrl: g.logoUrl,
        icon: g.icon,
        type: g.type,
        hot: getHotNumbers(g.id, 5),
        cold: getColdNumbers(g.id, 5),
        predictions: getDailyPredictions(g.id)
      };
    }
    return res.json({ success: true, ticker, summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4.1 Análisis Estadístico Profundo de una Lotería
app.get('/api/lottery/stats/:gameId', (req, res) => {
  try {
    const { gameId } = req.params;
    const analytics = getFullGameAnalytics(gameId);
    return res.json({ success: true, analytics });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4.2 Resumen Global de la Base de Datos Histórica (30 Días Persistidos)
app.get('/api/lottery/history', (req, res) => {
  try {
    const overview = getHistoryOverview();
    return res.json({ success: true, ...overview });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4.3 Consultas Avanzadas al Histórico (Por Número, Fechas, Sorteos)
app.get('/api/lottery/history/query', (req, res) => {
  try {
    const { gameId, number, dateFrom, dateTo, limit } = req.query;
    const results = queryHistoricalDraws({
      gameId,
      number,
      dateFrom,
      dateTo,
      limit: parseInt(limit) || 50
    });
    return res.json({ success: true, count: results.length, query: req.query, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4.4 Historial Cronológico Detallado de una Lotería
app.get('/api/lottery/history/:gameId', (req, res) => {
  try {
    const { gameId } = req.params;
    const { days, date } = req.query;
    const historyData = getGameHistory(gameId, { days, date });
    return res.json({ success: true, ...historyData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RUTAS DE DESCARGA DE APK (ANDROID TV / FIRESTICK)
// ==========================================
const GITHUB_APK_RELEASE_URL = 'https://github.com/hectormu2013-creator/visual-fx/releases/download/v1.0-tv/visual-fx-tv.apk';

// 1. Descarga directa para la app "Downloader" en FireStick y Android TV (URL corta: /app)
app.get(['/app', '/download/app', '/visual-fx-tv.apk'], (req, res) => {
  const localApk = path.join(__dirname, 'public', 'downloads', 'visual-fx-tv.apk');
  if (fs.existsSync(localApk)) {
    return res.download(localApk, 'visual-fx-tv.apk');
  }
  // Redirección HTTP 302 directa al Release del APK compilado en GitHub
  return res.redirect(GITHUB_APK_RELEASE_URL);
});

// 2. Página web de descarga e instrucciones guiadas
app.get('/download', (req, res) => {
  const downloadPage = path.join(__dirname, 'public', 'download.html');
  if (fs.existsSync(downloadPage)) {
    return res.sendFile(downloadPage);
  }
  return res.redirect(GITHUB_APK_RELEASE_URL);
});

// Ruta Fallback para SPA
app.get('*', (req, res) => {
  const candidates = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(process.cwd(), 'index.html')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return res.sendFile(candidate);
    }
  }
  return res.status(404).send('Visual-FX UI no encontrada.');
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor Visual-FX activo en el puerto ${PORT}`);
  console.log(`👑 Estructura Jerárquica: Super Admin -> Clientes -> Dispositivos`);
  console.log(`====================================================`);
});
