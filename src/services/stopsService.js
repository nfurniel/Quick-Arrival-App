// stopsService.js - Servicio para cargar las paradas desde Supabase
// Las paradas estan guardadas en la tabla static_stops de nuestra BBDD
// y se cargan segun lo que el usuario ve en el mapa (viewport)

import { supabase } from '../supabaseClient';

// Consultar las paradas que estan dentro del area visible del mapa
// Recibe las coordenadas de las esquinas del viewport
export async function getStopsInBounds(minLng, minLat, maxLng, maxLat) {
  const { data, error } = await supabase
    .from('static_stops')
    .select('stop_id, name, lat, lng, cod_mode, cod_estacion, lines')
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lng', minLng)
    .lte('lng', maxLng)
    .in('cod_mode', [6, 8])
    .limit(500);

  if (error) {
    console.error('Error cargando paradas:', error.message);
    return [];
  }

  return data || [];
}

// Cache de todas las lineas unicas
let allLinesCache = null;

// Obtener todas las lineas unicas de la BBDD
export async function getAllLines() {
  if (allLinesCache) return allLinesCache;

  const { data, error } = await supabase
    .from('static_stops')
    .select('lines')
    .in('cod_mode', [6, 8])
    .not('lines', 'is', null);

  if (error || !data) {
    console.error('Error cargando lineas:', error?.message);
    return [];
  }

  const linesSet = new Set();
  data.forEach(stop => {
    if (stop.lines) {
      stop.lines.split(',').forEach(l => {
        const trimmed = l.trim();
        if (trimmed) linesSet.add(trimmed);
      });
    }
  });

  allLinesCache = [...linesSet].sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });

  return allLinesCache;
}

// Distancia Haversine entre dos puntos (en metros)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buscar las paradas mas cercanas al usuario que tengan una linea concreta
// Devuelve max 4 paradas ordenadas por distancia
export async function getNearbyStopsForLine(userLat, userLng, lineNumber, radiusKm = 1.5) {
  const latOffset = radiusKm / 111;
  const lngOffset = radiusKm / (111 * Math.cos((userLat * Math.PI) / 180));

  const { data, error } = await supabase
    .from('static_stops')
    .select('stop_id, name, lat, lng, cod_mode, cod_estacion, lines')
    .gte('lat', userLat - latOffset)
    .lte('lat', userLat + latOffset)
    .gte('lng', userLng - lngOffset)
    .lte('lng', userLng + lngOffset)
    .in('cod_mode', [6, 8])
    .ilike('lines', `%${lineNumber}%`)
    .limit(100);

  if (error) {
    console.error('Error buscando paradas por linea:', error.message);
    return [];
  }

  if (!data) return [];

  const search = lineNumber.toLowerCase().trim();

  return data
    .filter(stop => {
      if (!stop.lines) return false;
      const lineas = stop.lines.split(',').map(l => l.trim().toLowerCase());
      return lineas.includes(search);
    })
    .map(stop => ({
      ...stop,
      distance: Math.round(haversine(userLat, userLng, stop.lat, stop.lng)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
}
