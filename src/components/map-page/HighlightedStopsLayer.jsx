// HighlightedStopsLayer.jsx — Capa de paradas destacadas por la busqueda
// Desktop: popup de Leaflet. Móvil: bottom sheet via callback onSelectStop.
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getStopTimes } from '../../services/crtmService';
import { highlightedStopIcon } from './mapIcons';

const isMobile = () => window.innerWidth < 768;

export default function HighlightedStopsLayer({ stops, isDarkMode, onSelectBus, onSelectStop }) {
  const map = useMap();

  useEffect(() => {
    if (stops.length === 0) return;
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.3), { animate: true, duration: 0.8 });
  }, [stops, map]);

  return (
    <>
      {stops.map((stop) => {
        const codStop = stop.codStop || `${stop.cod_mode}_${stop.cod_estacion}`;
        const lines = stop.lines ? stop.lines.split(',').map(l => l.trim()) : [];
        const typeLabel = stop.cod_mode === 8 ? 'Interurbano' : 'Urbano';

        return (
          <HighlightedMarker
            key={`hl-${stop.stop_id}`}
            stop={stop}
            codStop={codStop}
            lines={lines}
            typeLabel={typeLabel}
            isDarkMode={isDarkMode}
            onSelectBus={onSelectBus}
            onSelectStop={onSelectStop}
          />
        );
      })}
    </>
  );
}

function HighlightedMarker({ stop, codStop, lines, typeLabel, isDarkMode, onSelectBus, onSelectStop }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    if (isMobile()) {
      onSelectStop({ codStop, name: stop.name, typeLabel, lines, lat: stop.lat, lng: stop.lng, stopId: stop.stop_id });
    } else {
      setIsOpen(true);
    }
  };

  return (
    <Marker
      position={[stop.lat, stop.lng]}
      icon={highlightedStopIcon}
      zIndexOffset={800}
      eventHandlers={{
        click: handleClick,
        popupclose: () => setIsOpen(false),
      }}
    >
      {!isMobile() && (
        <Popup className={isDarkMode ? 'dark-popup' : ''} minWidth={220} maxWidth={280}>
          {isOpen ? (
            <HighlightedStopPopup
              stopName={stop.name}
              stopType={typeLabel}
              lines={lines}
              codStop={codStop}
              onSelectBus={onSelectBus}
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

function HighlightedStopPopup({ stopName, stopType, lines, codStop, onSelectBus }) {
  const [arrivals, setArrivals] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [hayError, setHayError] = useState(false);
  const abortRef = useRef(null);

  const pedirTiempos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCargando(true); setHayError(false);
    try {
      const resultado = await getStopTimes(codStop, controller.signal);
      if (!controller.signal.aborted) { setArrivals(resultado.arrivals); setHayError(resultado.error); }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!controller.signal.aborted) { setArrivals([]); setHayError(true); }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [codStop]);

  useEffect(() => {
    pedirTiempos();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [pedirTiempos]);

  return (
    <div className="bus-popup-content">
      <strong>{stopName}</strong>
      <span className="bus-type-label">{stopType}</span>
      {lines.length > 0 && (
        <div className="bus-lines">
          {lines.map((line) => <span key={line} className="bus-line-badge">{line}</span>)}
        </div>
      )}
      <div className="bus-arrivals-section">
        <span className="bus-arrivals-title">Próximos buses:</span>
        {cargando && <div className="bus-arrivals-loading">Cargando...</div>}
        {hayError && !cargando && (
          <div className="bus-arrivals-error">
            <span>No se pudo obtener los tiempos</span>
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
                onClick={(e) => { e.stopPropagation(); onSelectBus({ ...a, codStop, stopName }); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectBus({ ...a, codStop, stopName }); }}
              >
                <span className="bus-arrival-line">{a.line}</span>
                <span className="bus-arrival-dest">{a.destination}</span>
                <span className="bus-arrival-time">{a.minutes === 0 ? 'YA' : `${a.minutes} min`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
