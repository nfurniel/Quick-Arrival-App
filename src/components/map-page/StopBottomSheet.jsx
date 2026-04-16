// StopBottomSheet.jsx — Panel inferior deslizable con info de la parada
// Se abre al hacer click en una parada, se puede arrastrar hacia arriba para expandir
import { useEffect, useRef, useState, useCallback } from 'react';
import { getStopTimes } from '../../services/crtmService';
import './StopBottomSheet.css';

const PEEK_HEIGHT = 210; // px visibles en estado colapsado

export default function StopBottomSheet({ stop, isDarkMode, onClose, onSelectBus, isFavourite, onToggleFavourite }) {
  const [expanded, setExpanded] = useState(false);
  const [arrivals, setArrivals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef(null);
  const abortRef = useRef(null);

  // Reset y cargar datos cuando cambia la parada
  useEffect(() => {
    if (!stop) return;
    setExpanded(false);
    setDragOffset(0);
    setArrivals(null);
    setError(false);
    setStale(false);
    fetchArrivals();
    return () => abortRef.current?.abort();
  }, [stop?.codStop]);

  const fetchArrivals = useCallback(async () => {
    if (!stop) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(false);

    try {
      const result = await getStopTimes(stop.codStop, controller.signal);
      if (controller.signal.aborted) return;
      setArrivals(result.arrivals);
      setStale(result.stale);
      setCachedAt(result.cachedAt);
      setError(result.error);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!controller.signal.aborted) { setArrivals([]); setError(true); }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [stop]);

  const scrollAreaRef = useRef(null);

  // ── Drag con Pointer Events en el contenedor completo ──
  const handlePointerDown = (e) => {
    // En expanded, si el toque empieza dentro del área de scroll → no interceptar
    if (expanded && scrollAreaRef.current?.contains(e.target)) return;
    dragStart.current = { y: e.clientY, expanded };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragStart.current) return;
    const delta = e.clientY - dragStart.current.y;
    if (dragStart.current.expanded) {
      setDragOffset(Math.max(0, Math.min(delta, 250)));
    } else {
      setDragOffset(Math.max(-250, Math.min(delta, 150)));
    }
  };

  const handlePointerUp = (e) => {
    if (!dragStart.current) return;
    const delta = e.clientY - dragStart.current.y;
    setIsDragging(false);
    setDragOffset(0);

    if (!dragStart.current.expanded) {
      if (delta < -60) setExpanded(true);
      else if (delta > 70) onClose();
    } else {
      if (delta > 120) setExpanded(false);
    }
    dragStart.current = null;
  };

  if (!stop) return null;

  const lines = stop.lines || [];
  const esInterurbano = stop.codStop?.startsWith('8_');
  const minutosCacheados = cachedAt ? Math.round((Date.now() - cachedAt.getTime()) / 60000) : 0;

  // Calcular transform según estado
  const baseTransform = expanded
    ? `translateY(${Math.max(0, dragOffset)}px)`
    : `translateY(calc(100% - ${PEEK_HEIGHT}px + ${Math.max(0, dragOffset)}px))`;

  return (
    <div
      className={`stop-bottom-sheet ${isDarkMode ? 'dark' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ transform: baseTransform, transition: isDragging ? 'none' : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Handle visual */}
      <div className="sheet-drag-area">
        <div className="sheet-handle" />
      </div>

      {/* Cabecera */}
      <div className="sheet-header">
        <div className="sheet-stop-info">
          <h3 className="sheet-stop-name">{stop.name}</h3>
          <span className="sheet-stop-type">{stop.typeLabel}</span>
        </div>
        {onToggleFavourite && (
          <button
            className={`sheet-fav-btn ${isFavourite ? 'active' : ''}`}
            onClick={() => onToggleFavourite(stop.name)}
            aria-label={isFavourite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          >
            {isFavourite ? '♥' : '♡'}
          </button>
        )}
        <button className="sheet-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      {/* Líneas que pasan por la parada */}
      {lines.length > 0 && (
        <div className="sheet-lines">
          {lines.map((line) => (
            <span key={line} className="sheet-line-badge">{line}</span>
          ))}
        </div>
      )}

      {/* Contenido scrollable (tiempos) */}
      <div className="sheet-scroll-area" ref={scrollAreaRef}>

        {loading && (
          <div className="sheet-loading">
            <span className="sheet-spinner" />
            Cargando tiempos...
          </div>
        )}

        {error && !loading && (
          <div className="sheet-error">
            <p>{esInterurbano ? 'Servidor CRTM no disponible' : 'No se pudieron obtener los tiempos'}</p>
            <button className="sheet-retry-btn" onClick={fetchArrivals}>Reintentar</button>
          </div>
        )}

        {arrivals?.length === 0 && !loading && !error && (
          <div className="sheet-empty">Sin servicio en este momento</div>
        )}

        {arrivals?.length > 0 && !error && (
          <>
            {stale && (
              <div className="sheet-stale">
                Última actualización hace {minutosCacheados} min
              </div>
            )}

            <div className="sheet-arrivals-list">
              {arrivals.map((a, i) => (
                <div
                  key={`${a.line}-${a.direction}-${i}`}
                  className="sheet-arrival-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectBus({ ...a, codStop: stop.codStop, stopName: stop.name, stopLat: stop.lat, stopLng: stop.lng });
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectBus({ ...a, codStop: stop.codStop, stopName: stop.name, stopLat: stop.lat, stopLng: stop.lng });
                      onClose();
                    }
                  }}
                >
                  <div className="sheet-arrival-line">{a.line}</div>
                  <span className="sheet-arrival-dest">{a.destination}</span>
                  <span className={`sheet-arrival-time ${a.minutes === 0 ? 'now' : ''}`}>
                    {a.minutes === 0 ? 'YA' : `${a.minutes} min`}
                  </span>
                </div>
              ))}
            </div>

            <button className="sheet-refresh-btn" onClick={fetchArrivals}>
              ↻ Actualizar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
