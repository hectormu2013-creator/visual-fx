const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'visual_fx_fenix_secret_key_2026';

// Jerarquía de Roles
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',         // Héctor: Control total, crea y gestiona Clientes
  CLIENT_MANAGER: 'CLIENT_MANAGER',   // Encargado de Cliente (Fenix, Fenix 2023, etc.): Gestiona sus dispositivos
  TECH_CHIEF: 'TECH_CHIEF'            // Jefe Técnico / Soporte
};

// Base de datos de Usuarios del Sistema (Super Admin y Soporte)
const hectorSuperAdmin = {
  username: 'hector_owner',
  name: 'Héctor (Super Administrador)',
  passwords: ['admin2026', 'fenix2026'],
  role: ROLES.SUPER_ADMIN,
  location: 'Sede Principal'
};

const USERS = {
  'hector_owner': hectorSuperAdmin,
  'hector_superadmin': hectorSuperAdmin,
  'hector': hectorSuperAdmin,
  'superadmin': hectorSuperAdmin,
  'jefe_tecnico': {
    username: 'jefe_tecnico',
    name: 'Soporte Técnico Visual-FX',
    passwords: ['soporte2026'],
    role: ROLES.TECH_CHIEF,
    location: 'Centro de Operaciones'
  }
};

// Base de datos en Memoria y Persistencia en Disco
const DATA_DIR = path.join(__dirname, 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

const CLIENTS = new Map();
const APPROVED_DEVICES = new Map();
const PENDING_ACTIVATIONS = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('No se pudo crear el directorio data:', e);
    }
  }
}

function saveDatabase() {
  ensureDataDir();
  try {
    const clientsArr = Array.from(CLIENTS.values());
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clientsArr, null, 2), 'utf8');

    const devicesArr = Array.from(APPROVED_DEVICES.entries());
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devicesArr, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando base de datos en disco:', e);
  }
}

