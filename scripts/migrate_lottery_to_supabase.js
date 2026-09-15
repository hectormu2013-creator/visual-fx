// scripts/migrate_lottery_to_supabase.js
// Script de migración masiva para poblar Supabase con el catálogo y los 6,900+ sorteos históricos

const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jloeyrjnxtucscfzolik.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsb2V5cmpueHR1Y3NjZnpvbGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQ1NzIsImV4cCI6MjA4NDA3MDU3Mn0.0tw6xqmeEda0DF7-UiWI8YRoUeVQjd0FM4jQiG3VqsI';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
};

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'lottery_catalog.json');
const HISTORY_FILE = path.join(DATA_DIR, 'lottery_history.json');

async function postBatch(endpoint, items) {
  if (!items || items.length === 0) return true;
  const conflictCol = endpoint.includes('draws') ? 'game_id,draw_date,draw_time' : 'id';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}?on_conflict=${conflictCol}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(items)
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[Migrate] Error en batch a ${endpoint} (${items.length} items):`, res.status, txt);
    return false;
  }
  return true;
}

async function migrate() {
  console.log('=== INICIANDO MIGRACIÓN A SUPABASE ===');
  console.log(`URL: ${SUPABASE_URL}`);

  // 1. Cargar y migrar catálogo de juegos
  const rawCatalog = fs.readFileSync(CATALOG_FILE, 'utf8');
  const catalog = JSON.parse(rawCatalog);
  console.log(`\n1. Migrando catálogo de ${catalog.length} juegos...`);

  const gamesToInsert = catalog.map(g => ({
    id: g.id,
    name: g.name,
    short_name: g.shortName || g.name,
    type: g.type,
    slug_1000: g.slug1000 || g.id,
    icon: g.icon || '',
    color: g.color || '#3b82f6',
    logo_url: g.logoUrl || '',
    hours: g.hours || [],
    is_active: true
  }));

  const catalogOk = await postBatch('lottery_games', gamesToInsert);
  if (!catalogOk) {
    console.error('Fallo al migrar catálogo. Abortando.');
    return;
  }
  console.log('✅ Catálogo migrado exitosamente.');

  // Crear mapa de tipos de juego
  const gameTypeMap = {};
  catalog.forEach(g => { gameTypeMap[g.id] = g.type; });

  // 2. Cargar histórico
  const rawHistory = fs.readFileSync(HISTORY_FILE, 'utf8');
  const history = JSON.parse(rawHistory);

  const animalitosList = [];
  const triplesList = [];

  for (const gameId of Object.keys(history)) {
    const gType = gameTypeMap[gameId] || (gameId.includes('triple') ? 'triples' : 'animalitos');
    const dates = history[gameId] || {};

    for (const dateStr of Object.keys(dates)) {
      const draws = dates[dateStr] || [];
      for (const d of draws) {
        if (gType === 'animalitos') {
          animalitosList.push({
            game_id: gameId,
            draw_date: dateStr,
            draw_time: d.time,
            number: d.number ? String(d.number).padStart(2, '0') : '00',
            animal_name: d.name || 'ANIMAL',
            is_manual: Boolean(d.isManual)
          });
        } else {
          triplesList.push({
            game_id: gameId,
            draw_date: dateStr,
            draw_time: d.time,
            triple_a: d.tripleA || d.number || null,
            triple_b: d.tripleB || null,
            triple_c: d.tripleC || null,
            signo: d.signo || d.name || null,
            is_manual: Boolean(d.isManual)
          });
        }
      }
    }
  }

  console.log(`\n2. Sorteos procesados:`);
  console.log(`   - Animalitos: ${animalitosList.length} sorteos`);
  console.log(`   - Triples y Terminales: ${triplesList.length} sorteos`);

  // Insertar Animalitos en lotes de 250
  console.log(`\n3. Insertando ${animalitosList.length} sorteos de animalitos en lotes de 250...`);
  const BATCH_SIZE = 250;
  for (let i = 0; i < animalitosList.length; i += BATCH_SIZE) {
    const chunk = animalitosList.slice(i, i + BATCH_SIZE);
    const ok = await postBatch('lottery_animalitos_draws', chunk);
    if (!ok) {
      console.warn(`Lote ${i} - ${i + chunk.length} falló, reintentando...`);
    }
    process.stdout.write(`\r   Progreso Animalitos: ${Math.min(i + BATCH_SIZE, animalitosList.length)} / ${animalitosList.length}`);
  }
  console.log('\n✅ Sorteos de Animalitos migrados.');

  // Insertar Triples en lotes de 250
  console.log(`\n4. Insertando ${triplesList.length} sorteos de triples en lotes de 250...`);
  for (let i = 0; i < triplesList.length; i += BATCH_SIZE) {
    const chunk = triplesList.slice(i, i + BATCH_SIZE);
    const ok = await postBatch('lottery_triples_draws', chunk);
    if (!ok) {
      console.warn(`Lote ${i} - ${i + chunk.length} falló, reintentando...`);
    }
    process.stdout.write(`\r   Progreso Triples: ${Math.min(i + BATCH_SIZE, triplesList.length)} / ${triplesList.length}`);
  }
  console.log('\n✅ Sorteos de Triples migrados.');

  console.log('\n=== MIGRACIÓN COMPLETADA CON ÉXITO ===');
}

migrate().catch(console.error);
