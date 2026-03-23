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
