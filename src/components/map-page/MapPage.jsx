import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import './MapPage.css';
import lightThemeIcon from '../../assets/light-theme-icon.png';
import darkThemeIcon from '../../assets/dark-theme-icon.png';
import busIconImg from '../../assets/icono-bus3.jpg';
import { getCRTMStopsInBounds, getStopTimes, getBusLocation } from '../../services/crtmService';
import { supabase } from '../../supabaseClient';

// Importando todos los avatares disponibles
import avatar1 from '../../assets/avatar/avatar1.png';
import avatar2 from '../../assets/avatar/avatar2.png';
import avatar3 from '../../assets/avatar/avatar3.png';
import avatar4 from '../../assets/avatar/avatar4.png';
import avatar5 from '../../assets/avatar/avatar5.png';
import avatar6 from '../../assets/avatar/avatar6.png';
import avatar7 from '../../assets/avatar/avatar7.png';
import avatar8 from '../../assets/avatar/avatar8.png';
import avatar9 from '../../assets/avatar/avatar9.png';
import avatar10 from '../../assets/avatar/avatar10.png';
import avatar11 from '../../assets/avatar/avatar11.png';
import avatar12 from '../../assets/avatar/avatar12.png';
import avatar13 from '../../assets/avatar/avatar13.png';
import avatar14 from '../../assets/avatar/avatar14.png';

const avatars = [
  avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7,
  avatar8, avatar9, avatar10, avatar11, avatar12, avatar13, avatar14
];

// Seleccionar un avatar aleatorio en la carga inicial
const randomAvatarUrl = avatars[Math.floor(Math.random() * avatars.length)];

// Fix for default marker icons in Leaflet with Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Definir el icono personalizado para el usuario con un avatar aleatorio
const customUserIcon = new L.Icon({
  iconUrl: randomAvatarUrl,
  iconSize: [64, 64],
  iconAnchor: [32, 32],
  popupAnchor: [0, -32],
  className: 'custom-user-marker'
});

// Icono personalizado para las paradas de bus
const busStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
  className: 'bus-stop-marker'
});

// Icono personalizado para la parada de bus activa (seleccionada)
const activeBusStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  className: 'bus-stop-marker active-bus-stop-marker'
});

// Icono animado para el bus en tiempo real
const liveBusIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  className: 'live-bus-marker'
});

// Control manual para centrar en la ubicación del usuario
function LocateControl({ position }) {
  const map = useMap();
  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '90px', marginRight: '10px' }}>
      <div className="leaflet-control">
        <button
          className="locate-me-btn"
          onClick={(e) => {
            e.stopPropagation();
            map.flyTo(position, 17, { animate: true, duration: 1 });
          }}
          title="Centrar en mi ubicación"
        >
          🛰️
        </button>
      </div>
    </div>
  );
}

