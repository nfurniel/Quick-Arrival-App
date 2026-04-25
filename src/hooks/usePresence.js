import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const INTERVALO = 10 * 60 * 1000; // 10 minutos

export default function usePresence(userLocation, userName, avatar) {
  const [otherUsers, setOtherUsers] = useState([]);

  // Guardar mi ubicación al conectar y cada 10 minutos
  useEffect(() => {
    if (!userLocation) return;

    async function guardarUbicacion() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_locations').upsert({
        user_id: user.id,
        lat: userLocation[0],
        lng: userLocation[1],
        name: userName,
        avatar,
        updated_at: new Date().toISOString(),
      });
    }

    guardarUbicacion();
    const id = setInterval(guardarUbicacion, INTERVALO);
    return () => clearInterval(id);
  }, [userLocation, userName, avatar]);

  // Leer ubicaciones de otros usuarios cada 10 minutos
  useEffect(() => {
    async function leerUbicaciones() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const hace10min = new Date(Date.now() - INTERVALO).toISOString();
      const { data } = await supabase
        .from('user_locations')
        .select('*')
        .neq('user_id', user.id)
        .gte('updated_at', hace10min);

      setOtherUsers((data || []).map(u => ({
        id: u.user_id,
        lat: u.lat,
        lng: u.lng,
        name: u.name,
        avatar: u.avatar,
      })));
    }

    leerUbicaciones();
    const id = setInterval(leerUbicaciones, INTERVALO);
    return () => clearInterval(id);
  }, []);

  return otherUsers;
}
