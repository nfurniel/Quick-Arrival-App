import { useEffect, useRef, useState, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  TbAlertOctagon, TbCar, TbAlertTriangle,
  TbCircleOff, TbCone, TbTool, TbAlertCircle,
} from 'react-icons/tb';

const TIPOS_INCIDENCIA = {
  1: { Icon: TbAlertOctagon, label: 'Accidente', color: '#dc2626' },
  6: { Icon: TbCar, label: 'Retención', color: '#f97316' },
  7: { Icon: TbAlertTriangle, label: 'Carril cortado', color: '#f59e0b' },
  8: { Icon: TbCircleOff, label: 'Vía cortada', color: '#dc2626' },
  9: { Icon: TbCone, label: 'Obras', color: '#f59e0b' },
  13: { Icon: TbTool, label: 'Vehículo averiado', color: '#6b7280' },
};
const TIPO_DESCONOCIDO = { Icon: TbAlertCircle, label: 'Incidencia', color: '#6b7280' };

function crearIcono(categoria) {
  const tipo = TIPOS_INCIDENCIA[categoria] ?? TIPO_DESCONOCIDO;
  const svg = renderToStaticMarkup(createElement(tipo.Icon, { size: 18, color: 'white' }));
  return L.divIcon({
    html: `<div class="traffic-incident-icon" style="background:${tipo.color}">${svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
    className: '',
  });
}

// Extrae las coordenadas [lat, lng] del incidente según su tipo de geometría
// TomTom puede devolver puntos, líneas o múltiples puntos/líneas
// Hay 4 tipos de geometria, validar todas *** 
function obtenerCoordenadas(incidente) {
  const geo = incidente.geometry;
  if (!geo?.coordinates) return null;

  // OJO: las APIs devuelven [lng, lat] pero Leaflet usa [lat, lng] (al reves)
  if (geo.type === 'Point') {
    return [geo.coordinates[1], geo.coordinates[0]];
  }
  // Si es una linea cogemos el punto del medio para poner el icono ahi
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

  // Pedir incidencias con un pequeño retraso para no lanzar una peticion
  // por cada píxel que el usuario mueva el mapa, porque si no se peta si estas en el movil
  useMapEvents({
    moveend: () => { if (visible) programarPeticion(); },
    zoomend: () => { if (visible) programarPeticion(); },
  });

  function programarPeticion() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(pedirIncidencias, 600);
  }

  // Llamada al backend (/api/traffic) con las coordenadas del área visible del mapa
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

