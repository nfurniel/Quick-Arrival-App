// Gestiona las paradas guardadas del usuario en la base de datos.
// Usa el cliente de Supabase con la clave anónima + RLS,
// de forma que cada usuario solo puede ver y modificar sus propios favoritos.

import { supabase } from '../supabaseClient';

export async function loadFavourites() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('favourites')
    .select('id, stop_id, alias, line_id, created_at, static_stops(name, lat, lng, cod_mode, cod_estacion, lines)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[favourites] Error cargando:', error.message);
    return [];
  }

  return (data || []).map(fav => {
    const s = fav.static_stops;
    return {
      id:          fav.id,
      stopId:      fav.stop_id,
      alias:       fav.alias,
      name:        fav.alias || s?.name || 'Parada',
      lat:         s?.lat,
      lng:         s?.lng,
      codMode:     s?.cod_mode,
      codEstacion: s?.cod_estacion,
      lines:       s?.lines ? s.lines.split(',').map(l => l.trim()).filter(Boolean) : [],
      codStop:     s ? `${s.cod_mode}_${s.cod_estacion}` : '',
      typeLabel:   s?.cod_mode === 8 ? 'Interurbano' : 'Urbano',
    };
  });
}

export async function addFavourite(stopId, alias = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('favourites')
    .insert({ user_id: user.id, stop_id: stopId, alias });

  if (error) {
    console.error('[favourites] Error añadiendo:', error.message);
    return false;
  }
  return true;
}

export async function removeFavourite(stopId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('favourites')
    .delete()
    .eq('user_id', user.id)
    .eq('stop_id', stopId);

  if (error) {
    console.error('[favourites] Error eliminando:', error.message);
    return false;
  }
  return true;
}
