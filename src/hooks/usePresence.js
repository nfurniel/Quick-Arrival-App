// usePresence.js — Hook para ver a otros usuarios en el mapa en tiempo real
// Usa Supabase Realtime Presence: cada usuario emite su ubicacion y avatar
// y recibe la de los demas usuarios conectados.

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

const CHANNEL_NAME = 'map-presence';
const UPDATE_INTERVAL = 10000; // Emitir ubicacion cada 10 segundos

export default function usePresence(userLocation, userName, avatarIndex) {
  const [otherUsers, setOtherUsers] = useState([]);
  const channelRef = useRef(null);
  const currentUserIdRef = useRef(null);

  // Guardar los valores actuales en refs para no recrear el canal
  const locationRef = useRef(userLocation);
  const nameRef = useRef(userName);
  const avatarRef = useRef(avatarIndex);

  locationRef.current = userLocation;
  nameRef.current = userName;
  avatarRef.current = avatarIndex;

  // Crear el canal una sola vez, cuando llega la ubicacion
  useEffect(() => {
    if (!userLocation) return;
    if (channelRef.current) return; // canal ya creado, no recrear

    let intervalId;
    let montado = true;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !montado) return;
      currentUserIdRef.current = user.id;

      const channel = supabase.channel(CHANNEL_NAME, {
        config: { presence: { key: user.id } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const users = [];
          Object.entries(state).forEach(([userId, presences]) => {
            if (userId === currentUserIdRef.current) return;
            const last = presences[presences.length - 1];
            if (last?.lat && last?.lng) {
              users.push({
                id: userId,
                lat: last.lat,
                lng: last.lng,
                name: last.name || 'Usuario',
                avatar: last.avatar || 0,
              });
            }
          });
          setOtherUsers(users);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              lat: locationRef.current[0],
              lng: locationRef.current[1],
              name: nameRef.current,
              avatar: avatarRef.current,
            });

            intervalId = setInterval(async () => {
              if (!montado) return;
              await channel.track({
                lat: locationRef.current[0],
                lng: locationRef.current[1],
                name: nameRef.current,
                avatar: avatarRef.current,
              });
            }, UPDATE_INTERVAL);
          }
        });

      channelRef.current = channel;
    }

    init();

    return () => {
      montado = false;
      clearInterval(intervalId);
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userLocation]); // Se activa cuando llega la ubicacion por primera vez

  return otherUsers;
}
