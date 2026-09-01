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
  authorizeDevice, 
  getApprovedDevicesList,
  getAllUsers,
  createUser,
  deleteUser
} = require('./auth_device');
const { initMasterIngest, getMasterState, updateChannelSource } = require('./master_ingest');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde cualquier ubicación posible
const possiblePublicDirs = [
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'public'),
  path.join(__dirname, '..', 'public'),
  path.join(__dirname)
];

possiblePublicDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir));
  }
});

// Inicializar Ingestor Máster
initMasterIngest(CHANNELS);

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

// 1. API Autenticación de Usuario
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

// 2. API Verificación de Dispositivo / TV
app.get('/api/device/verify', (req, res) => {
  const deviceId = req.query.deviceId || req.headers['x-device-id'];
  const agencyId = req.query.agencyId || 'GLOBAL_HQ';
  const status = checkDeviceStatus(deviceId, agencyId);
  return res.json(status);
});

// 3. API Autorizar Dispositivo con PIN
app.post('/api/admin/authorize-device', (req, res) => {
  const { pin, tvName, agencyId } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'El PIN de activación es requerido.' });
  }
  const result = authorizeDevice(pin, tvName, agencyId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// 4. API Listar Dispositivos Autorizados
app.get('/api/admin/devices', (req, res) => {
  const authHeader = req.headers.authorization;
  let userRole = ROLES.SUPER_ADMIN;
  let userAgencyId = 'GLOBAL_HQ';
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (decoded) {
      userRole = decoded.role;
      userAgencyId = decoded.agencyId;
    }
  }
  return res.json({ devices: getApprovedDevicesList(userRole, userAgencyId) });
});

// 5. API Gestión de Usuarios (Exclusivo SuperAdmin)
app.get('/api/admin/users', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  return res.json({ users: getAllUsers() });
});

app.post('/api/admin/users/create', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const result = createUser(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

app.post('/api/admin/users/delete', requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
  const { username } = req.body;
  const result = deleteUser(username);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// 6. API Estado del Ingestor Máster Relay
app.get('/api/admin/master-status', (req, res) => {
  return res.json(getMasterState());
});

// 7. API Actualizar URL de Transmisión (SuperAdmin y Jefe Técnico)
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

// 8. API Lista de Canales / Hipódromos
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

// 9. API Proxy HLS de Streaming
app.get('/api/stream/proxy', (req, res) => {
  const targetUrl = req.query.url;
  const deviceId = req.query.deviceId || req.headers['x-device-id'];

  if (!targetUrl) {
    return res.status(400).send('URL de stream requerida.');
  }

  if (deviceId) {
    const devStatus = checkDeviceStatus(deviceId);
    if (devStatus.status === 'UNAUTHORIZED') {
      return res.status(403).send('Dispositivo No Autorizado para transmitir.');
    }
  }

  return handleStreamProxy(req, res, targetUrl);
});

// Evitar que peticiones /api/ caigan en el fallback de index.html (Prevención de bucle infinito)
app.all('/api/*', (req, res) => {
  return res.status(404).json({ error: 'Endpoint API no encontrado.' });
});

// Ruta Fallback para SPA (Busca index.html en todas las rutas posibles)
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
  console.log(`👥 Panel Completo de Gestión de Usuarios y Agencias Fenix listo.`);
  console.log(`====================================================`);
});
