import { useEffect, useRef, useState } from 'react';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Tipos de incidencia de TomTom con su emoji, etiqueta y color
const TIPOS_INCIDENCIA = {
  1:  { emoji: '🚨', label: 'Accidente',        color: '#dc2626' },
  6:  { emoji: '🚗', label: 'Retención',         color: '#f97316' },
  7:  { emoji: '⚠️', label: 'Carril cortado',    color: '#f59e0b' },
  8:  { emoji: '🚫', label: 'Vía cortada',       color: '#dc2626' },
  9:  { emoji: '🚧', label: 'Obras',             color: '#f59e0b' },
  13: { emoji: '🔧', label: 'Vehículo averiado', color: '#6b7280' },
};
const TIPO_DESCONOCIDO = { emoji: '⚠️', label: 'Incidencia', color: '#6b7280' };

// Crea el icono circular con emoji para cada marcador
function crearIcono(categoria) {
  const tipo = TIPOS_INCIDENCIA[categoria] ?? TIPO_DESCONOCIDO;
  return L.divIcon({
    html: `<div class="traffic-incident-icon" style="background:${tipo.color}">${tipo.emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
    className: '',
  });
}

// Extrae las coordenadas [lat, lng] del incidente según su tipo de geometría
// TomTom puede devolver puntos, líneas o múltiples puntos/líneas
function obtenerCoordenadas(incidente) {
  const geo = incidente.geometry;
  if (!geo?.coordinates) return null;

  if (geo.type === 'Point') {
    return [geo.coordinates[1], geo.coordinates[0]];
  }
  if (geo.type === 'LineString' && geo.coordinates.length > 0) {
    const centro = geo.coordinates[Math.floor(geo.coordinates.length / 2)];
    return [centro[1], centro[0]];
  }
  if (geo.type === 'MultiPoint' && geo.coordinates.length > 0) {
    return [geo.coordinates[0][1], geo.coordinates[0][0]];
  }
  if (geo.type === 'MultiLineString' && geo.coordinates.length > 0) {
    const linea = geo.coordinates[0];
    const centro = linea[Math.floor(linea.length / 2)];
    return [centro[1], centro[0]];
  }
  return null;
}

export default function TrafficIncidentsLayer({ visible }) {
  const map = useMap();
  const [incidencias, setIncidencias] = useState([]);
  const timerRef = useRef(null);

  // Pedir incidencias con un pequeño retraso para no lanzar una petición
  // por cada píxel que el usuario mueva el mapa
  useMapEvents({
    moveend: () => { if (visible) programarPeticion(); },
    zoomend: () => { if (visible) programarPeticion(); },
  });

  function programarPeticion() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(pedirIncidencias, 600);
  }

  // Llama al backend (/api/traffic) con las coordenadas del área visible del mapa
  async function pedirIncidencias() {
    const limites = map.getBounds();
    const params = new URLSearchParams({
      minLon: limites.getWest().toFixed(5),
      minLat: limites.getSouth().toFixed(5),
      maxLon: limites.getEast().toFixed(5),
      maxLat: limites.getNorth().toFixed(5),
    });

    try {
      const respuesta = await fetch(`/api/traffic?${params}`);
      if (!respuesta.ok) return;
      const json = await respuesta.json();
      setIncidencias(json.incidents || []);
    } catch (error) {
      console.error('[TrafficIncidentsLayer]', error.message);
    }
  }

  // Cargar incidencias al activar la capa, limpiar al desactivarla
  useEffect(() => {
    if (visible) {
      pedirIncidencias();
    } else {
      setIncidencias([]);
    }
    return () => clearTimeout(timerRef.current);
  }, [visible]);

  if (!visible) return null;

  // Renderizar un marcador por cada incidencia que tenga coordenadas válidas
  return incidencias
    .map((inc, i) => {
      const posicion = obtenerCoordenadas(inc);
      if (!posicion) return null;

      const categoria = inc.properties?.iconCategory ?? 0;
      const etiqueta = TIPOS_INCIDENCIA[categoria]?.label ?? TIPO_DESCONOCIDO.label;

      return (
        <Marker key={i} position={posicion} icon={crearIcono(categoria)} zIndexOffset={1000}>
          <Popup>
            <div className="traffic-popup">
              <strong>{etiqueta}</strong>
            </div>
          </Popup>
        </Marker>
      );
    })
    .filter(Boolean);
}
