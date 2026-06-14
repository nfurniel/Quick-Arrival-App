// LiveBusLayer.jsx — Tracking del bus en tiempo real con ruta OSRM
import React, { useEffect, useState, useRef } from 'react';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getBusLocation } from '../../services/crtmService';
import { getInterurbanBusRoute } from '../../services/routeGeometryService';
import { liveBusIcon, trackingStopIcon } from './mapIcons';

// Pedir ruta real por carretera usando OSRM (gratuito, sin API key)
async function fetchRoute(fromLat, fromLng, toLat, toLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.routes && json.routes.length > 0) {
      // OSRM devuelve [lng, lat], Leaflet necesita [lat, lng]
      return json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    }
  } catch (e) {
    console.error('Error obteniendo ruta OSRM:', e);
  }
  return null;
}

// Componente que muestra el bus movinedose en tiempo real con ruta ezz
export default function LiveBusLayer({ selectedBus, onStatusChange }) {
  const [busLocations, setBusLocations] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const map = useMap();
  const yaCentrado = useRef(false);
  const hasLocation = useRef(false);

  // Resetear cuando cambiamos de bus
  useEffect(() => {
    yaCentrado.current = false;
    hasLocation.current = false;
    setBusLocations([]);
    setRoutePath([]);
  }, [selectedBus]);

  // Pedir la ubicacion del bus cada 8 segundos
  useEffect(() => {
    if (!selectedBus) return;

    hasLocation.current = false;
    onStatusChange?.('loading');

    let timeoutId;
    let timeoutWarning;
    let montado = true;

    // Si tras 10s no se encuentra la ubicacion , avisar al usuario
    timeoutWarning = setTimeout(() => {
      if (!hasLocation.current && montado) onStatusChange?.('timeout');
    }, 10000);

    async function pedirUbicacion() {
      try {
        const ubicaciones = await getBusLocation(
          selectedBus.codMode,
          selectedBus.codLine,
          selectedBus.direction,
          selectedBus.codStop,
          1,
          selectedBus.busId,
          selectedBus.codItinerary
        );

        if (ubicaciones && ubicaciones.length > 0 && montado) {
          // El bus que vamos a mostrar (null = ninguno válido todavía)
          let busParaRuta = null;

          if (String(selectedBus.codMode) === '8') {
            // Interurbano: trazado REAL del CRTM. Solo seguimos el bus que VIENE
            // a por ti (no el más cercano en línea recta ni uno que ya pasó la
            // parada) y dibujamos el recorrido siguiendo la calle, sin OSRM.
            const info = await getInterurbanBusRoute(selectedBus, ubicaciones);
            if (!montado) return;
            if (info.chosenBus) {
              busParaRuta = info.chosenBus;
              setBusLocations([busParaRuta]);
              setRoutePath(info.routePath || []);
            } else {
              // Ningún bus viene hacia la parada (los que hay ya pasaron o el de
              // tu tiempo aún no tiene GPS) → no mostramos un bus que ya se fue.
              setBusLocations([]);
              setRoutePath([]);
            }
          } else {
            // Urbano (EMT): comportamiento anterior con OSRM.
            // Si hay varios buses en la línea, mostrar el más cercano a la parada.
            if (ubicaciones.length > 1 && selectedBus.stopLat && selectedBus.stopLng) {
              busParaRuta = ubicaciones.reduce((closest, loc) => {
                const distLoc = Math.hypot(loc.latitude - selectedBus.stopLat, loc.longitude - selectedBus.stopLng);
                const distClosest = Math.hypot(closest.latitude - selectedBus.stopLat, closest.longitude - selectedBus.stopLng);
                return distLoc < distClosest ? loc : closest;
              });
              setBusLocations([busParaRuta]);
            } else {
              busParaRuta = ubicaciones[0];
              setBusLocations(ubicaciones);
            }

            if (selectedBus.stopLat && selectedBus.stopLng) {
              const ruta = await fetchRoute(
                busParaRuta.latitude, busParaRuta.longitude,
                selectedBus.stopLat, selectedBus.stopLng
              );
              if (ruta && montado) setRoutePath(ruta);
            }
          }

          if (!montado) return;

          if (busParaRuta) {
            // Tenemos un bus que mostrar
            if (!hasLocation.current) {
              hasLocation.current = true;
              clearTimeout(timeoutWarning);
            }
            onStatusChange?.('found');

            // Centrar el mapa para ver bus y parada la primera vez
            if (!yaCentrado.current) {
              yaCentrado.current = true;
              if (selectedBus.stopLat && selectedBus.stopLng) {
                const bounds = L.latLngBounds(
                  [busParaRuta.latitude, busParaRuta.longitude],
                  [selectedBus.stopLat, selectedBus.stopLng]
                );
                map.fitBounds(bounds.pad(0.3), { animate: true, duration: 1 });
              } else {
                map.setView([busParaRuta.latitude, busParaRuta.longitude], 15, { animate: true });
              }
            }
          } else {
            // Ningún bus viene todavía → "aún sin localizar" (seguimos cada 8s)
            onStatusChange?.('timeout');
          }
        }
      } catch (e) {
        console.error("Error obteniendo ubicacion del bus:", e);
      } finally {
        // Usamos setTimeout para que no se solape basicamente 
        // si una peticion tarda mas de 8s (el CRTM a veces se pone lento)
        if (montado) {
          timeoutId = setTimeout(pedirUbicacion, 8000);
        }
      }
    }

    pedirUbicacion();

    return () => {
      montado = false;
      clearTimeout(timeoutId);
      clearTimeout(timeoutWarning);
    };
  }, [selectedBus, map]);

  const stopPos = selectedBus.stopLat && selectedBus.stopLng
    ? [selectedBus.stopLat, selectedBus.stopLng]
    : null;

  return (
    <>
      {/* Ruta entre el bus y la parada */}
      {routePath.length > 0 && (
        <Polyline
          positions={routePath}
          pathOptions={{
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8,
            dashArray: '12, 8',
            lineCap: 'round',
            lineJoin: 'round'
          }}
        />
      )}

      {/* Marcador de la parada destino */}
      {stopPos && (
        <Marker position={stopPos} icon={trackingStopIcon} zIndexOffset={900}>
          <Popup>
            <strong>{selectedBus.stopName}</strong>
            <br />
            Tu parada
          </Popup>
        </Marker>
      )}

      {/* Marcadores del bus */}
      {busLocations.map((loc, idx) => (
        <Marker
          key={loc.vehicleId || idx}
          position={[loc.latitude, loc.longitude]}
          icon={liveBusIcon}
          zIndexOffset={1000}
        >
          <Popup>
            <strong>Línea {selectedBus.line} (En movimiento)</strong>
            <br />
            Destino: {selectedBus.destination}
          </Popup>
        </Marker>
      ))}
    </>
  );
}