function loadDatabase() {
  ensureDataDir();

  // 1. Cargar Clientes desde JSON si existe
  try {
    if (fs.existsSync(CLIENTS_FILE)) {
      const raw = fs.readFileSync(CLIENTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        CLIENTS.clear();
        for (const item of parsed) {
          if (item && item.clientId) {
            CLIENTS.set(item.clientId, item);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error leyendo clients.json:', e);
  }

  // Asegurar clientes por defecto (Fenix y Fenix 2023)
  if (!CLIENTS.has('fenix')) {
    CLIENTS.set('fenix', {
      clientId: 'fenix',
      name: 'Fenix',
      managerUsername: 'fenix',
      managerName: 'Encargado Fenix',
      pass: 'fenix123',
      maxDevices: 4,
      planType: 'MONTHLY',
      expiresAt: '2026-12-31',
      status: 'ACTIVE',
      createdAt: '2026-08-28'
    });
  }

  if (!CLIENTS.has('fenix2023')) {
    CLIENTS.set('fenix2023', {
      clientId: 'fenix2023',
      name: 'Fenix 2023',
      managerUsername: 'fenix2023',
      managerName: 'Encargado Fenix 2023',
      pass: 'fenix2023',
      maxDevices: 4,
      planType: 'MONTHLY',
      expiresAt: '2026-12-31',
      status: 'ACTIVE',
      createdAt: '2026-08-28'
    });
  }

  // 2. Cargar Dispositivos desde JSON si existe
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        APPROVED_DEVICES.clear();
        for (const [id, dev] of parsed) {
          if (id && dev) {
            APPROVED_DEVICES.set(id, dev);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error leyendo devices.json:', e);
  }

  // Asegurar pantallas demo por defecto
  if (!APPROVED_DEVICES.has('TV-DEMO-01')) {
    APPROVED_DEVICES.set('TV-DEMO-01', {
      clientId: 'fenix',
      clientName: 'Fenix',
      tvName: 'Dispositivo 1',
      deviceBinding: 'HARDWARE_LOCKED',
      status: 'APPROVED',
      registeredAt: '2026-08-28',
      expiresAt: '2026-12-31',
      planType: 'MONTHLY',
      defaultService: 'hipica',
      activeService: 'hipica',
      lastSeen: new Date().toISOString(),
      ipAddress: '190.202.10.12',
      uptimeMinutesToday: 480,
      uptimeMinutesMonth: 12400
    });
  }

  if (!APPROVED_DEVICES.has('TV-DEMO-02')) {
    APPROVED_DEVICES.set('TV-DEMO-02', {
      clientId: 'fenix',
      clientName: 'Fenix',
      tvName: 'Dispositivo 2',
      deviceBinding: 'HARDWARE_LOCKED',
      status: 'APPROVED',
      registeredAt: '2026-08-28',
      expiresAt: '2026-12-31',
      planType: 'MONTHLY',
      defaultService: 'loteria',
      activeService: 'loteria',
      lastSeen: new Date().toISOString(),
      ipAddress: '200.84.14.88',
      uptimeMinutesToday: 360,
      uptimeMinutesMonth: 9800
    });
  }

  saveDatabase();
}

// Inicializar persistencia de datos
loadDatabase();

// Inicio de Sesión Multi-Nivel (Super Admin y Clientes)
function loginUser(username, password) {
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  // 1. Verificar si es Super Admin o Técnico
  if (USERS[cleanUser]) {
    const u = USERS[cleanUser];
    const match = Array.isArray(u.passwords) ? u.passwords.includes(cleanPass) : u.pass === cleanPass;
    if (match) {
      const token = jwt.sign(
        {
          username: u.username,
          name: u.name,
          role: u.role,
          clientId: null,
          clientName: 'SaaS Platform Master'
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      return {
        success: true,
        token,
        user: {
          username: u.username,
          name: u.name,
          role: u.role,
          clientId: null,
          clientName: 'SaaS Platform Master'
        }
      };
    }
  }

  // 2. Verificar si es un Encargado de Cliente (Fenix, Fenix 2023, etc.)
  for (const client of CLIENTS.values()) {
    if (client.managerUsername.toLowerCase() === cleanUser) {
      if (client.pass !== cleanPass) {
        return { success: false, error: 'Contraseña incorrecta.' };
      }
      if (client.status !== 'ACTIVE') {
        return { success: false, error: 'La cuenta de este Cliente está suspendida. Contacte al Super Administrador.' };
      }

      const token = jwt.sign(
        {
          username: client.managerUsername,
          name: client.managerName || client.name,
          role: ROLES.CLIENT_MANAGER,
          clientId: client.clientId,
          clientName: client.name,
          maxDevices: client.maxDevices,
          planType: client.planType
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return {
        success: true,
        token,
        user: {
          username: client.managerUsername,
          name: client.managerName || client.name,
          role: ROLES.CLIENT_MANAGER,
          clientId: client.clientId,
          clientName: client.name,
          maxDevices: client.maxDevices,
          planType: client.planType
        }
      };
    }
  }

  return { success: false, error: 'Usuario o contraseña no encontrados.' };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Verificación de Estado de Dispositivo (Televisor / Pantalla)
// Admite decodedUser / token para auto-autorizar consolas de Super Admin o Clientes
function checkDeviceStatus(deviceId, activeService, ipAddress, userToken) {
  if (!deviceId) return { status: 'MISSING_DEVICE_ID' };

  // AUTO-AUTORIZACIÓN: Si el usuario es Super Admin, auto-aprobar su pantalla inmediatamente
  if (userToken && userToken.role === ROLES.SUPER_ADMIN) {
    if (!APPROVED_DEVICES.has(deviceId)) {
      APPROVED_DEVICES.set(deviceId, {
        clientId: 'hector_owner',
        clientName: 'Héctor (Super Admin)',
        tvName: 'Consola Super Admin (Master)',
        deviceBinding: 'HARDWARE_LOCKED',
        status: 'APPROVED',
        registeredAt: new Date().toISOString().split('T')[0],
        expiresAt: '2030-12-31',
        planType: 'SUPER_ADMIN',
        defaultService: 'hipica',
        activeService: activeService || 'hipica',
        lastSeen: new Date().toISOString(),
        uptimeMinutesToday: 0,
        uptimeMinutesMonth: 0
      });
      saveDatabase();
    }
  }

  // AUTO-AUTORIZACIÓN: Si el usuario es Encargado de Cliente (Fenix, etc.), auto-aprobar su pantalla de gestión
  if (userToken && userToken.role === ROLES.CLIENT_MANAGER) {
    if (!APPROVED_DEVICES.has(deviceId)) {
      const client = CLIENTS.get(userToken.clientId);
      APPROVED_DEVICES.set(deviceId, {
        clientId: userToken.clientId,
        clientName: userToken.clientName || client?.name || 'Fenix',
        tvName: `Consola ${userToken.clientName || 'Cliente'} (Directo)`,
        deviceBinding: 'HARDWARE_LOCKED',
        status: 'APPROVED',
        registeredAt: new Date().toISOString().split('T')[0],
        expiresAt: client ? client.expiresAt : '2026-12-31',
        planType: client ? client.planType : 'MONTHLY',
        defaultService: 'hipica',
        activeService: activeService || 'hipica',
        lastSeen: new Date().toISOString(),
        uptimeMinutesToday: 0,
        uptimeMinutesMonth: 0
      });
      saveDatabase();
    }
  }

  if (APPROVED_DEVICES.has(deviceId)) {
    const dev = APPROVED_DEVICES.get(deviceId);
    const client = CLIENTS.get(dev.clientId);

    // Si el cliente dueño de esta pantalla está suspendido
    if (client && client.status === 'SUSPENDED') {
      return {
        status: 'SUSPENDED',
        message: '⏸️ CLIENTE SUSPENDIDO. Contacte al Administrador.',
        device: dev
      };
    }

    // Telemetría
    dev.lastSeen = new Date().toISOString();
    if (ipAddress) dev.ipAddress = ipAddress;
    if (activeService) dev.activeService = activeService;
    dev.uptimeMinutesToday = (dev.uptimeMinutesToday || 0) + 1;
    dev.uptimeMinutesMonth = (dev.uptimeMinutesMonth || 0) + 1;

    // Vencimiento de suscripción por cliente
    const expiryDate = client ? client.expiresAt : dev.expiresAt;
    if (expiryDate) {
      const now = new Date();
      const expDate = new Date(expiryDate);
      if (now > expDate) {
        dev.status = 'EXPIRED';
        return {
          status: 'EXPIRED',
          message: '⛔ LICENCIA VENCIDA. Contacte a su administrador para renovar su suscripción.',
          expiresAt: expiryDate,
          device: dev
        };
      }
    }

    if (dev.status === 'SUSPENDED') {
      return {
        status: 'SUSPENDED',
        message: '⏸️ PANTALLA SUSPENDIDA por el Administrador.',
        device: dev
      };
    }

    return {
      status: 'APPROVED',
      device: dev,
      defaultService: dev.defaultService || 'hipica',
      clientName: client ? client.name : (dev.clientName || 'Fenix')
    };
  }

  // Generar o recuperar código numérico aleatorio de 6 dígitos
  let pin = PENDING_ACTIVATIONS.get(deviceId)?.pin;
  if (!pin) {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
    PENDING_ACTIVATIONS.set(deviceId, { pin, requestedAt: new Date().toISOString() });
  }

  return {
    status: 'UNAUTHORIZED',
    message: 'Pantalla no autorizada. Proporcione el código numérico a su encargado.',
    pin,
    deviceId
  };
}

// ==========================================
// GESTIÓN DE CLIENTES (SUPER ADMINISTRADOR)
// ==========================================

function getAllClients() {
  const list = [];
  for (const client of CLIENTS.values()) {
    // Contar cuántos dispositivos activos tiene este cliente
    const activeCount = Array.from(APPROVED_DEVICES.values())
      .filter(d => d.clientId === client.clientId && d.status === 'APPROVED').length;
    
    list.push({
      ...client,
      activeDevicesCount: activeCount
    });
  }
  return list;
}

function createClient(data) {
  const { name, managerUsername, pass, maxDevices, planType, expiresAt } = data;
  if (!name || !managerUsername || !pass) {
    return { success: false, error: 'Nombre, Usuario del Encargado y Contraseña son requeridos.' };
  }

  const clientId = managerUsername.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (CLIENTS.has(clientId)) {
    return { success: false, error: `El cliente con usuario "${managerUsername}" ya existe.` };
  }

  const newClient = {
    clientId,
    name: name.trim(),
    managerUsername: managerUsername.trim(),
    managerName: `Encargado ${name.trim()}`,
    pass: pass.trim(),
    maxDevices: parseInt(maxDevices) || 4,
    planType: planType || 'MONTHLY',
    expiresAt: expiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'ACTIVE',
    createdAt: new Date().toISOString().split('T')[0]
  };

  CLIENTS.set(clientId, newClient);
  saveDatabase();
  console.log(`🏢 [Client Created] ${newClient.name} (@${newClient.managerUsername}) con cupo de ${newClient.maxDevices} pantallas.`);
  return { success: true, client: newClient };
}

function updateClient(clientId, updateData) {
  if (!CLIENTS.has(clientId)) {
    return { success: false, error: 'Cliente no encontrado.' };
  }
  const client = CLIENTS.get(clientId);

  if (updateData.name) client.name = updateData.name.trim();
  if (updateData.pass) client.pass = updateData.pass.trim();
  if (updateData.maxDevices !== undefined) client.maxDevices = parseInt(updateData.maxDevices);
  if (updateData.planType) client.planType = updateData.planType;
  if (updateData.expiresAt) client.expiresAt = updateData.expiresAt;
  if (updateData.status) client.status = updateData.status;

  saveDatabase();
  return { success: true, client };
}

function toggleClientStatus(clientId) {
  if (!CLIENTS.has(clientId)) {
    return { success: false, error: 'Cliente no encontrado.' };
  }
  const client = CLIENTS.get(clientId);
  client.status = client.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  saveDatabase();
  return { success: true, clientId, newStatus: client.status, client };
}

function deleteClient(clientId) {
  if (clientId === 'fenix') {
    return { success: false, error: 'No se puede eliminar el cliente base Fenix.' };
  }
  if (!CLIENTS.has(clientId)) {
    return { success: false, error: 'Cliente no encontrado.' };
  }

  // Eliminar los dispositivos vinculados a ese cliente
  for (const [devId, dev] of APPROVED_DEVICES.entries()) {
    if (dev.clientId === clientId) {
      APPROVED_DEVICES.delete(devId);
    }
  }

  CLIENTS.delete(clientId);
  saveDatabase();
  return { success: true, message: `Cliente ${clientId} y sus dispositivos eliminados.` };
}

// ==========================================
// ACTIVACIÓN DE DISPOSITIVOS POR ENCARGADO
// ==========================================

function authorizeDeviceForClient(clientId, pin, tvName) {
  if (!clientId) {
    return { success: false, error: 'Debe especificar el Cliente que activará este dispositivo.' };
  }
  const client = CLIENTS.get(clientId);
  if (!client) {
    return { success: false, error: 'Cliente no encontrado en el sistema.' };
  }
  if (client.status !== 'ACTIVE') {
    return { success: false, error: 'Este cliente se encuentra suspendido. No puede activar pantallas.' };
  }

  // 1. Contar dispositivos activos del cliente y validar cupo
  const clientDevices = Array.from(APPROVED_DEVICES.entries())
    .filter(([id, d]) => d.clientId === clientId);

  if (clientDevices.length >= client.maxDevices) {
    return {
      success: false,
      error: `Límite de dispositivos alcanzado (${clientDevices.length}/${client.maxDevices}). Comuníquese con el Super Administrador para aumentar su cupo.`
    };
  }

  // 2. Validar que el nombre del dispositivo sea ÚNICO para este cliente
  const cleanName = (tvName || '').trim();
  if (!cleanName) {
    return { success: false, error: 'Debe ingresar un nombre para el dispositivo.' };
  }

  const nameAlreadyUsed = clientDevices.some(([id, d]) => d.tvName.toLowerCase() === cleanName.toLowerCase());
  if (nameAlreadyUsed) {
    return {
      success: false,
      error: `El nombre "${cleanName}" ya está asignado a otro de tus dispositivos. Asigna un nombre único (ej. Dispositivo ${clientDevices.length + 1}).`
    };
  }

  // 3. Buscar el código numérico de 6 dígitos
  const rawPin = (pin || '').trim();
  const digitsOnly = rawPin.replace(/[^0-9]/g, '');

  let foundDevId = null;
  for (const [devId, val] of PENDING_ACTIVATIONS.entries()) {
    const valDigits = val.pin.replace(/[^0-9]/g, '');
    if (valDigits === digitsOnly || val.pin.toUpperCase() === rawPin.toUpperCase() || `FX-${valDigits}` === rawPin.toUpperCase()) {
      foundDevId = devId;
      break;
    }
  }

  // Si no está en pending pero es un PIN válido de 6 dígitos, permitir asignación manual o generar hardware ID
  if (!foundDevId) {
    if (digitsOnly.length === 6) {
      foundDevId = `TV-FX-${digitsOnly}`;
    } else {
      return {
        success: false,
        error: `Código de pantalla "${rawPin}" no encontrado o ya fue activado. Verifique el código mostrado en la pantalla.`
      };
    }
  }

  // 4. Activar formalmente el dispositivo y vincularlo al cliente
  const newDev = {
    clientId: client.clientId,
    clientName: client.name,
    tvName: cleanName,
    deviceBinding: 'HARDWARE_LOCKED',
    status: 'APPROVED',
    registeredAt: new Date().toISOString().split('T')[0],
    expiresAt: client.expiresAt,
    planType: client.planType,
    defaultService: 'hipica',
    activeService: 'hipica',
    lastSeen: new Date().toISOString(),
    uptimeMinutesToday: 0,
    uptimeMinutesMonth: 0
  };

  APPROVED_DEVICES.set(foundDevId, newDev);
  PENDING_ACTIVATIONS.delete(foundDevId);
  saveDatabase();

  return {
    success: true,
    deviceId: foundDevId,
    device: newDev,
    message: `¡Pantalla "${cleanName}" activada con éxito para ${client.name}!`
  };
}

// Eliminar / Desvincular dispositivo (Libera 1 cupo para el cliente)
function deleteDevice(deviceId, requestingClientId, userRole) {
  if (!APPROVED_DEVICES.has(deviceId)) {
    return { success: false, error: 'Dispositivo no encontrado.' };
  }

  const dev = APPROVED_DEVICES.get(deviceId);
  // Un cliente solo puede eliminar sus propios dispositivos; el super admin puede con cualquiera
  if (userRole !== ROLES.SUPER_ADMIN && dev.clientId !== requestingClientId) {
    return { success: false, error: 'No tienes permiso para eliminar este dispositivo.' };
  }

  APPROVED_DEVICES.delete(deviceId);
  saveDatabase();
  return { success: true, message: `Dispositivo "${dev.tvName}" desvinculado. Se ha liberado 1 cupo de pantalla.` };
}

// Renombrar dispositivo (garantizando unicidad para ese cliente)
function renameDevice(deviceId, newName, requestingClientId, userRole) {
  if (!APPROVED_DEVICES.has(deviceId)) {
    return { success: false, error: 'Dispositivo no encontrado.' };
  }
  const dev = APPROVED_DEVICES.get(deviceId);
  if (userRole !== ROLES.SUPER_ADMIN && dev.clientId !== requestingClientId) {
    return { success: false, error: 'No tienes permiso para renombrar este dispositivo.' };
  }

  const cleanName = (newName || '').trim();
  if (!cleanName) return { success: false, error: 'El nombre no puede estar vacío.' };

  const clientDevices = Array.from(APPROVED_DEVICES.entries())
    .filter(([id, d]) => d.clientId === dev.clientId && id !== deviceId);

  if (clientDevices.some(([id, d]) => d.tvName.toLowerCase() === cleanName.toLowerCase())) {
    return { success: false, error: `El nombre "${cleanName}" ya está en uso.` };
  }

  dev.tvName = cleanName;
  saveDatabase();
  return { success: true, deviceId, newName: dev.tvName };
}

function setDefaultService(deviceId, defaultService) {
  if (!APPROVED_DEVICES.has(deviceId)) {
    return { success: false, error: 'Dispositivo no encontrado.' };
  }
  const dev = APPROVED_DEVICES.get(deviceId);
  dev.defaultService = defaultService;
  dev.activeService = defaultService;
  saveDatabase();
  return { success: true, deviceId, defaultService: dev.defaultService, device: dev };
}

function getApprovedDevicesList(userRole, clientId, filterClientId) {
  const list = [];
  for (const [id, dev] of APPROVED_DEVICES.entries()) {
    // Si es un encargado de cliente, solo ve sus propios dispositivos
    if (userRole === ROLES.CLIENT_MANAGER && dev.clientId !== clientId) {
      continue;
    }

    // Si es Super Admin o Técnico y especificó un filtro de cliente particular
    if ((userRole === ROLES.SUPER_ADMIN || userRole === ROLES.TECH_CHIEF) && filterClientId && filterClientId !== 'ALL') {
      if (dev.clientId !== filterClientId) continue;
    }

    const client = CLIENTS.get(dev.clientId);
    list.push({
      deviceId: id,
      ...dev,
      clientName: client ? client.name : (dev.clientName || 'Fenix')
    });
  }
  return list;
}

function getSystemAnalytics(userRole, clientId, filterClientId) {
  const allDevices = Array.from(APPROVED_DEVICES.entries()).map(([id, dev]) => {
    const now = Date.now();
    const lastSeenTime = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
    const isOnline = (now - lastSeenTime) < 45000;
    const client = CLIENTS.get(dev.clientId);

    return {
      deviceId: id,
      ...dev,
      clientName: client ? client.name : (dev.clientName || 'Fenix'),
      isOnline
    };
  });

  const filtered = allDevices.filter(dev => {
    if (userRole === ROLES.CLIENT_MANAGER) {
      return dev.clientId === clientId;
    }
    if (filterClientId && filterClientId !== 'ALL') {
      return dev.clientId === filterClientId;
    }
    return true;
  });

  const total = filtered.length;
  const online = filtered.filter(d => d.isOnline).length;
  const avgUptimeMinutes = total > 0 ? Math.round(filtered.reduce((acc, d) => acc + (d.uptimeMinutesToday || 0), 0) / total) : 0;

  const serviceCounts = {};
  filtered.forEach(d => {
    const svc = d.activeService || 'hipica';
    serviceCounts[svc] = (serviceCounts[svc] || 0) + 1;
  });

  let topService = 'hipica';
  let maxCount = 0;
  for (const [svc, count] of Object.entries(serviceCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topService = svc;
    }
  }

  return {
    totalDevices: total,
    totalScreens: total,
    onlineCount: online,
    onlineScreens: online,
    offlineScreens: total - online,
    avgDailyHours: (avgUptimeMinutes / 60).toFixed(1),
    topService,
    serviceCounts,
    devices: filtered,
    devicesTelemetry: filtered
  };
}

function getAllUsers() {
  const seen = new Set();
  const list = [];
  for (const [k, u] of Object.entries(USERS)) {
    if (!seen.has(u.username)) {
      seen.add(u.username);
      list.push({
        username: u.username,
        name: u.name,
        role: u.role,
        location: u.location || 'Sede Principal'
      });
    }
  }
  for (const [cid, c] of CLIENTS.entries()) {
    list.push({
      username: c.managerUsername,
      name: `${c.managerName} (${c.name})`,
      role: ROLES.CLIENT_MANAGER,
      location: `Cliente: ${c.name}`
    });
  }
  return list;
}

function createSystemUser({ username, name, pass, role, location }) {
  if (!username || !pass) {
    return { success: false, error: 'Usuario y contraseña son requeridos.' };
  }
  const clean = username.trim().toLowerCase();
  if (USERS[clean]) {
    return { success: false, error: 'El nombre de usuario ya existe en el sistema.' };
  }
  USERS[clean] = {
    username: clean,
    name: name || username,
    passwords: [pass],
    role: role || ROLES.TECH_CHIEF,
    location: location || 'Oficina Central'
  };
  return { success: true, user: USERS[clean] };
}

function deleteSystemUser(username) {
  const clean = (username || '').trim().toLowerCase();
  if (['hector_owner', 'hector_superadmin', 'hector', 'superadmin'].includes(clean)) {
    return { success: false, error: 'No se puede eliminar la cuenta principal del Super Administrador.' };
  }
  if (!USERS[clean]) {
    return { success: false, error: 'Usuario no encontrado.' };
  }
  delete USERS[clean];
  return { success: true, message: `Usuario @${clean} eliminado.` };
}

module.exports = {
  ROLES,
  CLIENTS,
  APPROVED_DEVICES,
  loginUser,
  verifyToken,
  checkDeviceStatus,
  loadDatabase,
  saveDatabase,
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
  deleteSystemUser
};
