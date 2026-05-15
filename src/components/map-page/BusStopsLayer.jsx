// BusStopsLayer.jsx — Capa de paradas de bus en el mapa
// Desktop: popup de Leaflet. Móvil: bottom sheet via callback onSelectStop.
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Marker, Popup, useMapEvents } from 'react-leaflet';
import { getStopTimes } from '../../services/crtmService';
import { getStopsInBounds } from '../../services/stopsService';
import { busStopIcons, activeBusStopIcons, getStopType } from './mapIcons';

const isMobile = () => window.innerWidth < 768;

export default function BusStopsLayer({ isDarkMode, onSelectBus, onSelectStop, selectedBus, favourites, onToggleFavourite }) {
  const [stops, setStops] = useState([]);
  const debounceRef = useRef(null);
  // Cuando el usuario mueve el mapa volvemos a pedir las paradas del area que se ve
  const map = useMapEvents({ moveend: () => cargarParadas() });

  // Por debajo de zoom 15 hay demasiadas paradas y Leaflet se ahoga
  const MIN_ZOOM_PARADAS = 15;

  const cargarParadas = useCallback(() => {
    // Debounce de 300ms para no pegar petición por cada pixel que se mueva
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (map.getZoom() < MIN_ZOOM_PARADAS) { setStops([]); return; }
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      try {
        const data = await getStopsInBounds(sw.lng, sw.lat, ne.lng, ne.lat);
        setStops(data);
      } catch (e) {
        console.error('Error cargando paradas:', e);
      }
    }, 300);
  }, [map]);

  useEffect(() => {
    cargarParadas();
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
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
            stop={stop}
            onSelectBus={onSelectBus}
            onSelectStop={onSelectStop}
            isFavourite={favourites?.some(f => f.stopId === stop.stop_id) ?? false}
            onToggleFavourite={onToggleFavourite}
          />
        );
      })}
    </>
  );
}

function StopMarker({ position, icon, isActive, isDarkMode, stopName, stopType, lines, codStop, stop, onSelectBus, onSelectStop, isFavourite, onToggleFavourite }) {
  const [isOpen, setIsOpen] = useState(false);

  // En movil abrimos el bottom sheet, en escritorio el popup del propio Leaflet
  const handleClick = () => {
    if (isMobile()) {
      onSelectStop({ codStop, name: stopName, typeLabel: stopType, lines, lat: stop.lat, lng: stop.lng, stopId: stop.stop_id });
    } else {
      setIsOpen(true);
    }
  };

  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={isActive ? 500 : 0}
      eventHandlers={{
        click: handleClick,
        popupclose: () => setIsOpen(false),
      }}
    >
      {!isMobile() && (
        <Popup className={`bus-stop-popup ${isDarkMode ? 'dark-popup' : ''}`} minWidth={220} maxWidth={280}>
          {isOpen ? (
            <BusStopPopup
              stopName={stopName}
              stopType={stopType}
              lines={lines}
              codStop={codStop}
              stopLat={position[0]}
              stopLng={position[1]}
              stopId={stop.stop_id}
              onSelectBus={onSelectBus}
              isFavourite={isFavourite}
              onToggleFavourite={onToggleFavourite}
            />
          ) : (
            <div className="bus-popup-content" style={{ padding: '10px', textAlign: 'center' }}>
              <div className="bus-arrivals-loading">Cargando datos...</div>
            </div>
          )}
        </Popup>
      )}
    </Marker>
  );
}

function BusStopPopup({ stopName, stopType, lines, codStop, stopLat, stopLng, stopId, onSelectBus, isFavourite, onToggleFavourite }) {
  const [arrivals, setArrivals] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [datosAntiguos, setDatosAntiguos] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [hayError, setHayError] = useState(false);
  const [servidorCaido, setServidorCaido] = useState(false);
  const abortRef = useRef(null);

  const esInterurbano = codStop.startsWith('8_');

  // Pide los tiempos de llegada al backend. Usamos AbortController para cancelar
  // la peticion si el usuario cierra el popup antes de que llegue la respuesta
  const pedirTiempos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCargando(true); setHayError(false); setServidorCaido(false);
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
      if (!controller.signal.aborted) { setArrivals([]); setHayError(true); setServidorCaido(true); }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [codStop]);

  useEffect(() => {
    pedirTiempos();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [pedirTiempos]);

  const minutosCacheados = cachedAt ? Math.round((Date.now() - cachedAt.getTime()) / 60000) : 0;

  return (
    <div className="bus-popup-content">
      <div className="bus-popup-header">
        <strong>{stopName}</strong>
        {onToggleFavourite && (
          <button
            className={`popup-fav-btn ${isFavourite ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavourite(stopId, stopName); }}
            aria-label={isFavourite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          >
            {isFavourite ? '♥' : '♡'}
          </button>
        )}
      </div>
      <span className="bus-type-label">{stopType}</span>
      {lines.length > 0 && (
        <div className="bus-lines">
          {lines.map((line) => <span key={line} className="bus-line-badge">{line}</span>)}
        </div>
      )}
      <div className="bus-arrivals-section">
        <span className="bus-arrivals-title">Próximos buses:</span>
        {datosAntiguos && <div className="bus-stale-notice">Última actualización hace {minutosCacheados} min</div>}
        {cargando && <div className="bus-arrivals-loading">Cargando...</div>}
        {hayError && !cargando && (
          <div className="bus-arrivals-error">
            {servidorCaido && esInterurbano ? (
              <><span>Información no disponible ahora mismo</span><span className="bus-error-hint">Vuelve a intentarlo en unos segundos.</span></>
            ) : (
              <span>No hay información disponible</span>
            )}
            <button className="bus-retry-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }}>Reintentar</button>
          </div>
        )}
        {arrivals?.length === 0 && !cargando && !hayError && (
          <div className="bus-arrivals-empty">Sin servicio en este momento</div>
        )}
        {arrivals?.length > 0 && (
          <div className="bus-arrivals-list">
            {arrivals.map((a, i) => (
              <div
                key={`${a.line}-${a.direction}-${i}`}
                className="bus-arrival-row clickable-arrival"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onSelectBus({ ...a, codStop, stopName, stopLat, stopLng }); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectBus({ ...a, codStop, stopName, stopLat, stopLng }); }}
              >
                <span className="bus-arrival-line">{a.line}</span>
                <span className="bus-arrival-dest">{a.destination}</span>
                <span className="bus-arrival-time">{a.minutes === 0 ? 'YA' : `${a.minutes} min`}</span>
              </div>
            ))}
          </div>
        )}
        {arrivals?.length > 0 && !cargando && (
          <button className="bus-refresh-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }}>Actualizar</button>
        )}
      </div>
    </div>
  );
}
