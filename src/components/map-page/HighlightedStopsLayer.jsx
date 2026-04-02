// HighlightedStopsLayer.jsx — Capa de paradas destacadas por la busqueda
import React, { useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getStopTimes } from '../../services/crtmService';
import { highlightedStopIcon } from './mapIcons';

// Popup simplificado para paradas destacadas (reutiliza estilos del popup normal)
import { useState, useRef, useCallback } from 'react';

export default function HighlightedStopsLayer({ stops, isDarkMode, onSelectBus }) {
  const map = useMap();

  // Ajustar el mapa para mostrar todas las paradas destacadas
  useEffect(() => {
    if (stops.length === 0) return;
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.3), { animate: true, duration: 0.8 });
  }, [stops, map]);

  return (
    <>
      {stops.map((stop) => {
        const codStop = stop.codStop || `${stop.cod_mode}_${stop.cod_estacion}`;
        return (
          <Marker
            key={`hl-${stop.stop_id}`}
            position={[stop.lat, stop.lng]}
            icon={highlightedStopIcon}
            zIndexOffset={800}
          >
            <Popup className={isDarkMode ? 'dark-popup' : ''} minWidth={220} maxWidth={280}>
              <HighlightedStopPopup
                stopName={stop.name}
                stopType={stop.cod_mode === 8 ? 'Interurbano' : 'Urbano'}
                lines={stop.lines ? stop.lines.split(',').map(l => l.trim()) : []}
                codStop={codStop}
                onSelectBus={onSelectBus}
              />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// Popup con tiempos de llegada para paradas destacadas
function HighlightedStopPopup({ stopName, stopType, lines, codStop, onSelectBus }) {
  const [arrivals, setArrivals] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [hayError, setHayError] = useState(false);
  const abortRef = useRef(null);

  const pedirTiempos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCargando(true);
    setHayError(false);

    try {
      const resultado = await getStopTimes(codStop, controller.signal);
      if (!controller.signal.aborted) {
        setArrivals(resultado.arrivals);
        setHayError(resultado.error);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        setArrivals([]);
        setHayError(true);
      }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [codStop]);

  useEffect(() => {
    pedirTiempos();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [pedirTiempos]);

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

        {cargando && <div className="bus-arrivals-loading">Cargando...</div>}

        {hayError && !cargando && (
          <div className="bus-arrivals-error">
            <span>No se pudo obtener los tiempos</span>
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
                onClick={(e) => { e.stopPropagation(); onSelectBus({ ...a, codStop, stopName }); }}
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
      </div>
    </div>
  );
}
