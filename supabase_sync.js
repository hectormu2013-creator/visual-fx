// supabase_sync.js - Módulo de Persistencia Permanente en la Nube con Supabase
// Asegura que las organizaciones clientes, dispositivos y cuentas de TV perduren
// independientemente de los reinicios o despliegues efímeros de Render.

const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jloeyrjnxtucscfzolik.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsb2V5cmpueHR1Y3NjZnpvbGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQ1NzIsImV4cCI6MjA4NDA3MDU3Mn0.0tw6xqmeEda0DF7-UiWI8YRoUeVQjd0FM4jQiG3VqsI';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * Guarda o actualiza un registro en la tabla visual_fx_store de Supabase.
 * @param {string} key - Clave única (ej. 'clients', 'devices', 'device_accounts', 'system_users')
 * @param {any} data - Objeto o arreglo a persistir en formato JSON
 */
async function saveToCloud(key, data) {
  if (!key || data === undefined) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        key,
        data,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[SupabaseSync] Error al guardar "${key}":`, res.status, errText);
      return false;
    }
    return true;
  } catch (err) {
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
  try {
    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store?key=eq.${encodeURIComponent(key)}&select=data`;
    const res = await fetch(url, { method: 'GET', headers: HEADERS });
    if (!res.ok) return null;
    const records = await res.json();
    if (Array.isArray(records) && records.length > 0) {
      return records[0].data;
    }
    return null;
  } catch (err) {
    console.warn(`[SupabaseSync] Error consultando "${key}":`, err.message);
    return null;
  }
}

/**
 * Carga todos los registros almacenados en visual_fx_store.
 * Devuelve un mapa { [key]: data }
 */
async function loadAllFromCloud() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/visual_fx_store?select=key,data,updated_at`;
    const res = await fetch(url, { method: 'GET', headers: HEADERS });
    if (!res.ok) return {};
    const records = await res.json();
    const map = {};
    if (Array.isArray(records)) {
      records.forEach(r => {
        if (r && r.key) {
          map[r.key] = r.data;
        }
      });
    }
    return map;
  } catch (err) {
    console.warn('[SupabaseSync] Error cargando todos los registros de la nube:', err.message);
    return {};
  }
}

module.exports = {
  saveToCloud,
  loadFromCloud,
  loadAllFromCloud
};
