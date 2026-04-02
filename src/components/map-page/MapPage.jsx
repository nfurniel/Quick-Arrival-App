// MapPage.jsx — Componente principal del mapa
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import './MapPage.css';
import { supabase } from '../../supabaseClient';
import Sidebar, { avatars } from './Sidebar';
import BusSearchModal from './BusSearchModal';
import LocateControl from './LocateControl';
import BusStopsLayer from './BusStopsLayer';
import LiveBusLayer from './LiveBusLayer';
import HighlightedStopsLayer from './HighlightedStopsLayer';
import usePresence from '../../hooks/usePresence';
// Importar mapIcons para que se ejecute el fix de Leaflet
import './mapIcons';

// Saludo segun la hora del dia
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

// Es de noche? (para dark mode automatico)
function isNightTime() {
  const hour = new Date().getHours();
  return hour >= 21 || hour < 6;
}

export default function MapPage() {
  const [userLocation, setUserLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(isNightTime);
  const [selectedBus, setSelectedBus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [busSearchOpen, setBusSearchOpen] = useState(true);
  const [highlightedStops, setHighlightedStops] = useState([]);
  const navigate = useNavigate();

  // Presencia: ver otros usuarios en el mapa
  const otherUsers = usePresence(userLocation, userName, selectedAvatar);

  // Cargar datos del usuario (nombre y avatar guardado)
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        setUserName(meta.full_name || user.email?.split('@')[0] || 'Usuario');
        const savedAvatar = meta.avatar_index;
        if (savedAvatar !== undefined && savedAvatar !== null) {
          setSelectedAvatar(Number(savedAvatar));
        } else {
          setSelectedAvatar(Math.floor(Math.random() * avatars.length));
        }
      }
    }
    loadUser();
  }, []);

  // Icono del usuario (avatar seleccionado)
  const userIcon = new L.Icon({
    iconUrl: avatars[selectedAvatar] || avatars[0],
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    popupAnchor: [0, -32],
    className: 'custom-user-marker'
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Guardar avatar seleccionado en Supabase
  const handleAvatarSelect = async (index) => {
    setSelectedAvatar(index);
    setShowAvatarPicker(false);
    await supabase.auth.updateUser({
      data: { avatar_index: index }
    });
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

  const greeting = getGreeting();

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

        {/* Otros usuarios conectados */}
        {otherUsers.map((u) => (
          <Marker
            key={u.id}
            position={[u.lat, u.lng]}
            icon={new L.Icon({
              iconUrl: avatars[u.avatar] || avatars[0],
              iconSize: [48, 48],
              iconAnchor: [24, 24],
              popupAnchor: [0, -24],
              className: 'other-user-marker'
            })}
          >
            <Popup className={isDarkMode ? 'dark-popup' : ''}>
              {u.name}
            </Popup>
          </Marker>
        ))}

        {/* Paradas de bus (ocultas durante tracking) */}
        {!selectedBus && (
          <BusStopsLayer isDarkMode={isDarkMode} onSelectBus={setSelectedBus} selectedBus={selectedBus} />
        )}

        {/* Paradas destacadas por busqueda (ocultas durante tracking) */}
        {highlightedStops.length > 0 && !selectedBus && (
          <HighlightedStopsLayer stops={highlightedStops} isDarkMode={isDarkMode} onSelectBus={setSelectedBus} />
        )}
      </MapContainer>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        userName={userName}
        selectedAvatar={selectedAvatar}
        onAvatarSelect={handleAvatarSelect}
        showAvatarPicker={showAvatarPicker}
        onToggleAvatarPicker={() => setShowAvatarPicker(!showAvatarPicker)}
        greeting={greeting}
        onLogout={handleLogout}
        onSearchBus={() => { setSidebarOpen(false); setBusSearchOpen(true); }}
      />

      {/* Boton para quitar paradas destacadas */}
      {highlightedStops.length > 0 && (
        <button
          className="clear-highlights-btn"
          onClick={() => setHighlightedStops([])}
        >
          ✕ Quitar resalto
        </button>
      )}

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

      {/* Modal de busqueda de bus */}
      <BusSearchModal
        isOpen={busSearchOpen}
        isDarkMode={isDarkMode}
        userLocation={userLocation}
        onResults={(stops) => {
          setHighlightedStops(stops);
          setBusSearchOpen(false);
        }}
        onDismiss={() => setBusSearchOpen(false)}
      />
    </div>
  );
}
