// BusStopsLayer.jsx — Capa de paradas de bus en el mapa
// Incluye: carga de paradas por viewport, marcador individual y popup con tiempos
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Marker, Popup, useMapEvents } from 'react-leaflet';
import { getStopTimes } from '../../services/crtmService';
import { getStopsInBounds } from '../../services/stopsService';
import { busStopIcons, activeBusStopIcons, getStopType } from './mapIcons';

// Componente que carga y muestra las paradas de bus en el mapa
// Las paradas se cargan desde Supabase cada vez que el usuario mueve el mapa
export default function BusStopsLayer({ isDarkMode, onSelectBus, selectedBus }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const map = useMapEvents({
    moveend: () => {
      cargarParadas();
    },
  });

  // Zoom minimo para cargar paradas (por debajo de este nivel hay demasiadas y peta)
  const MIN_ZOOM_PARADAS = 15;

  // Cargar las paradas del area visible con un debounce de 300ms
  const cargarParadas = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (map.getZoom() < MIN_ZOOM_PARADAS) {
        setStops([]);
        return;
      }

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      try {
        setLoading(true);
        const data = await getStopsInBounds(sw.lng, sw.lat, ne.lng, ne.lat);
        setStops(data);
      } catch (error) {
        console.error('Error cargando paradas:', error);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [map]);

  // Cargar paradas al montar el componente
  useEffect(() => {
    cargarParadas();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      {stops.map((stop) => {
        if (!stop.lat || !stop.lng) return null;

        const position = [stop.lat, stop.lng];
        const nombre = stop.name || 'Parada';
        const lineas = stop.lines ? stop.lines.split(',').map(l => l.trim()) : [];
        const stopType = getStopType(stop.cod_mode, stop.lines);
        const tipoLabel = stopType === 'urbano' ? 'Urbano' : stopType === 'local' ? 'Local' : 'Interurbano';
        const codStop = `${stop.cod_mode}_${stop.cod_estacion}`;

        const estaActiva = selectedBus && codStop === selectedBus.codStop;
        const icono = estaActiva ? activeBusStopIcons[stopType] : busStopIcons[stopType];

        return (
          <StopMarker
            key={stop.stop_id}
            position={position}
            icon={icono}
            isActive={estaActiva}
            isDarkMode={isDarkMode}
            stopName={nombre}
            stopType={tipoLabel}
            lines={lineas}
            codStop={codStop}
            onSelectBus={onSelectBus}
          />
        );
      })}
    </>
  );
}

// Marcador individual de una parada con su popup
function StopMarker({ position, icon, isActive, isDarkMode, stopName, stopType, lines, codStop, onSelectBus }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={isActive ? 500 : 0}
      eventHandlers={{
        click: () => setIsOpen(true),
        popupclose: () => setIsOpen(false)
      }}
    >
      <Popup className={`bus-stop-popup ${isDarkMode ? 'dark-popup' : ''}`} minWidth={220} maxWidth={280}>
        {isOpen ? (
          <BusStopPopup
            stopName={stopName}
            stopType={stopType}
            lines={lines}
            codStop={codStop}
            stopLat={position[0]}
            stopLng={position[1]}
            onSelectBus={onSelectBus}
          />
        ) : (
          <div className="bus-popup-content" style={{ padding: '10px', textAlign: 'center' }}>
            <div className="bus-arrivals-loading">Cargando datos...</div>
          </div>
        )}
      </Popup>
    </Marker>
  );
}

// Popup con los tiempos de llegada en tiempo real
function BusStopPopup({ stopName, stopType, lines, codStop, stopLat, stopLng, onSelectBus }) {
  const [arrivals, setArrivals] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [datosAntiguos, setDatosAntiguos] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [hayError, setHayError] = useState(false);
  const [servidorCaido, setServidorCaido] = useState(false);
  const abortRef = useRef(null);

  const esInterurbano = codStop.startsWith('8_');

  // Pedir los tiempos de llegada
  const pedirTiempos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCargando(true);
    setHayError(false);
    setServidorCaido(false);

    try {
      const resultado = await getStopTimes(codStop, controller.signal);
      if (!controller.signal.aborted) {
        setArrivals(resultado.arrivals);
        setDatosAntiguos(resultado.stale);
        setCachedAt(resultado.cachedAt);
        setHayError(resultado.error);
        setServidorCaido(resultado.serverDown || false);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Error pidiendo tiempos:', e);
      if (!controller.signal.aborted) {
        setArrivals([]);
        setHayError(true);
        setServidorCaido(true);
      }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [codStop]);

  // Pedir tiempos cuando se abre el popup
  useEffect(() => {
    pedirTiempos();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [pedirTiempos]);

  const minutosCacheados = cachedAt ? Math.round((Date.now() - cachedAt.getTime()) / 60000) : 0;

  return (
    <div className="bus-popup-content">
      <strong>{stopName}</strong>
      <span className="bus-type-label">{stopType}</span>

      {lines.length > 0 && (
        <div className="bus-lines">
          {lines.map((line, i) => (
            <span key={i} className="bus-line-badge">{line}</span>
          ))}
        </div>
      )}

      <div className="bus-arrivals-section">
        <span className="bus-arrivals-title">Próximos buses:</span>

        {datosAntiguos && (
          <div className="bus-stale-notice">
            Datos de hace {minutosCacheados} min (API no disponible)
          </div>
        )}

        {cargando && (
          <div className="bus-arrivals-loading">Cargando...</div>
        )}

        {hayError && !cargando && (
          <div className="bus-arrivals-error">
            {servidorCaido && esInterurbano ? (
              <>
                <span>Servidor CRTM no disponible</span>
                <span className="bus-error-hint">Los servidores del CRTM suelen tener problemas. Vuelve a intentarlo en unos segundos.</span>
              </>
            ) : (
              <span>No se pudo obtener los tiempos</span>
            )}
            <button className="bus-retry-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }}>
              Reintentar
            </button>
          </div>
        )}

        {arrivals && arrivals.length === 0 && !cargando && !hayError && (
          <div className="bus-arrivals-empty">Sin servicio en este momento</div>
        )}

        {arrivals && arrivals.length > 0 && (
          <div className="bus-arrivals-list">
            {arrivals.map((a, i) => (
              <div
                key={i}
                className="bus-arrival-row clickable-arrival"
                onClick={(e) => { e.stopPropagation(); onSelectBus({ ...a, codStop, stopName, stopLat, stopLng }); }}
              >
                <span className="bus-arrival-line">{a.line}</span>
                <span className="bus-arrival-dest">{a.destination}</span>
                <span className="bus-arrival-time">
                  {a.minutes === 0 ? 'YA' : `${a.minutes} min`}
                </span>
              </div>
            ))}
          </div>
        )}

        {arrivals && arrivals.length > 0 && !cargando && (
          <button className="bus-refresh-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }} title="Actualizar tiempos">Actualizar
          </button>
        )}
      </div>
    </div>
  );
}
