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

  useEffect(() => {
    if (!userLocation) return;

    let intervalId;

    async function init() {
      // Obtener el ID del usuario actual para no pintarse a si mismo
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
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
            // Cada usuario puede tener varias presencias, coger la ultima
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
            // Emitir ubicacion inicial
            await channel.track({
              lat: userLocation[0],
              lng: userLocation[1],
              name: userName,
              avatar: avatarIndex,
            });

            // Actualizar posicion periodicamente
            intervalId = setInterval(async () => {
              await channel.track({
                lat: userLocation[0],
                lng: userLocation[1],
                name: userName,
                avatar: avatarIndex,
              });
            }, UPDATE_INTERVAL);
          }
        });

      channelRef.current = channel;
    }

    init();

    return () => {
      clearInterval(intervalId);
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userLocation, userName, avatarIndex]);

  return otherUsers;
}