// Sub-componente que escucha los movimientos del mapa y pide paradas al CRTM
function BusStopsLayer({ isDarkMode, onSelectBus, selectedBus }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const map = useMapEvents({
    moveend: () => {
      fetchStopsForView();
    },
  });

  const fetchStopsForView = useCallback(() => {
    // Debounce: esperar 500ms después del último movimiento
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      try {
        setLoading(true);
        // CRTM API usa bounds del viewport: (minLng, minLat, maxLng, maxLat)
        const features = await getCRTMStopsInBounds(sw.lng, sw.lat, ne.lng, ne.lat);
        setStops(features);
      } catch (error) {
        console.error('Error al cargar paradas CRTM:', error);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [map]);

  // Cargar paradas cuando se monta el componente
  useEffect(() => {
    fetchStopsForView();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      {stops.map((feature, index) => {
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;

        const position = [coords[1], coords[0]]; // [lat, lng]
        const props = feature.properties || {};
        const stopName = props.DENOMINACION || 'Parada';
        const linesStr = props.LINEAS || '';
        const lines = linesStr ? linesStr.split(',').map(l => l.trim()) : [];
        const stopType = feature._type === 'interurbano' ? 'Interurbano' : 'Urbano';
        const codMode = feature._type === 'interurbano' ? '8' : '6';
        const codStop = `${codMode}_${props.CODIGOESTACION}`;

        const isActive = selectedBus && codStop === selectedBus.codStop;
        const currentIcon = isActive ? activeBusStopIcon : busStopIcon;

        return (
          <StopMarker
            key={props.CODIGOESTACION || `crtm-${index}`}
            position={position}
            icon={currentIcon}
            isActive={isActive}
            isDarkMode={isDarkMode}
            stopName={stopName}
            stopType={stopType}
            lines={lines}
            codStop={codStop}
            onSelectBus={onSelectBus}
          />
        );
      })}
    </>
  );
}

// Sub-componente para gestionar el estado Abierto/Cerrado del marcador
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

// Sub-componente para el popup de una parada con tiempos en tiempo real
function BusStopPopup({ stopName, stopType, lines, codStop, onSelectBus }) {
  const [arrivals, setArrivals] = useState(null);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [hasError, setHasError] = useState(false);
  const abortRef = useRef(null);

  const fetchTimes = useCallback(async () => {
    // Cancelar petición anterior si existe
    if (abortRef.current) abortRef.current.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoadingTimes(true);
    setHasError(false);
    try {
      const result = await getStopTimes(codStop, abortController.signal);
      if (!abortController.signal.aborted) {
        setArrivals(result.arrivals);
        setIsStale(result.stale);
        setCachedAt(result.cachedAt);
        setHasError(result.error);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Error fetching stop times:', e);
      if (!abortController.signal.aborted) {
        setArrivals([]);
        setHasError(true);
      }
    } finally {
      if (!abortController.signal.aborted) setLoadingTimes(false);
    }
  }, [codStop]);

  // Cargar tiempos cuando el componente se monta (usuario abre el popup)
  useEffect(() => {
    fetchTimes();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchTimes]);

  // Calcular texto de antigüedad para datos stale
  const staleMinutes = cachedAt ? Math.round((Date.now() - cachedAt.getTime()) / 60000) : 0;

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

        {/* Indicador de datos stale */}
        {isStale && (
          <div className="bus-stale-notice">
            Datos de hace {staleMinutes} min (API no disponible)
          </div>
        )}

        {/* Estado de carga */}
        {loadingTimes && (
          <div className="bus-arrivals-loading">Cargando...</div>
        )}

        {/* Error: API falló sin datos de caché */}
        {hasError && !loadingTimes && (
          <div className="bus-arrivals-error">
            <span>No se pudo conectar con CRTM</span>
            <button className="bus-retry-btn" onClick={(e) => { e.stopPropagation(); fetchTimes(); }}>
              Reintentar
            </button>
          </div>
        )}

        {/* Sin datos (API respondió OK pero no hay buses) */}
        {arrivals && arrivals.length === 0 && !loadingTimes && !hasError && (
          <div className="bus-arrivals-empty">Sin servicio en este momento</div>
        )}

        {/* Lista de llegadas */}
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

        {/* Botón de recargar después de mostrar datos (stale o normales) */}
        {arrivals && arrivals.length > 0 && !loadingTimes && (
          <button className="bus-refresh-btn" onClick={(e) => { e.stopPropagation(); fetchTimes(); }} title="Actualizar tiempos">🔄 Actualizar
          </button>
        )}
      </div>
    </div>
  );
}

export default function MapPage() {
  const [userLocation, setUserLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedBus, setSelectedBus] = useState(null);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setLoadingLocation(false);
        },
        (error) => {
          console.error("Error al obtener la ubicación:", error);
          setUserLocation([40.4168, -3.7038]);
          setLoadingLocation(false);
        }
      );
    } else {
      setUserLocation([40.4168, -3.7038]);
      setLoadingLocation(false);
    }
  }, []);

  if (loadingLocation) {
    return (
      <div className="map-loading-screen">
        <div className="map-spinner"></div>
        <p>Buscando tu ubicación...</p>
      </div>
    );
  }

  const lightTileUrl = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
  const darkTileUrl = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
  const currentTileUrl = isDarkMode ? darkTileUrl : lightTileUrl;

  return (
    <div className={`map-page-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <MapContainer
        center={userLocation}
        zoom={18}
        scrollWheelZoom={true}
        className="leaflet-map-wrapper"
        zoomControl={false}
      >
        {/* Botón para centrar en usuario */}
        {userLocation && <LocateControl position={userLocation} />}

        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={currentTileUrl}
        />

        {/* Capa de seguimiento de bus en tiempo real */}
        {selectedBus && <LiveBusLayer selectedBus={selectedBus} />}

        {/* Marcador del usuario */}
        {userLocation && (
          <Marker position={userLocation} icon={customUserIcon}>
            <Popup className={isDarkMode ? 'dark-popup' : ''}>
              ¡Estás aquí!
            </Popup>
          </Marker>
        )}

        {/* Capa de paradas de bus EMT */}
        <BusStopsLayer isDarkMode={isDarkMode} onSelectBus={setSelectedBus} selectedBus={selectedBus} />
      </MapContainer>

      {/* Panel flotante superior */}
      <div className="map-floating-overlay">
        <div className="map-overlay-header">
          <div>
            <h2>Quick Arrival</h2>
            <p>Explora tus paradas</p>
          </div>
          <div className="map-header-actions">
            <button
              className="theme-toggle-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              aria-label="Toggle theme"
            >
              <img
                src={isDarkMode ? lightThemeIcon : darkThemeIcon}
                alt="Toggle theme"
                className="theme-toggle-icon"
              />
            </button>
            <button
              className="logout-btn"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
      {/* Panel flotante de información del bus seleccionado */}
      {selectedBus && (
        <div className={`live-bus-panel ${isDarkMode ? 'dark-panel' : ''}`}>
          <div className="live-bus-panel-header">
            <strong>Monitoreando Línea {selectedBus.line}</strong>
            <button className="close-live-bus" onClick={() => setSelectedBus(null)}>✕</button>
          </div>
          <div className="live-bus-panel-body">
            <p>Hacia: {selectedBus.destination}</p>
            <p>Parada destino: {selectedBus.stopName}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-componente para seguimiento en vivo
function LiveBusLayer({ selectedBus }) {
  const [busLocations, setBusLocations] = useState([]);
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    // Resetear el flag de centrado si cambiamos de bus
    hasCentered.current = false;
    setBusLocations([]);
  }, [selectedBus]);

  useEffect(() => {
    if (!selectedBus) return;

    let timeoutId;
    let isMounted = true;

    async function fetchLocation() {
      try {
        const locations = await getBusLocation(
          selectedBus.codMode,
          selectedBus.codLine,
          selectedBus.direction,
          selectedBus.codStop
        );

        if (locations && locations.length > 0 && isMounted) {
          setBusLocations(locations);
          if (!hasCentered.current) {
            hasCentered.current = true;
            map.setView([locations[0].latitude, locations[0].longitude], 15, { animate: true });
          }
        }
      } catch (e) {
        console.error("Error fetching live bus:", e);
      } finally {
        if (isMounted) {
          // Usamos setTimeout recursivo (20s)
          // que peticiones lentas o reintentos se superpongan y ahoguen el servidor CRTM.
          timeoutId = setTimeout(fetchLocation, 20000);
        }
      }
    }

    // Petición inmediata
    fetchLocation();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [selectedBus, map]);

  if (busLocations.length === 0) return null;

  return (
    <>
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
