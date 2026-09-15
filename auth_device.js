const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// Configuración por Defecto para Pizarras Digitales (SaaS Visual-FX)
const DEFAULT_SCREEN_CONFIG = {
  themeMode: 'dark', // 'dark' | 'light'
  colorScheme: 'emerald', // 'emerald' | 'cyan' | 'gold' | 'purple' | 'clean'
  tickerSpeed: 300, // Segundos para el recorrido del cintillo (rango 250s - 500s)
  tickerActive: true,
  voiceEnabled: true,
  voiceVolume: 0.9,
  animalSfxEnabled: true,
  bgMusicEnabled: true,
  circusMusicEnabled: true,
  bgMusicTrack: 'carnival_parade', // 'circus_waltz' | 'carnival_parade' | 'carousel_magic' | 'custom'
  circusMusicTrack: 'carnival_parade',
  bgMusicCustomUrl: '',
  customMusicUrl: '',
  bgMusicVolume: 0.25,
  circusMusicVolume: 0.25,
  defaultService: 'loteria', // 'loteria' | 'hipica'
  lotterySections: {
    resultados: {
      enabled: true,
      slides: [
        {
          id: 'slide_1',
          name: 'Pizarra 1: Animalitos Líderes',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['guacharo-activo', 'lotto-activo', 'la-granjita', 'guacharito-millonario', 'chance-animal']
        },
        {
          id: 'slide_2',
          name: 'Pizarra 2: Triples y Terminales Estrella',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['triple-zulia', 'triple-tachira', 'triple-caracas', 'triple-chance-1', 'triple-chance-2']
        },
        {
          id: 'slide_3',
          name: 'Pizarra 3: Animalitos y Ruletas 2',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['animalitos-la-ricachona', 'centena-animalitos', 'centena-plus', 'chance-animal', 'el-ruco']
        },
        {
          id: 'slide_4',
          name: 'Pizarra 4: Triples Complementarios',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['triple-zamorano', 'triple-caliente', 'triple-tachira', 'triple-zulia', 'triple-caracas']
        },
        {
          id: 'slide_5',
          name: 'Pizarra 5: Sorteos Especiales y Ruletas',
          enabled: true,
          duration: 20,
          lotteryCount: 5,
          lotteries: ['granjita-plus', 'guacharito-millonario', 'la-granjita', 'lotto-activo', 'guacharo-activo']
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
    top5_animalitos: {
      enabled: true,
      duration: 20,
      title: 'Top 5 Animalitos Más Vendidos',
      games: ['guacharo-activo', 'lotto-activo', 'la-granjita', 'guacharito-millonario', 'la-ricachona']
    },
    top5_triples: {
      enabled: true,
      duration: 20,
      title: 'Top 5 Triples y Terminales',
      games: ['triple-zulia', 'triple-tachira', 'triple-chance', 'triple-zamorano', 'triple-caracas']
    },
    group2_animalitos: {
      enabled: true,
      duration: 18,
      title: 'Animalitos - Grupo 2',
      games: ['selva-plus', 'ruleta-activa', 'granjita-plus']
    },
    pizarra_1000: {
      enabled: true,
      duration: 28,
      title: 'Pizarra General de Loterías'
    },
    estadisticas: {
      enabled: true,
      duration: 20,
      title: 'Estadísticas & Pronósticos 30D'
    },
    publicidad: {
      enabled: true,
      duration: 15,
      title: 'Publicidad Oficial de Loterías'
    },
    ultimos_5_sorteos: {
      enabled: true,
      duration: 25,
      title: 'Últimos 5 Sorteos Incorporados (Hero Card)'
    }
  }
};

// Base de datos en Memoria y Persistencia en Disco
const DATA_DIR = path.join(__dirname, 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const DEVICE_ACCOUNTS_FILE = path.join(DATA_DIR, 'device_accounts.json');
const SYSTEM_USERS_FILE = path.join(DATA_DIR, 'system_users.json');

const supabaseSync = require('./supabase_sync');

const CLIENTS = new Map();
const APPROVED_DEVICES = new Map();
const PENDING_ACTIVATIONS = new Map();
const DEVICE_ACCOUNTS = new Map();

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

    const deviceAccsArr = Array.from(DEVICE_ACCOUNTS.values());
    fs.writeFileSync(DEVICE_ACCOUNTS_FILE, JSON.stringify(deviceAccsArr, null, 2), 'utf8');

    // Persistir usuarios del sistema (Super Admin y Soporte) en disco permanentemente
    const savedUsers = [];
    const seenUsers = new Set();
    for (const u of Object.values(USERS)) {
      if (u && u.username && !seenUsers.has(u.username)) {
        seenUsers.add(u.username);
        savedUsers.push(u);
      }
    }
    fs.writeFileSync(SYSTEM_USERS_FILE, JSON.stringify(savedUsers, null, 2), 'utf8');

    // PERSISTENCIA PERMANENTE EN NUBE (SUPABASE)
    // Se ejecuta de manera asíncrona no bloqueante para no demorar la respuesta de la API
    Promise.all([
      supabaseSync.saveToCloud('clients', clientsArr),
      supabaseSync.saveToCloud('devices', devicesArr),
      supabaseSync.saveToCloud('device_accounts', deviceAccsArr),
      supabaseSync.saveToCloud('system_users', savedUsers)
    ]).catch(err => {
      console.warn('[SupabaseSync] Error en guardado en segundo plano:', err.message);
    });
  } catch (e) {
    console.error('Error guardando base de datos en disco:', e);
  }
}

// Función auxiliar a nivel de módulo para garantizar las 5 pizarras fijas de resultados
function normalizeConfigSlides(cfg) {
  if (!cfg) return;
  if (!cfg.lotterySections) {
    cfg.lotterySections = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG.lotterySections));
  }
  if (!cfg.lotterySections.resultados) {
    cfg.lotterySections.resultados = { enabled: true, slides: [] };
  }
  const rSlides = cfg.lotterySections.resultados.slides;
  const defS = DEFAULT_SCREEN_CONFIG.lotterySections.resultados.slides;
  if (!Array.isArray(rSlides) || rSlides.length === 0) {
    cfg.lotterySections.resultados.slides = JSON.parse(JSON.stringify(defS));
  } else {
    if (rSlides.length < 5) {
      for (let i = rSlides.length; i < 5; i++) {
        if (defS[i]) rSlides.push(JSON.parse(JSON.stringify(defS[i])));
      }
    } else if (rSlides.length > 5) {
      cfg.lotterySections.resultados.slides = rSlides.slice(0, 5);
    }
  }
}

