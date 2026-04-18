// MapPage.jsx — Componente principal del mapa
import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
import StopBottomSheet from './StopBottomSheet';
import usePresence from '../../hooks/usePresence';
import { loadFavourites, addFavourite, removeFavourite } from '../../services/favoritesService';
import FavouriteModal from './FavouriteModal';
import FavouritePopupLayer from './FavouritePopupLayer';
import TrafficIncidentsLayer from './TrafficIncidentsLayer';
import ReportModal from './ReportModal';
import ReportsPanel from './ReportsPanel';
import { TbBus, TbFlag, TbCircleCheck } from 'react-icons/tb';
import semaforoIcon from '../../assets/icono-semaforo.png';

// Componente interno para controlar el mapa desde fuera del MapContainer
function MapController({ flyToTarget }) {
  const map = useMap();
  const prevTarget = useRef(null);
  useEffect(() => {
    if (flyToTarget && flyToTarget !== prevTarget.current) {
      prevTarget.current = flyToTarget;
      map.flyTo([flyToTarget.lat, flyToTarget.lng], 17, { duration: 1 });
    }
  }, [flyToTarget, map]);
  return null;
}
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
  const [selectedStop, setSelectedStop] = useState(null);
  const [favourites, setFavourites] = useState([]);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [favModal, setFavModal] = useState(null); // { stopId, stopName }
  const [trafficVisible, setTrafficVisible] = useState(false);
  const [onBus, setOnBus] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportToast, setReportToast] = useState(false);
  const [reportsPanelKey, setReportsPanelKey] = useState(0);
  const toastTimerRef = useRef(null);
  const navigate = useNavigate();

  // Resetear estado de bus al cambiar de línea
  useEffect(() => {
    setOnBus(false);
    setReportModalOpen(false);
  }, [selectedBus?.line, selectedBus?.codStop]);

  // Limpiar el timer del toast si el componente desmonta
  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

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

  // Cargar favoritos al montar
  useEffect(() => {
    loadFavourites().then(setFavourites);
  }, []);

  // Toggle favorito para la parada seleccionada
  // Desktop: handleToggleFavourite(stopId, stopName)
  // Móvil:   handleToggleFavourite(stopName) ← stopId viene de selectedStop
  const handleToggleFavourite = async (stopIdOrName, stopNameFromDesktop) => {
    let id, stopName;
    if (typeof stopIdOrName === 'number') {
      id = stopIdOrName;
      stopName = stopNameFromDesktop;
    } else {
      id = selectedStop?.stopId;
      stopName = stopIdOrName;
    }
    if (!id) return;
    // Recargar desde servidor para evitar duplicados por estado desactualizado
    const current = await loadFavourites();
    setFavourites(current);
    const esFav = current.some(f => f.stopId === id);
    if (esFav) {
      await removeFavourite(id);
      loadFavourites().then(setFavourites);
    } else {
      setFavModal({ stopId: id, stopName: stopName || '' });
    }
  };

  const handleFavModalSave = async (alias) => {
    if (!favModal) return;
    await addFavourite(favModal.stopId, alias);
    const updated = await loadFavourites();
    setFavourites(updated);
    setFavModal(null);
  };

  const handleRemoveFavourite = async (stopId) => {
    await removeFavourite(stopId);
    const updated = await loadFavourites();
    setFavourites(updated);
  };

  // Abrir parada desde favoritos (sidebar)
  const [desktopFavStop, setDesktopFavStop] = useState(null);

  const handleSelectFavourite = (fav) => {
    setFlyToTarget({ lat: fav.lat, lng: fav.lng });
    if (window.innerWidth < 768) {
      // Móvil: bottom sheet
      setSelectedStop({
        codStop: fav.codStop,
        name: fav.name,
        typeLabel: fav.typeLabel,
        lines: fav.lines,
        lat: fav.lat,
        lng: fav.lng,
        stopId: fav.stopId,
      });
    } else {
      // Desktop: popup de Leaflet sobre el marcador
      setDesktopFavStop(fav);
    }
  };

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

  // URLs de los tiles de etiquetas (nombres de ciudades/pueblos, encima de todo)
  const lightLabelsUrl = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";
  const darkLabelsUrl = "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";
  const labelsUrl = isDarkMode ? darkLabelsUrl : lightLabelsUrl;

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
        <MapController flyToTarget={flyToTarget} />
        <FavouritePopupLayer
          stop={desktopFavStop}
          isDarkMode={isDarkMode}
          onSelectBus={setSelectedBus}
          onClose={() => setDesktopFavStop(null)}
        />
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
          <BusStopsLayer
            isDarkMode={isDarkMode}
            onSelectBus={setSelectedBus}
            onSelectStop={setSelectedStop}
            selectedBus={selectedBus}
            favourites={favourites}
            onToggleFavourite={handleToggleFavourite}
          />
        )}

        {/* Paradas destacadas por busqueda (ocultas durante tracking) */}
        {highlightedStops.length > 0 && !selectedBus && (
          <HighlightedStopsLayer
            stops={highlightedStops}
            isDarkMode={isDarkMode}
            onSelectBus={setSelectedBus}
            onSelectStop={setSelectedStop}
          />
        )}

        <TrafficIncidentsLayer visible={trafficVisible} />

        {trafficVisible && (
          <TileLayer
            url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative-delay/{z}/{x}/{y}.png?key=${import.meta.env.VITE_TOMTOM_API_KEY}&tileSize=256`}
            opacity={0.8}
            attribution="&copy; TomTom"
          />
        )}

        {/* Etiquetas de nombres (ciudades, pueblos, calles) — siempre encima */}
        <TileLayer
          url={labelsUrl}
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          pane="shadowPane"
        />
      </MapContainer>

      {/* Botón toggle tráfico */}
      <button
        className={`traffic-toggle-btn ${trafficVisible ? 'active' : ''} ${isDarkMode ? 'dark' : ''}`}
        onClick={() => setTrafficVisible(v => !v)}
        title={trafficVisible ? 'Ocultar tráfico' : 'Mostrar tráfico'}
      >
        <img src={semaforoIcon} alt="Tráfico" className="traffic-toggle-icon" />
      </button>

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
        favourites={favourites}
        onSelectFavourite={handleSelectFavourite}
        onRemoveFavourite={handleRemoveFavourite}
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
            <button className="close-live-bus" onClick={() => { setSelectedBus(null); setOnBus(false); setReportModalOpen(false); }}>✕</button>
          </div>
          <div className="live-bus-panel-body">
            <p>Hacia: {selectedBus.destination}</p>
            <p>Parada: {selectedBus.stopName}</p>
            <div className="live-bus-actions">
              <button
                className={`on-bus-btn ${onBus ? 'active' : ''}`}
                onClick={() => setOnBus(v => !v)}
              >
                <TbBus size={15} />
                {onBus ? 'En este bus' : 'Voy en este bus'}
              </button>
              {onBus && (
                <button
                  className="report-btn"
                  onClick={async () => {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) return;
                    setReportModalOpen(true);
                  }}
                >
                  <TbFlag size={15} />
                  Reportar
                </button>
              )}
            </div>
          </div>
          <ReportsPanel
            key={reportsPanelKey}
            lineName={selectedBus.line}
            isDarkMode={isDarkMode}
            onBus={onBus}
          />
        </div>
      )}

      {/* Bottom sheet de parada seleccionada (solo móvil) */}
      {selectedStop && window.innerWidth < 768 && (
        <StopBottomSheet
          stop={selectedStop}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedStop(null)}
          onSelectBus={(bus) => { setSelectedBus(bus); setSelectedStop(null); }}
          isFavourite={selectedStop ? favourites.some(f => f.stopId === selectedStop.stopId) : false}
          onToggleFavourite={handleToggleFavourite}
        />
      )}

      {/* Modal para nombrar favorito */}
      {favModal && (
        <FavouriteModal
          stopName={favModal.stopName}
          isDarkMode={isDarkMode}
          existingAliases={favourites.map(f => f.alias).filter(Boolean)}
          onSave={handleFavModalSave}
          onCancel={() => setFavModal(null)}
        />
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

      {/* Modal de reporte de incidencia */}
      {reportModalOpen && selectedBus && (
        <ReportModal
          bus={selectedBus}
          userLocation={userLocation}
          isDarkMode={isDarkMode}
          onClose={() => setReportModalOpen(false)}
          onSuccess={() => {
            setReportToast(true);
            setReportsPanelKey(k => k + 1);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setReportToast(false), 3000);
          }}
        />
      )}

      {/* Toast de confirmación de reporte */}
      {reportToast && (
        <div className={`report-toast ${isDarkMode ? 'dark' : ''}`}>
          <TbCircleCheck size={16} /> Reporte enviado. ¡Gracias!
        </div>
      )}
    </div>
  );
}
