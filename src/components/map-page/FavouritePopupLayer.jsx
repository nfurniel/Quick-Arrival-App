// Muestra un marcador con popup en la parada favorita seleccionada desde el sidebar (solo escritorio).
import { useEffect, useRef, useCallback } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { getStopTimes } from '../../services/crtmService';
import { favSelectedIcon } from './mapIcons';
import { useState } from 'react';

export default function FavouritePopupLayer({ stop, isDarkMode, onSelectBus, onClose }) {
  const markerRef = useRef(null);
  const map = useMap();

  // Abrir el popup automáticamente cuando cambia el stop
  useEffect(() => {
    if (!stop || !markerRef.current) return;
    // Esperar a que flyTo termine antes de abrir
    const onMoveEnd = () => {
      markerRef.current?.openPopup();
      map.off('moveend', onMoveEnd);
    };
    map.on('moveend', onMoveEnd);
    return () => map.off('moveend', onMoveEnd);
  }, [stop, map]);

  if (!stop) return null;

  return (
    <Marker
      ref={markerRef}
      position={[stop.lat, stop.lng]}
      icon={favSelectedIcon}
      zIndexOffset={900}
      eventHandlers={{ popupclose: onClose }}
    >
      <Popup
        className={isDarkMode ? 'dark-popup' : ''}
        minWidth={220}
        maxWidth={280}
      >
        <FavPopupContent
          stop={stop}
          isDarkMode={isDarkMode}
          onSelectBus={onSelectBus}
        />
      </Popup>
    </Marker>
  );
}

function FavPopupContent({ stop, onSelectBus }) {
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
      const result = await getStopTimes(stop.codStop, controller.signal);
      if (!controller.signal.aborted) {
        setArrivals(result.arrivals);
        setHayError(result.error);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!controller.signal.aborted) { setArrivals([]); setHayError(true); }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [stop.codStop]);

  useEffect(() => {
    pedirTiempos();
    return () => abortRef.current?.abort();
  }, [pedirTiempos]);

  return (
    <div className="bus-popup-content">
      <strong>{stop.name}</strong>
      <span className="bus-type-label">{stop.typeLabel}</span>
      {stop.lines?.length > 0 && (
        <div className="bus-lines">
          {stop.lines.map((line, i) => (
            <span key={i} className="bus-line-badge">{line}</span>
          ))}
        </div>
      )}
      <div className="bus-arrivals-section">
        <span className="bus-arrivals-title">Próximos buses:</span>
        {cargando && <div className="bus-arrivals-loading">Cargando...</div>}
        {hayError && !cargando && (
          <div className="bus-arrivals-error">
            <span>No hay información disponible</span>
            <button className="bus-retry-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }}>
              Reintentar
            </button>
          </div>
        )}
        {arrivals?.length === 0 && !cargando && !hayError && (
          <div className="bus-arrivals-empty">Sin servicio en este momento</div>
        )}
        {arrivals?.length > 0 && (
          <div className="bus-arrivals-list">
            {arrivals.map((a, i) => (
              <div
                key={i}
                className="bus-arrival-row clickable-arrival"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBus({ ...a, codStop: stop.codStop, stopName: stop.name, stopLat: stop.lat, stopLng: stop.lng });
                }}
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
