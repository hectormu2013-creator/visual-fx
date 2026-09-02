const jwt = require('jsonwebtoken');

const JWT_SECRET = 'visual_fx_fenix_secret_key_2026';

// Jerarquía de Roles
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',     // Tú: Control total del sistema
  TECH_CHIEF: 'TECH_CHIEF',       // Jefe de Soporte Técnico: Asistencia multisede
  AGENCY_MANAGER: 'AGENCY_MANAGER'// Encargado de Agencia: Solo ve transmisiones y activa TVs de su sede
};

// Base de datos de Usuarios con Jerarquía de Roles
const USERS = {
  'hector_owner': {
    username: 'hector_owner',
    name: 'Héctor (Super Admin / Propietario)',
    pass: 'admin2026',
    role: ROLES.SUPER_ADMIN,
    agencyId: 'GLOBAL_HQ',
    location: 'Sede Principal'
  },
  'jefe_tecnico': {
    username: 'jefe_tecnico',
    name: 'Soporte Técnico Fenix',
    pass: 'soporte2026',
    role: ROLES.TECH_CHIEF,
    agencyId: 'TECH_DEPT',
    location: 'Centro de Operaciones'
  },
  'leo1': {
    username: 'leo1',
    name: 'Encargado Agencia Cabimas',
    pass: '1234',
    role: ROLES.AGENCY_MANAGER,
    agencyId: 'CAB-01',
    location: 'Cabimas, Zulia'
  },
  'agencia_caracas': {
    username: 'agencia_caracas',
    name: 'Encargado Agencia Caracas',
    pass: 'fenix123',
    role: ROLES.AGENCY_MANAGER,
    agencyId: 'CCS-01',
    location: 'Caracas, D.C.'
  },
  'agencia_maracaibo': {
    username: 'agencia_maracaibo',
    name: 'Encargado Agencia Maracaibo',
    pass: 'fenix123',
    role: ROLES.AGENCY_MANAGER,
    agencyId: 'MAR-01',
    location: 'Maracaibo, Zulia'
  }
};

// Base de datos de Televisores Autorizados por Sede Fenix
const APPROVED_DEVICES = new Map([
  ['TV-DEMO-01', { agencyId: 'GLOBAL_HQ', tvName: 'TV Sala Principal #1', status: 'APPROVED', registeredAt: '2026-08-28' }],
  ['TV-CABIMAS-01', { agencyId: 'CAB-01', tvName: 'TV Agencia Cabimas #1', status: 'APPROVED', registeredAt: '2026-08-28' }],
  ['TV-CARACAS-01', { agencyId: 'CCS-01', tvName: 'TV Agencia Caracas #1', status: 'APPROVED', registeredAt: '2026-08-28' }]
]);

const PENDING_ACTIVATIONS = new Map();

function loginUser(username, password) {
  const user = USERS[username];
  if (!user || user.pass !== password) {
    return { success: false, error: 'Usuario o contraseña incorrectos.' };
  }
  const token = jwt.sign(
    { username: user.username, name: user.name, role: user.role, agencyId: user.agencyId, location: user.location },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  return { 
    success: true, 
    token, 
    user: { username: user.username, name: user.name, role: user.role, agencyId: user.agencyId, location: user.location } 
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function checkDeviceStatus(deviceId, agencyId) {
  if (!deviceId) return { status: 'MISSING_DEVICE_ID' };

  if (APPROVED_DEVICES.has(deviceId)) {
    const dev = APPROVED_DEVICES.get(deviceId);
    return { status: 'APPROVED', device: dev };
  }

  let pin = PENDING_ACTIVATIONS.get(deviceId)?.pin;
  if (!pin) {
    pin = 'FX-' + Math.floor(1000 + Math.random() * 9000);
    PENDING_ACTIVATIONS.set(deviceId, { pin, agencyId, requestedAt: new Date().toISOString() });
  }

  return {
    status: 'UNAUTHORIZED',
    message: 'Televisor o dispositivo no autorizado para reproducir transmisiones fuera de agencias Fenix.',
    pin,
    deviceId
  };
}

function authorizeDevice(pin, tvName, agencyId) {
  for (const [devId, val] of PENDING_ACTIVATIONS.entries()) {
    if (val.pin === pin) {
      const newDev = {
        agencyId: agencyId || val.agencyId || 'GLOBAL_HQ',
        tvName: tvName || `TV-Sede ${val.agencyId || 'Fenix'}`,
        status: 'APPROVED',
        registeredAt: new Date().toISOString().split('T')[0]
      };
      APPROVED_DEVICES.set(devId, newDev);
      PENDING_ACTIVATIONS.delete(devId);
      return { success: true, deviceId: devId, device: newDev };
    }
  }
  return { success: false, error: 'Código PIN de activación no encontrado o expirado.' };
}

function getApprovedDevicesList(userRole, userAgencyId) {
  const list = [];
  for (const [id, dev] of APPROVED_DEVICES.entries()) {
    if (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.TECH_CHIEF || dev.agencyId === userAgencyId) {
      list.push({ deviceId: id, ...dev });
    }
  }
  return list;
}

// Gestión de Usuarios para SuperAdmin
function getAllUsers() {
  return Object.values(USERS).map(u => ({
    username: u.username,
    name: u.name,
    role: u.role,
    agencyId: u.agencyId,
    location: u.location
  }));
}

function createUser(userData) {
  const { username, pass, name, role, agencyId, location } = userData;
  if (!username || !pass || !name) {
    return { success: false, error: 'Campos requeridos faltantes.' };
  }
  if (USERS[username]) {
    return { success: false, error: 'El nombre de usuario ya existe.' };
  }

  USERS[username] = {
    username,
    pass,
    name,
    role: role || ROLES.AGENCY_MANAGER,
    agencyId: agencyId || 'NEW-AGENCY',
    location: location || 'Venezuela'
  };

  return { success: true, user: USERS[username] };
}

function deleteUser(username) {
  if (username === 'hector_owner') {
    return { success: false, error: 'No se puede eliminar la cuenta del Super Admin principal.' };
  }
  if (!USERS[username]) {
    return { success: false, error: 'Usuario no encontrado.' };
  }
  delete USERS[username];
  return { success: true, message: `Usuario ${username} eliminado.` };
}

module.exports = {
  ROLES,
  loginUser,
  verifyToken,
  checkDeviceStatus,
  authorizeDevice,
  getApprovedDevicesList,
  getAllUsers,
  createUser,
  deleteUser
};
