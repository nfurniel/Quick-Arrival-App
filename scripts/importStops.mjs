// Script para importar todas las paradas de bus a Supabase
// Se ejecuta una sola vez con: node scripts/importStops.mjs
// Descarga las paradas del ArcGIS del CRTM y las mete en nuestra BBDD

import { createClient } from '@supabase/supabase-js';

// Conexion a Supabase (mismas credenciales que en el frontend)
const supabase = createClient(
  'https://tumoqeuueqbvfstdhdmn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bW9xZXV1ZXFidmZzdGRoZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTcwMTIsImV4cCI6MjA4NTk3MzAxMn0.3WtuEz7LwxyYq9V4EIZm7DXFuQlb_4z-J5y5QYyD6zA'
);

// URLs del ArcGIS del CRTM donde estan las paradas
const ARCGIS = 'https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services';
const URL_INTERURBANO = `${ARCGIS}/M8_Red/FeatureServer/0/query`;
const URL_URBANO = `${ARCGIS}/M6_Red/FeatureServer/0/query`;

// Descargar todas las paradas de un endpoint, paginando de 1000 en 1000
async function descargarParadas(url, codMode) {
  const todas = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: 'DENOMINACION,LINEAS,CODIGOESTACION',
      resultRecordCount: '1000',
      resultOffset: String(offset),
      outSR: '4326',
      f: 'geojson',
    });

    const res = await fetch(`${url}?${params}`);
    if (!res.ok) throw new Error(`Error HTTP ${res.status} en offset ${offset}`);

    const data = await res.json();
    const features = data.features || [];

    if (features.length === 0) break;

    todas.push(...features.map(f => ({ ...f, codMode })));
    console.log(`  ${todas.length} paradas descargadas (modo ${codMode})...`);

    offset += 1000;
    if (features.length < 1000) break;
  }

  return todas;
}

// Funcion principal
async function main() {
  console.log('=== Importando paradas a Supabase ===\n');

  // Descargar interurbanas y urbanas
  console.log('Descargando interurbanas (modo 8)...');
  const interurbanas = await descargarParadas(URL_INTERURBANO, 8);
  console.log(`Total interurbanas: ${interurbanas.length}\n`);

  console.log('Descargando urbanas EMT (modo 6)...');
  const urbanas = await descargarParadas(URL_URBANO, 6);
  console.log(`Total urbanas: ${urbanas.length}\n`);

  const todas = [...interurbanas, ...urbanas];
  console.log(`Total descargadas: ${todas.length}\n`);

  // Convertir al formato de nuestra tabla static_stops
  const filas = todas.map(f => {
    const coords = f.geometry?.coordinates;
    const props = f.properties || {};
    const codEstacion = String(props.CODIGOESTACION || '');

    return {
      stop_id: f.codMode * 1000000 + parseInt(codEstacion, 10),
      name: props.DENOMINACION || 'Parada sin nombre',
      lat: coords ? coords[1] : 0,
      lng: coords ? coords[0] : 0,
      cod_mode: f.codMode,
      cod_estacion: codEstacion,
      lines: props.LINEAS || null,
    };
  }).filter(r => r.lat !== 0 && r.lng !== 0 && !isNaN(r.stop_id));

  // Quitar duplicados
  const unicas = [...new Map(filas.map(r => [r.stop_id, r])).values()];
  console.log(`Paradas unicas: ${unicas.length}\n`);

  // Insertar en Supabase de 500 en 500
  let insertadas = 0;
  for (let i = 0; i < unicas.length; i += 500) {
    const lote = unicas.slice(i, i + 500);
    const { error } = await supabase
      .from('static_stops')
      .upsert(lote, { onConflict: 'stop_id' });

    if (error) {
      console.error(`Error en lote ${i}: ${error.message}`);
    } else {
      insertadas += lote.length;
      console.log(`${insertadas}/${unicas.length} paradas insertadas...`);
    }
  }

  console.log(`\n=== Listo! ${insertadas} paradas importadas ===`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
