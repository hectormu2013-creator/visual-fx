// supabase_lottery.js - Conexión directa y sincronización con Supabase para Loterías
// Maneja la persistencia en las tablas public.lottery_games, public.lottery_animalitos_draws y public.lottery_triples_draws

const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jloeyrjnxtucscfzolik.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsb2V5cmpueHR1Y3NjZnpvbGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQ1NzIsImV4cCI6MjA4NDA3MDU3Mn0.0tw6xqmeEda0DF7-UiWI8YRoUeVQjd0FM4jQiG3VqsI';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
};

/**
 * Guarda o actualiza un juego en public.lottery_games
 */
async function syncGameToCloud(game) {
  if (!game || !game.id) return false;
  try {
    const payload = {
      id: game.id,
      name: game.name,
      short_name: game.shortName || game.name,
      type: game.type || 'animalitos',
      slug_1000: game.slug1000 || game.id,
      icon: game.icon || '',
      color: game.color || '#3b82f6',
      logo_url: game.logoUrl || '',
      hours: game.hours || [],
      is_active: game.isActive !== false,
      updated_at: new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/lottery_games`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[SupabaseLottery] Error al sincronizar juego "${game.id}":`, res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[SupabaseLottery] Excepción sincronizando juego "${game.id}":`, e.message);
    return false;
  }
}

/**
 * Guarda o actualiza un lote de sorteos en la tabla correspondiente (Animalitos o Triples)
 */
async function syncDrawsToCloud(gameId, drawDate, draws, gameType = 'animalitos') {
  if (!gameId || !drawDate || !Array.isArray(draws) || draws.length === 0) return false;

  const validDraws = draws.filter(d => !d.isPending && (d.number || d.tripleA || d.tripleB));
  if (validDraws.length === 0) return true;

  const isAnimal = gameType === 'animalitos';
  const endpoint = isAnimal ? 'lottery_animalitos_draws' : 'lottery_triples_draws';

  const rows = validDraws.map(d => {
    if (isAnimal) {
      return {
        game_id: gameId,
        draw_date: drawDate,
        draw_time: d.time,
        number: d.number ? String(d.number).padStart(2, '0') : '00',
        animal_name: d.name || 'ANIMAL',
        is_manual: Boolean(d.isManual)
      };
    } else {
      return {
        game_id: gameId,
        draw_date: drawDate,
        draw_time: d.time,
        triple_a: d.tripleA || d.number || null,
        triple_b: d.tripleB || null,
        triple_c: d.tripleC || null,
        signo: d.signo || d.name || null,
        is_manual: Boolean(d.isManual)
      };
    }
  });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}?on_conflict=game_id,draw_date,draw_time`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[SupabaseLottery] Error guardando sorteos en ${endpoint} (${rows.length} rows):`, res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[SupabaseLottery] Excepción de red guardando sorteos en ${endpoint}:`, e.message);
    return false;
  }
}

/**
 * Consulta el conteo de sorteos en la nube para auditoría
 */
async function getCloudCounts() {
  try {
    const [resGames, resAnimals, resTriples] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/lottery_games?select=id`, { headers: { ...HEADERS, 'Prefer': 'count=exact' } }),
      fetch(`${SUPABASE_URL}/rest/v1/lottery_animalitos_draws?select=id`, { headers: { ...HEADERS, 'Prefer': 'count=exact' } }),
      fetch(`${SUPABASE_URL}/rest/v1/lottery_triples_draws?select=id`, { headers: { ...HEADERS, 'Prefer': 'count=exact' } })
    ]);

    const getCount = (res) => {
      const cr = res.headers.get('content-range');
      if (cr && cr.includes('/')) return parseInt(cr.split('/')[1]) || 0;
      return 0;
    };

    return {
      gamesCount: getCount(resGames),
      animalitosDrawsCount: getCount(resAnimals),
      triplesDrawsCount: getCount(resTriples)
    };
  } catch (e) {
    console.warn('[SupabaseLottery] Error consultando conteos en la nube:', e.message);
    return null;
  }
}

/**
 * Consulta números calientes de animalitos directamente desde Supabase RPC
 */
async function getHotNumbersAnimalitosFromCloud(gameId, days = 30, limit = 5) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_hot_numbers_animalitos`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_game_id: gameId, p_days: days, p_limit: limit })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[SupabaseLottery] Error consultando números calientes para ${gameId}:`, e.message);
    return null;
  }
}

/**
 * Consulta números atrasados de animalitos directamente desde Supabase RPC
 */
async function getOverdueNumbersAnimalitosFromCloud(gameId, limit = 5) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_overdue_numbers_animalitos`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_game_id: gameId, p_limit: limit })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[SupabaseLottery] Error consultando atrasados para ${gameId}:`, e.message);
    return null;
  }
}

/**
 * Consulta terminales calientes de triples directamente desde Supabase RPC
 */
async function getHotTerminalsTriplesFromCloud(gameId, days = 30, limit = 5) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_hot_terminals_triples`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_game_id: gameId, p_days: days, p_limit: limit })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[SupabaseLottery] Error consultando terminales calientes para ${gameId}:`, e.message);
    return null;
  }
}

/**
 * Consulta terminales atrasados de triples directamente desde Supabase RPC
 */
async function getOverdueTerminalsTriplesFromCloud(gameId, limit = 5) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_overdue_terminals_triples`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_game_id: gameId, p_limit: limit })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[SupabaseLottery] Error consultando terminales atrasados para ${gameId}:`, e.message);
    return null;
  }
}

module.exports = {
  syncGameToCloud,
  syncDrawsToCloud,
  getCloudCounts,
  getHotNumbersAnimalitosFromCloud,
  getOverdueNumbersAnimalitosFromCloud,
  getHotTerminalsTriplesFromCloud,
  getOverdueTerminalsTriplesFromCloud
};

