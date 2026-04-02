import React, { useState, useRef, useEffect } from 'react';
import { getNearbyStopsForLine, getAllLines } from '../../services/stopsService';
import { getStopTimes } from '../../services/crtmService';
import './BusSearchModal.css';

export default function BusSearchModal({ isOpen, isDarkMode, userLocation, onResults, onDismiss }) {
  const [phase, setPhase] = useState('search'); // 'search' | 'results'
  const [lineInput, setLineInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [allLines, setAllLines] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Cargar todas las lineas al montar
  useEffect(() => {
    getAllLines().then(setAllLines);
  }, []);

  // Focus en el input al abrir
  useEffect(() => {
    if (isOpen && phase === 'search') {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, phase]);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setPhase('search');
      setLineInput('');
      setError('');
      setResults([]);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [isOpen]);

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleInputChange = (value) => {
    setLineInput(value);
    setError('');

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const search = value.trim().toLowerCase();
    const filtered = allLines.filter(line =>
      line.toLowerCase().startsWith(search)
    );

    // Si no hay coincidencias exactas por inicio, buscar tambien que contengan
    if (filtered.length === 0) {
      const contains = allLines.filter(line =>
        line.toLowerCase().includes(search)
      );
      setSuggestions(contains.slice(0, 20));
    } else {
      setSuggestions(filtered.slice(0, 20));
    }

    setShowSuggestions(true);
  };

  const selectLine = (line) => {
    setLineInput(line);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSearch = async (lineOverride) => {
    const line = (lineOverride || lineInput).trim();
    if (!line) return;

    setLoading(true);
    setError('');
    setShowSuggestions(false);

    try {
      const stops = await getNearbyStopsForLine(userLocation[0], userLocation[1], line);

      if (stops.length === 0) {
        setError(`No hay paradas cercanas con la línea ${line}`);
        setLoading(false);
        return;
      }

      // Pedir tiempos de llegada en paralelo para cada parada
      const stopsWithTimes = await Promise.all(
        stops.map(async (stop) => {
          const codStop = `${stop.cod_mode}_${stop.cod_estacion}`;
          try {
            const timesResult = await getStopTimes(codStop);
            const searchLower = line.toLowerCase();
            const searchNoPrefix = searchLower.replace(/^l/, '');
            const filtered = (timesResult.arrivals || []).filter(a => {
              const apiLine = String(a.line).toLowerCase();
              return apiLine === searchLower || apiLine === searchNoPrefix;
            });
            return { ...stop, codStop, arrivals: filtered };
          } catch {
            return { ...stop, codStop, arrivals: [] };
          }
        })
      );

      setResults(stopsWithTimes);
      setPhase('results');
    } catch (e) {
      setError('Error al buscar. Inténtalo de nuevo.');
      console.error('BusSearchModal error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      handleSearch();
    }
  };

  const handleShowOnMap = () => {
    onResults(results);
  };

  return (
    <>
      <div className="bus-search-overlay" onClick={onDismiss} />
      <div className={`bus-search-modal ${isDarkMode ? 'dark-modal' : ''}`}>
        {phase === 'search' && (
          <>
            <h3 className="bus-search-title">Buscas algún bus?</h3>
            <p className="bus-search-subtitle">Escribe el número de línea y te mostramos las paradas más cercanas</p>

            <div className="bus-search-input-wrapper">
              <div className="bus-search-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className="bus-search-input"
                  placeholder="Ej: 27, N6, 571..."
                  value={lineInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  disabled={loading}
                />
                {!loading && (
                  <button
                    className="bus-search-btn"
                    onClick={() => handleSearch()}
                    disabled={!lineInput.trim()}
                  >
                    Buscar
                  </button>
                )}
              </div>

              {/* Lista de sugerencias */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="bus-search-suggestions" ref={suggestionsRef}>
                  {suggestions.map((line) => (
                    <button
                      key={line}
                      className="bus-search-suggestion"
                      onClick={() => { selectLine(line); handleSearch(line); }}
                    >
                      <span className="suggestion-badge">Línea</span>
                      <span className="suggestion-line">{line}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="bus-search-error">{error}</p>}

            {loading && (
              <div className="bus-search-loading">
                <div className="bus-search-spinner"></div>
                <span>Cargando los buses...</span>
              </div>
            )}

            <button className="bus-search-skip" onClick={onDismiss}>
              No, solo quiero explorar
            </button>
          </>
        )}

        {phase === 'results' && (
          <>
            <h3 className="bus-search-title">Línea {lineInput} cerca de ti</h3>

            <div className="bus-search-results">
              {results.map((stop) => (
                <div key={stop.stop_id} className="bus-search-result-card">
                  <div className="bus-search-result-header">
                    <span className="bus-search-stop-name">{stop.name}</span>
                    <span className="bus-search-distance">{stop.distance}m</span>
                  </div>
                  <div className="bus-search-arrivals">
                    {stop.arrivals.length > 0 ? (
                      stop.arrivals.slice(0, 3).map((a, j) => (
                        <span key={j} className="bus-search-time">
                          {a.minutes === 0 ? 'YA' : `${a.minutes} min`}
                        </span>
                      ))
                    ) : (
                      <span className="bus-search-no-service">Sin servicio ahora</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bus-search-actions">
              <button className="bus-search-btn" onClick={handleShowOnMap}>
                Ver en el mapa
              </button>
              <button className="bus-search-back" onClick={() => { setPhase('search'); setError(''); }}>
                Buscar otra línea
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
