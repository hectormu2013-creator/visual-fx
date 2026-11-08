// supabase_sync.js - Módulo de Persistencia Permanente en la Nube con Supabase
// Asegura que las organizaciones clientes, dispositivos y cuentas de TV perduren
// independientemente de los reinicios o despliegues efímeros de Render / Railway.

const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jloeyrjnxtucscfzolik.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsb2V5cmpueHR1Y3NjZnpvbGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQ1NzIsImV4cCI6MjA4NDA3MDU3Mn0.0tw6xqmeEda0DF7-UiWI8YRoUeVQjd0FM4jQiG3VqsI';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

let syncCircuitPausedUntil = 0;
const lastSavedPayloadByKey = new Map();

function isSyncCircuitOpen() {
  return Date.now() < syncCircuitPausedUntil;
}

function tripSyncCircuit(reason) {
  syncCircuitPausedUntil = Date.now() + 3 * 60 * 1000; // Pausa de 3 min ante saturación 5xx/timeout
  console.warn(`[SupabaseSync] Cortacircuitos activado por 3 min (${reason}).`);
}

/**
 * Guarda o actualiza un registro en la tabla visual_fx_store de Supabase.
 * @param {string} key - Clave única (ej. 'clients', 'devices', 'device_accounts', 'system_users')
 * @param {any} data - Objeto o arreglo a persistir en formato JSON
 */
async function saveToCloud(key, data) {
  if (!key || data === undefined) return false;
  if (isSyncCircuitOpen()) return false;
  try {
    const serializedData = JSON.stringify(data);
    if (serializedData.length > 500000) {
      console.warn(`[SupabaseSync] Omitiendo guardado de "${key}" por tamaño excesivo (${serializedData.length} bytes).`);
      return false;
    }
    if (lastSavedPayloadByKey.get(key) === serializedData) {
      return true;
    }

    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store?on_conflict=key`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        key,
        data,
        updated_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) tripSyncCircuit(`HTTP ${res.status}`);
      const errText = await res.text();
      console.warn(`[SupabaseSync] Error al guardar "${key}":`, res.status, errText);
      return false;
    }
    lastSavedPayloadByKey.set(key, serializedData);
    return true;
  } catch (err) {
    tripSyncCircuit(err.message || 'fetch failed');
    console.warn(`[SupabaseSync] Excepción de red al guardar "${key}":`, err.message);
    return false;
  }
}

/**
 * Carga un registro específico desde Supabase.
 * @param {string} key - Clave a consultar
 */
async function loadFromCloud(key) {
  if (!key) return null;
  if (isSyncCircuitOpen()) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store?key=eq.${encodeURIComponent(key)}&select=data`;
    const res = await fetch(url, {
      method: 'GET',
      headers: HEADERS,
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) tripSyncCircuit(`HTTP ${res.status}`);
      return null;
    }
    const records = await res.json();
    if (Array.isArray(records) && records.length > 0) {
      return records[0].data;
    }
    return null;
  } catch (err) {
    tripSyncCircuit(err.message || 'fetch failed');
    console.warn(`[SupabaseSync] Error consultando "${key}":`, err.message);
    return null;
  }
}

/**
 * Carga los registros operativos principales almacenados en visual_fx_store
 * excluyendo historiales pesados (suite_history_v2, backups) para no saturar PostgREST.
 * Devuelve un mapa { [key]: data }
 */
async function loadAllFromCloud() {
  if (isSyncCircuitOpen()) return null;
  try {
    const allowedKeys = 'clients,devices,device_accounts,system_users,racing_schedule,bandwidth_telemetry,rtn_bridge_cache';
    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store?key=in.(${allowedKeys})&select=key,data,updated_at`;
    const res = await fetch(url, {
      method: 'GET',
      headers: HEADERS,
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) tripSyncCircuit(`HTTP ${res.status}`);
      console.warn(`[SupabaseSync] Lectura de la nube falló (HTTP ${res.status}).`);
      return null; // null = error (distinto de nube vacía)
    }
    const records = await res.json();
    const map = {};
    if (Array.isArray(records)) {
      records.forEach(r => {
        if (r && r.key) {
          map[r.key] = r.data;
          try {
            lastSavedPayloadByKey.set(r.key, JSON.stringify(r.data));
          } catch (_) {}
        }
      });
    }
    return map;
  } catch (err) {
    tripSyncCircuit(err.message || 'fetch failed');
    console.warn('[SupabaseSync] Error cargando todos los registros de la nube:', err.message);
    return null; // null = error (distinto de nube vacía)
  }
}

module.exports = {
  saveToCloud,
  loadFromCloud,
  loadAllFromCloud
};