function loadDatabase() {
  ensureDataDir();

  // 0. Cargar Usuarios del Sistema (Super Admin y Soporte) desde JSON si existe
  try {
    if (fs.existsSync(SYSTEM_USERS_FILE)) {
      const raw = fs.readFileSync(SYSTEM_USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const su of parsed) {
          if (su && su.username) {
            const cleanKey = su.username.toLowerCase();
            USERS[cleanKey] = su;
            if (cleanKey === 'hector_owner') {
              USERS['hector_owner'] = su;
              USERS['hector_superadmin'] = su;
              USERS['hector'] = su;
              USERS['superadmin'] = su;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error leyendo system_users.json:', e);
  }

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

  // Asegurar que todos los dispositivos cargados tengan su objeto config completo
  for (const [id, dev] of APPROVED_DEVICES.entries()) {
    if (!dev.config) {
      dev.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
    } else {
      dev.config = { ...DEFAULT_SCREEN_CONFIG, ...dev.config };
      if (!dev.config.modules) {
        dev.config.modules = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG.modules));
      }
    }
    normalizeConfigSlides(dev.config);
  }

  // 3. Cargar Cuentas de Dispositivos (Pantallas TV) desde JSON
  try {
    if (fs.existsSync(DEVICE_ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(DEVICE_ACCOUNTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        DEVICE_ACCOUNTS.clear();
        for (const acc of parsed) {
          if (acc && acc.username) {
            const cleanKey = acc.username.toLowerCase();
            acc.username = cleanKey;
            if (!acc.config) acc.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
            normalizeConfigSlides(acc.config);
            if (!acc.status) acc.status = 'APPROVED';
            if (!acc.defaultService) acc.defaultService = 'loteria';
            if (acc.activeSessionId === undefined) acc.activeSessionId = null;
            DEVICE_ACCOUNTS.set(cleanKey, acc);
            APPROVED_DEVICES.set(cleanKey, acc);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error leyendo device_accounts.json:', e);
  }

  // Asegurar al menos una cuenta de pantalla por defecto para Fenix
  if (!DEVICE_ACCOUNTS.has('tv1_fenix')) {
    const defaultTv = {
      username: 'tv1_fenix',
      pass: 'tv1234',
      clientId: 'fenix',
      clientName: 'Fenix',
      tvName: 'Pantalla 1 (Fenix)',
      role: 'DEVICE',
      status: 'APPROVED',
      activeSessionId: null,
      defaultService: 'loteria',
      activeService: 'loteria',
      config: JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG)),
      createdAt: '2026-09-07'
    };
    normalizeConfigSlides(defaultTv.config);
    DEVICE_ACCOUNTS.set('tv1_fenix', defaultTv);
    APPROVED_DEVICES.set('tv1_fenix', defaultTv);
  }

  // Asegurar que los clientes tengan su config inicializada con 5 pizarras
  for (const client of CLIENTS.values()) {
    if (!client.config) {
      client.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
    }
    normalizeConfigSlides(client.config);
  }

  saveDatabase();
}

/**
 * Sincroniza y restaura el estado completo desde Supabase.
 * Permite que todas las pantallas, configuraciones y usuarios sobrevivan a
 * los reinicios o despliegues en contenedores efímeros de Render.
 */
async function syncDatabaseWithCloud() {
  try {
    console.log('[SupabaseSync] Consultando persistencia en la nube (Supabase)...');
    const cloudData = await supabaseSync.loadAllFromCloud();
    let hasRestoredAny = false;

    // 1. Restaurar o respaldar Clientes
    if (cloudData.clients && Array.isArray(cloudData.clients) && cloudData.clients.length > 0) {
      CLIENTS.clear();
      for (const item of cloudData.clients) {
        if (item && item.clientId) CLIENTS.set(item.clientId, item);
      }
      hasRestoredAny = true;
      console.log(`[SupabaseSync] Restauradas ${CLIENTS.size} organización(es) cliente(s) desde Supabase.`);
    } else {
      const localClients = Array.from(CLIENTS.values());
      if (localClients.length > 0) {
        supabaseSync.saveToCloud('clients', localClients);
      }
    }

    // 2. Restaurar o respaldar Dispositivos Autorizados
    if (cloudData.devices && Array.isArray(cloudData.devices) && cloudData.devices.length > 0) {
      APPROVED_DEVICES.clear();
      for (const [id, dev] of cloudData.devices) {
        if (id && dev) APPROVED_DEVICES.set(id, dev);
      }
      hasRestoredAny = true;
      console.log(`[SupabaseSync] Restaurados ${APPROVED_DEVICES.size} dispositivo(s) autorizados desde Supabase.`);
    } else {
      const localDevs = Array.from(APPROVED_DEVICES.entries());
      if (localDevs.length > 0) {
        supabaseSync.saveToCloud('devices', localDevs);
      }
    }

    // 3. Restaurar o respaldar Cuentas de Pantalla TV
    if (cloudData.device_accounts && Array.isArray(cloudData.device_accounts) && cloudData.device_accounts.length > 0) {
      DEVICE_ACCOUNTS.clear();
      for (const acc of cloudData.device_accounts) {
        if (acc && acc.username) {
          const cleanKey = acc.username.toLowerCase();
          DEVICE_ACCOUNTS.set(cleanKey, acc);
          APPROVED_DEVICES.set(cleanKey, acc);
        }
      }
      hasRestoredAny = true;
      console.log(`[SupabaseSync] Restauradas ${DEVICE_ACCOUNTS.size} cuenta(s) de pantalla TV desde Supabase.`);
    } else {
      const localAccs = Array.from(DEVICE_ACCOUNTS.values());
      if (localAccs.length > 0) {
        supabaseSync.saveToCloud('device_accounts', localAccs);
      }
    }

    // 4. Restaurar o respaldar Usuarios del Sistema (Super Admin y Soporte)
    if (cloudData.system_users && Array.isArray(cloudData.system_users) && cloudData.system_users.length > 0) {
      for (const su of cloudData.system_users) {
        if (su && su.username) {
          const cleanKey = su.username.toLowerCase();
          USERS[cleanKey] = su;
          if (cleanKey === 'hector_owner') {
            USERS['hector_owner'] = su;
            USERS['hector_superadmin'] = su;
            USERS['hector'] = su;
            USERS['superadmin'] = su;
          }
        }
      }
      hasRestoredAny = true;
      console.log('[SupabaseSync] Restaurados usuarios del sistema desde Supabase.');
    } else {
      const savedUsers = [];
      const seenUsers = new Set();
      for (const u of Object.values(USERS)) {
        if (u && u.username && !seenUsers.has(u.username)) {
          seenUsers.add(u.username);
          savedUsers.push(u);
        }
      }
      if (savedUsers.length > 0) {
        supabaseSync.saveToCloud('system_users', savedUsers);
      }
    }

    // Normalizar a 5 pizarras fijas para todas las entidades restauradas
    for (const c of CLIENTS.values()) {
      if (!c.config) c.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
      normalizeConfigSlides(c.config);
    }
    for (const d of APPROVED_DEVICES.values()) {
      if (!d.config) d.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
      normalizeConfigSlides(d.config);
    }
    for (const a of DEVICE_ACCOUNTS.values()) {
      if (!a.config) a.config = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
      normalizeConfigSlides(a.config);
    }
    for (const u of Object.values(USERS)) {
      if (u && u.config) normalizeConfigSlides(u.config);
    }

    // Si se restauró información desde Supabase, actualizar los archivos locales en disco
    if (hasRestoredAny) {
      try {
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(Array.from(CLIENTS.values()), null, 2), 'utf8');
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(Array.from(APPROVED_DEVICES.entries()), null, 2), 'utf8');
        fs.writeFileSync(DEVICE_ACCOUNTS_FILE, JSON.stringify(Array.from(DEVICE_ACCOUNTS.values()), null, 2), 'utf8');
        const savedUsers = [];
        const seenUsers = new Set();
        for (const u of Object.values(USERS)) {
          if (u && u.username && !seenUsers.has(u.username)) {
            seenUsers.add(u.username);
            savedUsers.push(u);
          }
        }
        fs.writeFileSync(SYSTEM_USERS_FILE, JSON.stringify(savedUsers, null, 2), 'utf8');
        console.log('[SupabaseSync] Archivos locales data/*.json actualizados con datos de la nube.');
      } catch (e) {
        console.warn('[SupabaseSync] No se pudieron escribir archivos locales:', e.message);
      }
    }
  } catch (err) {
    console.warn('[SupabaseSync] Error durante sincronización con Supabase:', err.message);
  }
}

// Inicializar persistencia de datos (Local + Nube)
loadDatabase();
syncDatabaseWithCloud();

// Inicio de Sesión Multi-Nivel (Super Admin, Clientes y Dispositivos)
function loginUser(username, password) {
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  // 1. Verificar si es Super Admin o Técnico (Humano operador: acceso directo sin PIN)
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
          clientName: 'SaaS Platform Master',
          config: u.config || DEFAULT_SCREEN_CONFIG
        }
      };
    }
  }

  // 2. Verificar si es un Encargado de Cliente (Fenix, Fenix 2023, etc.) (Humano operador: acceso directo sin PIN)
  for (const client of CLIENTS.values()) {
    if (client.managerUsername.toLowerCase() === cleanUser) {
      if (client.pass !== cleanPass) {
        return { success: false, error: 'Contraseña incorrecta.' };
      }
      if (client.status !== 'ACTIVE') {
        return { success: false, error: 'La cuenta de este Cliente está suspendida. Contacte al Super Administrador.' };
      }

      const clientCfg = client.config || JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));

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
          planType: client.planType,
          config: clientCfg
        }
      };
    }
  }

  // 3. Verificar si es una Cuenta de Dispositivo / Pantalla TV (Usuario + Contraseña con Sesión Única)
  if (DEVICE_ACCOUNTS.has(cleanUser)) {
    const devAcc = DEVICE_ACCOUNTS.get(cleanUser);
    if (devAcc.pass !== cleanPass) {
      return { success: false, error: 'Contraseña de pantalla incorrecta.' };
    }
    const client = CLIENTS.get(devAcc.clientId);
    if (client && client.status !== 'ACTIVE') {
      return { success: false, error: 'La cuenta del cliente titular está suspendida.' };
    }

    // Generar nuevo identificador de sesión única para este inicio de sesión
    const newSessionId = crypto.randomUUID ? crypto.randomUUID() : ('sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    devAcc.activeSessionId = newSessionId;
    devAcc.lastSeen = new Date().toISOString();
    devAcc.status = 'APPROVED';
    saveDatabase();

    const devCfg = devAcc.config || (client && client.config) || DEFAULT_SCREEN_CONFIG;

    const token = jwt.sign(
      {
        username: devAcc.username,
        name: devAcc.tvName || devAcc.username,
        role: 'DEVICE',
        clientId: devAcc.clientId,
        clientName: devAcc.clientName || client?.name || 'Fenix',
        tvName: devAcc.tvName || devAcc.username,
        sessionId: newSessionId
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    return {
      success: true,
      token,
      user: {
        username: devAcc.username,
        name: devAcc.tvName || devAcc.username,
        role: 'DEVICE',
        clientId: devAcc.clientId,
        clientName: devAcc.clientName || client?.name || 'Fenix',
        tvName: devAcc.tvName || devAcc.username,
        sessionId: newSessionId,
        config: devCfg,
        defaultService: devAcc.defaultService || devCfg.defaultService || 'loteria'
      }
    };
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
// Concurrencia: sólo se permite UNA sesión activa simultánea por cuenta de dispositivo
function checkDeviceStatus(deviceId, activeService, ipAddress, userToken) {
  let dId = deviceId;
  let service = activeService;
  let ip = ipAddress;
  let effectiveToken = userToken;

  if (typeof deviceId === 'object' && deviceId !== null && !activeService && !ipAddress && !userToken) {
    dId = deviceId.deviceId;
    service = deviceId.activeService;
    ip = deviceId.ipAddress;
    effectiveToken = deviceId.userToken || deviceId.token || deviceId;
  } else if (activeService && (typeof activeService === 'object' || typeof activeService === 'string') && !ipAddress && !userToken) {
    effectiveToken = activeService.token || activeService.userToken || activeService;
    service = typeof activeService === 'object' ? activeService.activeService : 'loteria';
  }

  if (typeof effectiveToken === 'string') {
    effectiveToken = verifyToken(effectiveToken);
  }

  // 1. REGLA FUNDAMENTAL: Super Admin y Clientes son OPERADORES HUMANOS.
  // Acceso directo con su configuración guardada.
  if (effectiveToken && (effectiveToken.role === ROLES.SUPER_ADMIN || effectiveToken.role === ROLES.CLIENT_MANAGER || effectiveToken.role === ROLES.TECH_CHIEF)) {
    const client = effectiveToken.clientId ? CLIENTS.get(effectiveToken.clientId) : null;
    const clientCfg = (client && client.config) ? client.config : DEFAULT_SCREEN_CONFIG;
    return {
      status: 'APPROVED',
      isOperator: true,
      clientName: effectiveToken.clientName || (client ? client.name : 'Fenix'),
      config: clientCfg,
      defaultService: clientCfg.defaultService || 'hipica'
    };
  }

  // 2. Si el usuario está autenticado como Pantalla / Dispositivo (ROLE: DEVICE)
  if (effectiveToken && effectiveToken.role === 'DEVICE') {
    const devUsername = (effectiveToken.username || '').toLowerCase();
    const dev = DEVICE_ACCOUNTS.get(devUsername) || APPROVED_DEVICES.get(devUsername);

    if (!dev) {
      return {
        status: 'UNAUTHORIZED',
        message: 'Esta pantalla no existe o fue eliminada de la lista del cliente.'
      };
    }

    const client = CLIENTS.get(dev.clientId);
    if (client && client.status === 'SUSPENDED') {
      return {
        status: 'SUSPENDED',
        message: '⏸️ CLIENTE SUSPENDIDO. Contacte al Administrador.',
        device: dev
      };
    }

    if (dev.status === 'SUSPENDED') {
      return {
        status: 'SUSPENDED',
        message: '⏸️ PANTALLA SUSPENDIDA por el Administrador.',
        device: dev
      };
    }

    // CONTROL DE CONCURRENCIA ESTRICTO:
    // Si la sesión activa registrada en el backend es distinta al token de esta pantalla (o fue cerrada),
    // significa que se inició sesión en otro dispositivo físico o el administrador cerró la sesión remota.
    if (effectiveToken.sessionId && (!dev.activeSessionId || dev.activeSessionId !== effectiveToken.sessionId)) {
      return {
        status: 'SESSION_KICKED',
        code: 'CONCURRENT_SESSION_DETECTED',
        message: 'Se inició sesión en otro dispositivo. Si no lo autorizó, contacte a su administrador.'
      };
    }

    // Telemetría de la sesión activa
    dev.lastSeen = new Date().toISOString();
    if (ip) dev.ipAddress = ip;
    if (service) dev.activeService = service;
    dev.uptimeMinutesToday = (dev.uptimeMinutesToday || 0) + 1;
    dev.uptimeMinutesMonth = (dev.uptimeMinutesMonth || 0) + 1;

    return {
      status: 'APPROVED',
      device: dev,
      config: dev.config || (client && client.config) || DEFAULT_SCREEN_CONFIG,
      defaultService: dev.defaultService || (client && client.config && client.config.defaultService) || 'loteria',
      clientName: client ? client.name : (dev.clientName || 'Fenix')
    };
  }

  // 3. Si no hay sesión válida iniciada en la pantalla
  return {
    status: 'UNAUTHORIZED',
    message: 'Inicie sesión con su usuario y contraseña de pantalla.'
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

function authorizeDeviceForClient(clientId, pin, tvName, usernameOrOpts = null, password = null, planType = null, cloneFromDeviceId = null) {
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

  // Normalizar parámetros flexibles
  let username = null;
  let pass = null;
  let plan = planType;
  let cloneId = cloneFromDeviceId;

  if (typeof usernameOrOpts === 'object' && usernameOrOpts !== null) {
    username = usernameOrOpts.username;
    pass = usernameOrOpts.password;
    plan = usernameOrOpts.planType || plan;
    cloneId = usernameOrOpts.cloneFromDeviceId || cloneId;
  } else if (password !== null) {
    username = usernameOrOpts;
    pass = password;
  } else if (typeof usernameOrOpts === 'string' && !password) {
    cloneId = usernameOrOpts;
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

  // Heredar o clonar configuración de pantalla existente si se especificó
  let baseConfig = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
  if (cloneId && APPROVED_DEVICES.has(cloneId)) {
    const srcDev = APPROVED_DEVICES.get(cloneId);
    if (srcDev && srcDev.config) {
      baseConfig = JSON.parse(JSON.stringify(srcDev.config));
    }
  }

  // Calcular expiración según plan asignado (Requisito 4)
  const assignedPlan = plan || client.planType || 'MONTHLY';
  let deviceExpiresAt = client.expiresAt;
  const now = new Date();
  if (assignedPlan === 'WEEKLY') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    deviceExpiresAt = d.toISOString().split('T')[0];
  } else if (assignedPlan === 'DEMO') {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    deviceExpiresAt = d.toISOString().split('T')[0];
  } else if (assignedPlan === 'ANNUAL') {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    deviceExpiresAt = d.toISOString().split('T')[0];
  } else if (assignedPlan === 'MONTHLY') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    deviceExpiresAt = d.toISOString().split('T')[0];
  }

  // 4. Activar formalmente el dispositivo y vincularlo al cliente
  const newDev = {
    clientId: client.clientId,
    clientName: client.name,
    tvName: cleanName,
    deviceBinding: 'HARDWARE_LOCKED',
    status: 'APPROVED',
    registeredAt: new Date().toISOString().split('T')[0],
    expiresAt: deviceExpiresAt,
    planType: assignedPlan,
    defaultService: baseConfig.defaultService || 'loteria',
    activeService: baseConfig.defaultService || 'loteria',
    config: baseConfig,
    lastSeen: new Date().toISOString(),
    uptimeMinutesToday: 0,
    uptimeMinutesMonth: 0
  };

  // Crear o vincular cuenta individual de dispositivo (Usuario y Clave) si se especificaron
  const cleanUser = (username || '').trim().toLowerCase();
  const cleanPass = (pass || '').trim();
  let createdAccount = null;

  if (cleanUser && cleanPass) {
    const existingAcc = DEVICE_ACCOUNTS.get(cleanUser);
    createdAccount = {
      username: cleanUser,
      pass: cleanPass,
      clientId: client.clientId,
      clientName: client.name,
      tvName: cleanName,
      role: 'DEVICE',
      planType: assignedPlan,
      createdAt: existingAcc ? existingAcc.createdAt : new Date().toISOString()
    };
    DEVICE_ACCOUNTS.set(cleanUser, createdAccount);
    newDev.assignedUsername = cleanUser;
  }

  APPROVED_DEVICES.set(foundDevId, newDev);
  PENDING_ACTIVATIONS.delete(foundDevId);
  saveDatabase();

  return {
    success: true,
    deviceId: foundDevId,
    device: newDev,
    account: createdAccount,
    message: `¡Pantalla "${cleanName}" activada con éxito para ${client.name}! Plan: ${assignedPlan}${cleanUser ? ` • Usuario: @${cleanUser}` : ''}`
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
  if (dev.config) {
    dev.config.defaultService = defaultService;
  }
  saveDatabase();
  return { success: true, deviceId, defaultService: dev.defaultService, device: dev };
}

// Obtener Configuración Individual de Pantalla
function getDeviceConfig(deviceId, requestingClientId, userRole) {
  if (!APPROVED_DEVICES.has(deviceId)) {
    return { success: false, error: 'Dispositivo no encontrado.' };
  }
  const dev = APPROVED_DEVICES.get(deviceId);
  if (userRole !== ROLES.SUPER_ADMIN && dev.clientId !== requestingClientId) {
    return { success: false, error: 'No autorizado para ver la configuración de este dispositivo.' };
  }
  return { success: true, deviceId, config: dev.config || DEFAULT_SCREEN_CONFIG, device: dev };
}

// Modificar Configuración Individual de Pantalla
function updateDeviceConfig(deviceId, newConfig, requestingClientId, userRole) {
  if (!APPROVED_DEVICES.has(deviceId)) {
    return { success: false, error: 'Dispositivo no encontrado.' };
  }
  const dev = APPROVED_DEVICES.get(deviceId);
  if (userRole !== ROLES.SUPER_ADMIN && dev.clientId !== requestingClientId) {
    return { success: false, error: 'No tienes permiso para configurar esta pantalla.' };
  }

  const currentCfg = dev.config || JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
  dev.config = {
    ...currentCfg,
    ...newConfig,
    modules: {
      ...currentCfg.modules,
      ...(newConfig.modules || {})
    }
  };

  if (newConfig.defaultService) {
    dev.defaultService = newConfig.defaultService;
    dev.activeService = newConfig.defaultService;
  }

  saveDatabase();
  return { success: true, deviceId, config: dev.config, device: dev };
}

// Modificar Configuración en Lote (Uno, Varios o Todos los Dispositivos de la Organización)
function batchUpdateDeviceConfig(deviceIds, configUpdates, requestingClientId, userRole, applyToAll = false) {
  const updated = [];
  let targetIds = [];

  // Persistir la configuración en la ficha de la organización cliente para que jamás se reinicie (Petición 6)
  let savedClientCfg = null;
  if (requestingClientId && CLIENTS.has(requestingClientId)) {
    const client = CLIENTS.get(requestingClientId);
    const clientCurrentCfg = client.config || JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
    const mergedClientCfg = {
      ...clientCurrentCfg,
      ...configUpdates,
      modules: {
        ...clientCurrentCfg.modules,
        ...(configUpdates.modules || {})
      }
    };
    if (configUpdates.lotterySections) {
      mergedClientCfg.lotterySections = JSON.parse(JSON.stringify(configUpdates.lotterySections));
    }
    if (configUpdates.bgMusicEnabled !== undefined || configUpdates.circusMusicEnabled !== undefined) {
      const mActive = Boolean(configUpdates.bgMusicEnabled !== undefined ? configUpdates.bgMusicEnabled : configUpdates.circusMusicEnabled);
      mergedClientCfg.bgMusicEnabled = mActive;
      mergedClientCfg.circusMusicEnabled = mActive;
    }
    if (configUpdates.bgMusicTrack || configUpdates.circusMusicTrack) {
      const mTrack = configUpdates.bgMusicTrack || configUpdates.circusMusicTrack;
      mergedClientCfg.bgMusicTrack = mTrack;
      mergedClientCfg.circusMusicTrack = mTrack;
    }
    if (configUpdates.bgMusicVolume !== undefined || configUpdates.circusMusicVolume !== undefined) {
      const mVol = parseFloat(configUpdates.bgMusicVolume !== undefined ? configUpdates.bgMusicVolume : configUpdates.circusMusicVolume);
      mergedClientCfg.bgMusicVolume = mVol;
      mergedClientCfg.circusMusicVolume = mVol;
    }
    if (configUpdates.defaultService) {
      mergedClientCfg.defaultService = configUpdates.defaultService;
    }
    client.config = mergedClientCfg;
    savedClientCfg = mergedClientCfg;
  }

  // Persistir configuración en perfil de Super Administrador para que perdure permanentemente
  if (userRole === ROLES.SUPER_ADMIN && USERS['hector_owner']) {
    const currentSuperCfg = USERS['hector_owner'].config || JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
    const mergedSuperCfg = {
      ...currentSuperCfg,
      ...configUpdates,
      modules: {
        ...currentSuperCfg.modules,
        ...(configUpdates.modules || {})
      }
    };
    if (configUpdates.lotterySections) {
      mergedSuperCfg.lotterySections = JSON.parse(JSON.stringify(configUpdates.lotterySections));
    }
    USERS['hector_owner'].config = mergedSuperCfg;
    if (USERS['hector']) USERS['hector'].config = mergedSuperCfg;
    if (USERS['superadmin']) USERS['superadmin'].config = mergedSuperCfg;
  }

  if (applyToAll) {
    for (const [id, dev] of APPROVED_DEVICES.entries()) {
      if (userRole === ROLES.SUPER_ADMIN || dev.clientId === requestingClientId) {
        if (!targetIds.includes(id)) targetIds.push(id);
      }
    }
    for (const [id, acc] of DEVICE_ACCOUNTS.entries()) {
      if (userRole === ROLES.SUPER_ADMIN || acc.clientId === requestingClientId) {
        if (!targetIds.includes(id)) targetIds.push(id);
      }
    }
  } else if (Array.isArray(deviceIds)) {
    targetIds = deviceIds;
  }

  for (const id of targetIds) {
    const dev = APPROVED_DEVICES.get(id);
    const acc = DEVICE_ACCOUNTS.get(id);
    const targetObj = dev || acc;

    if (targetObj && (userRole === ROLES.SUPER_ADMIN || targetObj.clientId === requestingClientId)) {
      const currentCfg = targetObj.config || JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
      const mergedCfg = {
        ...currentCfg,
        ...configUpdates,
        modules: {
          ...currentCfg.modules,
          ...(configUpdates.modules || {})
        }
      };

      if (configUpdates.lotterySections) {
        mergedCfg.lotterySections = JSON.parse(JSON.stringify(configUpdates.lotterySections));
      }

      // Normalizar alias de música de fondo / circo
      if (configUpdates.bgMusicEnabled !== undefined || configUpdates.circusMusicEnabled !== undefined) {
        const mActive = Boolean(configUpdates.bgMusicEnabled !== undefined ? configUpdates.bgMusicEnabled : configUpdates.circusMusicEnabled);
        mergedCfg.bgMusicEnabled = mActive;
        mergedCfg.circusMusicEnabled = mActive;
      }

      if (configUpdates.bgMusicTrack || configUpdates.circusMusicTrack) {
        const mTrack = configUpdates.bgMusicTrack || configUpdates.circusMusicTrack;
        mergedCfg.bgMusicTrack = mTrack;
        mergedCfg.circusMusicTrack = mTrack;
      }

      if (configUpdates.bgMusicVolume !== undefined || configUpdates.circusMusicVolume !== undefined) {
        const mVol = parseFloat(configUpdates.bgMusicVolume !== undefined ? configUpdates.bgMusicVolume : configUpdates.circusMusicVolume);
        mergedCfg.bgMusicVolume = mVol;
        mergedCfg.circusMusicVolume = mVol;
      }

      if (dev) {
        dev.config = mergedCfg;
        if (configUpdates.defaultService) {
          dev.defaultService = configUpdates.defaultService;
          dev.activeService = configUpdates.defaultService;
        }
      }
      if (acc) {
        acc.config = mergedCfg;
        if (configUpdates.defaultService) {
          acc.defaultService = configUpdates.defaultService;
        }
      }
      updated.push(id);
    }
  }

  saveDatabase();
  return { success: true, updatedCount: updated.length, updatedDeviceIds: updated, clientConfig: savedClientCfg };
}

// ==========================================
// GESTIÓN DE PANTALLAS Y DISPOSITIVOS TV (USUARIO Y CONTRASEÑA)
// ==========================================

function createDeviceAccount(usernameOrObj, pass, clientId, tvName, defaultService = 'loteria', cloneFromDeviceId = null) {
  let cleanUser, cleanPass, targetClientId, targetTvName, targetDefService, targetClone;
  if (typeof usernameOrObj === 'object' && usernameOrObj !== null) {
    cleanUser = (usernameOrObj.username || '').trim().toLowerCase();
    cleanPass = (usernameOrObj.pass || usernameOrObj.password || '').trim();
    targetClientId = usernameOrObj.clientId || usernameOrObj.targetClientId;
    targetTvName = usernameOrObj.tvName;
    targetDefService = usernameOrObj.defaultService || 'loteria';
    targetClone = usernameOrObj.cloneFromDeviceId || null;
  } else {
    cleanUser = (usernameOrObj || '').trim().toLowerCase();
    cleanPass = (pass || '').trim();
    targetClientId = clientId;
    targetTvName = tvName;
    targetDefService = defaultService || 'loteria';
    targetClone = cloneFromDeviceId || null;
  }

  if (!cleanUser || !cleanPass) {
    return { success: false, error: 'Debe especificar usuario y contraseña.' };
  }
  if (DEVICE_ACCOUNTS.has(cleanUser) || USERS[cleanUser]) {
    return { success: false, error: 'El nombre de usuario/dispositivo ya está en uso.' };
  }
  const client = CLIENTS.get(targetClientId);
  if (!client) {
    return { success: false, error: 'Organización de cliente no encontrada.' };
  }
  if (client.status !== 'ACTIVE') {
    return { success: false, error: 'El cliente se encuentra suspendido.' };
  }

  // Validar cupo de pantallas del cliente
  const clientScreensCount = Array.from(DEVICE_ACCOUNTS.values()).filter(a => a.clientId === targetClientId).length;
  if (clientScreensCount >= (client.maxDevices || 4)) {
    return {
      success: false,
      error: `Ha alcanzado el cupo máximo contratado de pantallas (${clientScreensCount}/${client.maxDevices || 4}). Contacte al Super Administrador para ampliar su cupo.`
    };
  }

  // Clonar configuración si se especificó pantalla origen
  let baseConfig = JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG));
  if (targetClone && APPROVED_DEVICES.has(targetClone)) {
    const srcDev = APPROVED_DEVICES.get(targetClone);
    if (srcDev && srcDev.config) {
      baseConfig = JSON.parse(JSON.stringify(srcDev.config));
    }
  } else if (client.config) {
    baseConfig = JSON.parse(JSON.stringify(client.config));
  }
  baseConfig.defaultService = targetDefService || baseConfig.defaultService || 'loteria';

  const newAcc = {
    username: cleanUser,
    pass: cleanPass,
    clientId: targetClientId,
    clientName: client ? client.name : 'Fenix',
    tvName: (targetTvName || '').trim() || cleanUser,
    role: 'DEVICE',
    status: 'APPROVED',
    defaultService: targetDefService || 'loteria',
    activeService: targetDefService || 'loteria',
    activeSessionId: null,
    lastSeen: null,
    ipAddress: null,
    config: baseConfig,
    createdAt: new Date().toISOString().split('T')[0]
  };

  DEVICE_ACCOUNTS.set(cleanUser, newAcc);
  APPROVED_DEVICES.set(cleanUser, newAcc);
  saveDatabase();
  return {
    success: true,
    account: {
      ...newAcc,
      pass: '••••••••',
      hasActiveSession: false,
      isOnline: false
    }
  };
}

function getDeviceAccounts(userRole, clientId) {
  const list = [];
  const now = Date.now();
  for (const acc of DEVICE_ACCOUNTS.values()) {
    if (userRole === ROLES.SUPER_ADMIN || acc.clientId === clientId) {
      const lastSeenTime = acc.lastSeen ? new Date(acc.lastSeen).getTime() : 0;
      const isOnline = (now - lastSeenTime) < 45000;
      list.push({
        ...acc,
        pass: '••••••••',
        hasActiveSession: Boolean(acc.activeSessionId),
        isOnline
      });
    }
  }
  return list;
}

function updateDevicePassword(usernameOrObj, newPass, requestingClientId, userRole) {
  let cleanUser, cleanPass, reqClient, role;
  if (typeof usernameOrObj === 'object' && usernameOrObj !== null) {
    cleanUser = (usernameOrObj.username || '').trim().toLowerCase();
    cleanPass = (usernameOrObj.newPass || usernameOrObj.password || '').trim();
    reqClient = usernameOrObj.clientId || usernameOrObj.requestingClientId;
    role = usernameOrObj.userRole || usernameOrObj.role;
  } else {
    cleanUser = (usernameOrObj || '').trim().toLowerCase();
    cleanPass = (newPass || '').trim();
    if (Object.values(ROLES).includes(requestingClientId) || ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_MANAGER'].includes(requestingClientId)) {
      role = requestingClientId;
      reqClient = userRole;
    } else {
      reqClient = requestingClientId;
      role = userRole;
    }
  }

  if (!cleanPass) return { success: false, error: 'La nueva contraseña no puede estar vacía.' };
  if (!DEVICE_ACCOUNTS.has(cleanUser)) return { success: false, error: 'Pantalla no encontrada.' };

  const dev = DEVICE_ACCOUNTS.get(cleanUser);
  if (role !== ROLES.SUPER_ADMIN && dev.clientId !== reqClient) {
    return { success: false, error: 'No autorizado para modificar esta pantalla.' };
  }

  dev.pass = cleanPass;
  // Cerrar sesión activa al cambiar la clave para exigir reautenticación
  dev.activeSessionId = null;
  saveDatabase();
  return { success: true, message: `Contraseña actualizada para @${cleanUser}. Sesión anterior invalidada.` };
}

function kickDeviceSession(usernameOrObj, requestingClientId, userRole) {
  let cleanUser, reqClient, role;
  if (typeof usernameOrObj === 'object' && usernameOrObj !== null) {
    cleanUser = (usernameOrObj.username || '').trim().toLowerCase();
    reqClient = usernameOrObj.clientId || usernameOrObj.requestingClientId;
    role = usernameOrObj.userRole || usernameOrObj.role;
  } else {
    cleanUser = (usernameOrObj || '').trim().toLowerCase();
    if (Object.values(ROLES).includes(requestingClientId) || ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_MANAGER'].includes(requestingClientId)) {
      role = requestingClientId;
      reqClient = userRole;
    } else {
      reqClient = requestingClientId;
      role = userRole;
    }
  }

  if (!DEVICE_ACCOUNTS.has(cleanUser)) return { success: false, error: 'Pantalla no encontrada.' };

  const dev = DEVICE_ACCOUNTS.get(cleanUser);
  if (role !== ROLES.SUPER_ADMIN && dev.clientId !== reqClient) {
    return { success: false, error: 'No autorizado para desconectar esta pantalla.' };
  }

  dev.activeSessionId = null;
  saveDatabase();
  return { success: true, message: `Sesión remota cerrada para ${dev.tvName || cleanUser}.` };
}

function deleteDeviceAccount(usernameOrObj, arg2, arg3) {
  let cleanUser, role, client;
  if (typeof usernameOrObj === 'object' && usernameOrObj !== null) {
    cleanUser = (usernameOrObj.username || '').trim().toLowerCase();
    role = usernameOrObj.userRole || usernameOrObj.role;
    client = usernameOrObj.clientId;
  } else {
    cleanUser = (usernameOrObj || '').trim().toLowerCase();
    if (arg2 === ROLES.SUPER_ADMIN || arg2 === ROLES.CLIENT_ADMIN || arg2 === 'CLIENT_ADMIN' || arg2 === 'SUPER_ADMIN') {
      role = arg2;
      client = arg3;
    } else {
      client = arg2;
      role = arg3;
    }
  }

  if (!DEVICE_ACCOUNTS.has(cleanUser)) {
    return { success: false, error: 'Cuenta de dispositivo no encontrada.' };
  }
  const acc = DEVICE_ACCOUNTS.get(cleanUser);
  if (role !== ROLES.SUPER_ADMIN && acc.clientId !== client) {
    return { success: false, error: 'No autorizado para eliminar esta cuenta.' };
  }
  DEVICE_ACCOUNTS.delete(cleanUser);
  APPROVED_DEVICES.delete(cleanUser);
  saveDatabase();
  return { success: true, username: cleanUser, message: 'Pantalla eliminada y cupo liberado exitosamente.' };
}

// Clonar / Exportar Configuración de Pantalla a Otras Pantallas
function cloneDeviceConfig(sourceDeviceId, targetDeviceIds, requestingClientId, userRole) {
  if (!APPROVED_DEVICES.has(sourceDeviceId)) {
    return { success: false, error: 'Dispositivo origen no encontrado.' };
  }
  const src = APPROVED_DEVICES.get(sourceDeviceId);
  if (userRole !== ROLES.SUPER_ADMIN && src.clientId !== requestingClientId) {
    return { success: false, error: 'No autorizado para acceder a la configuración del dispositivo origen.' };
  }

  const srcConfig = JSON.parse(JSON.stringify(src.config || DEFAULT_SCREEN_CONFIG));
  const updated = [];
  const targets = Array.isArray(targetDeviceIds) ? targetDeviceIds : [targetDeviceIds];

  for (const tid of targets) {
    if (APPROVED_DEVICES.has(tid) && tid !== sourceDeviceId) {
      const targetDev = APPROVED_DEVICES.get(tid);
      if (userRole === ROLES.SUPER_ADMIN || targetDev.clientId === requestingClientId) {
        targetDev.config = JSON.parse(JSON.stringify(srcConfig));
        if (srcConfig.defaultService) {
          targetDev.defaultService = srcConfig.defaultService;
          targetDev.activeService = srcConfig.defaultService;
        }
        updated.push(tid);
      }
    }
  }

  saveDatabase();
  return { success: true, clonedFrom: sourceDeviceId, updatedCount: updated.length, updatedDeviceIds: updated };
}

function getApprovedDevicesList(userRole, clientId, filterClientId) {
  const list = [];
  const now = Date.now();
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
    const lastSeenTime = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
    const isOnline = (now - lastSeenTime) < 45000;
    list.push({
      id: dev.username || id,
      deviceId: dev.username || id,
      ...dev,
      pass: '••••••••',
      hasActiveSession: Boolean(dev.activeSessionId),
      isOnline,
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
    location: location || 'Oficina Central',
    config: JSON.parse(JSON.stringify(DEFAULT_SCREEN_CONFIG))
  };
  saveDatabase();
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
  saveDatabase();
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
  kickDeviceSession,
  syncDatabaseWithCloud
};
