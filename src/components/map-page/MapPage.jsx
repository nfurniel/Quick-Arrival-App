import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import './MapPage.css';
import lightThemeIcon from '../../assets/light-theme-icon.png';
import darkThemeIcon from '../../assets/dark-theme-icon.png';
import busIconImg from '../../assets/icono-bus3.jpg';
import { getStopTimes, getBusLocation } from '../../services/crtmService';
import { getStopsInBounds } from '../../services/stopsService';
import { supabase } from '../../supabaseClient';

// Avatares para el marcador del usuario
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

// Elegir un avatar random cada vez que se carga la pagina
const randomAvatarUrl = avatars[Math.floor(Math.random() * avatars.length)];

// Fix para los iconos por defecto de Leaflet con Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Icono del usuario (avatar random)
const userIcon = new L.Icon({
  iconUrl: randomAvatarUrl,
  iconSize: [64, 64],
  iconAnchor: [32, 32],
  popupAnchor: [0, -32],
  className: 'custom-user-marker'
});

// Icono normal de parada de bus
const busStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
  className: 'bus-stop-marker'
});

// Icono de parada seleccionada (un poco mas grande y con borde rojo)
const activeBusStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  className: 'bus-stop-marker active-bus-stop-marker'
});

// Icono del bus en movimiento
const liveBusIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  className: 'live-bus-marker'
});

// Boton para centrar el mapa en la ubicacion del usuario
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
          Centrar
        </button>
      </div>
    </div>
  );
}

// Componente que carga y muestra las paradas de bus en el mapa
// Las paradas se cargan desde Supabase cada vez que el usuario mueve el mapa
function BusStopsLayer({ isDarkMode, onSelectBus, selectedBus }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const map = useMapEvents({
    moveend: () => {
      cargarParadas();
    },
  });

  // Cargar las paradas del area visible con un debounce de 300ms
  const cargarParadas = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
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
        const tipo = stop.cod_mode === 8 ? 'Interurbano' : 'Urbano';
        const codStop = `${stop.cod_mode}_${stop.cod_estacion}`;

        const estaActiva = selectedBus && codStop === selectedBus.codStop;
        const icono = estaActiva ? activeBusStopIcon : busStopIcon;

        return (
          <StopMarker
            key={stop.stop_id}
            position={position}
            icon={icono}
            isActive={estaActiva}
            isDarkMode={isDarkMode}
            stopName={nombre}
            stopType={tipo}
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
function BusStopPopup({ stopName, stopType, lines, codStop, onSelectBus }) {
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

        {/* Aviso si los datos son antiguos (cache) */}
        {datosAntiguos && (
          <div className="bus-stale-notice">
            Datos de hace {minutosCacheados} min (API no disponible)
          </div>
        )}

        {/* Spinner de carga */}
        {cargando && (
          <div className="bus-arrivals-loading">Cargando...</div>
        )}

        {/* Mensaje de error */}
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

        {/* No hay buses ahora */}
        {arrivals && arrivals.length === 0 && !cargando && !hayError && (
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

        {/* Boton de actualizar */}
        {arrivals && arrivals.length > 0 && !cargando && (
          <button className="bus-refresh-btn" onClick={(e) => { e.stopPropagation(); pedirTiempos(); }} title="Actualizar tiempos">Actualizar
          </button>
        )}
      </div>
    </div>
  );
}

// Componente principal del mapa
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

  // Obtener ubicacion del usuario al cargar
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          setLoadingLocation(false);
        },
        (error) => {
          console.error("Error obteniendo ubicacion:", error);
          // Si falla, centrar en Madrid
          setUserLocation([40.4168, -3.7038]);
          setLoadingLocation(false);
        }
      );
    } else {
      setUserLocation([40.4168, -3.7038]);
      setLoadingLocation(false);
    }
  }, []);

  // Pantalla de carga mientras buscamos la ubicacion
  if (loadingLocation) {
    return (
      <div className="map-loading-screen">
        <div className="map-spinner"></div>
        <p>Buscando tu ubicación...</p>
      </div>
    );
  }

  // URLs de los tiles del mapa (CartoDB sin etiquetas)
  const lightTileUrl = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
  const darkTileUrl = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
  const tileUrl = isDarkMode ? darkTileUrl : lightTileUrl;

  return (
    <div className={`map-page-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <MapContainer
        center={userLocation}
        zoom={18}
        scrollWheelZoom={true}
        className="leaflet-map-wrapper"
        zoomControl={false}
      >
        {userLocation && <LocateControl position={userLocation} />}

        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
        />

        {/* Bus en tiempo real */}
        {selectedBus && <LiveBusLayer selectedBus={selectedBus} />}

        {/* Marcador del usuario */}
        {userLocation && (
          <Marker position={userLocation} icon={userIcon}>
            <Popup className={isDarkMode ? 'dark-popup' : ''}>
              ¡Estás aquí!
            </Popup>
          </Marker>
        )}

        {/* Paradas de bus */}
        <BusStopsLayer isDarkMode={isDarkMode} onSelectBus={setSelectedBus} selectedBus={selectedBus} />
      </MapContainer>

      {/* Cabecera flotante */}
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

      {/* Panel de seguimiento del bus */}
      {selectedBus && (
        <div className={`live-bus-panel ${isDarkMode ? 'dark-panel' : ''}`}>
          <div className="live-bus-panel-header">
            <strong>Monitoreando Línea {selectedBus.line}</strong>
            <button className="close-live-bus" onClick={() => setSelectedBus(null)}>✕</button>
          </div>
          <div className="live-bus-panel-body">
            <p>Hacia: {selectedBus.destination}</p>
            <p>Parada: {selectedBus.stopName}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente que muestra el bus moviéndose en tiempo real
function LiveBusLayer({ selectedBus }) {
  const [busLocations, setBusLocations] = useState([]);
  const map = useMap();
  const yaCentrado = useRef(false);

  // Resetear cuando cambiamos de bus
  useEffect(() => {
    yaCentrado.current = false;
    setBusLocations([]);
  }, [selectedBus]);

  // Pedir la ubicacion del bus cada 20 segundos
  useEffect(() => {
    if (!selectedBus) return;

    let timeoutId;
    let montado = true;

    async function pedirUbicacion() {
      try {
        const ubicaciones = await getBusLocation(
          selectedBus.codMode,
          selectedBus.codLine,
          selectedBus.direction,
          selectedBus.codStop
        );

        if (ubicaciones && ubicaciones.length > 0 && montado) {
          setBusLocations(ubicaciones);
          // Centrar el mapa en el bus la primera vez
          if (!yaCentrado.current) {
            yaCentrado.current = true;
            map.setView([ubicaciones[0].latitude, ubicaciones[0].longitude], 15, { animate: true });
          }
        }
      } catch (e) {
        console.error("Error obteniendo ubicacion del bus:", e);
      } finally {
        // Programar la siguiente peticion (20s)
        if (montado) {
          timeoutId = setTimeout(pedirUbicacion, 20000);
        }
      }
    }

    pedirUbicacion();

    return () => {
      montado = false;
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

