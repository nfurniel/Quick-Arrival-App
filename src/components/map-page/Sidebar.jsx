import React, { useState } from 'react';
import './Sidebar.css';
import lightThemeIcon from '../../assets/light-theme-icon.png';
import darkThemeIcon from '../../assets/dark-theme-icon.png';
import searchBlack from '../../assets/search-black.png';
import searchWhite from '../../assets/search-white.png';

// Avatares
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

export const avatars = [
  avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7,
  avatar8, avatar9, avatar10, avatar11, avatar12, avatar13, avatar14
];

function FavItem({ fav, onSelect, onRemove }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`sidebar-fav-item ${confirming ? 'confirming' : ''}`}>
      {confirming ? (
        <div className="sidebar-fav-confirm">
          <span className="sidebar-fav-confirm-text">¿Eliminar?</span>
          <button className="sidebar-fav-confirm-yes" onClick={() => onRemove(fav.stopId)}>Sí</button>
          <button className="sidebar-fav-confirm-no" onClick={() => setConfirming(false)}>No</button>
        </div>
      ) : (
        <>
          <button className="sidebar-fav-main" onClick={onSelect}>
            <span className="sidebar-fav-star">♥</span>
            <span className="sidebar-fav-name">{fav.name}</span>
            {fav.lines.length > 0 && (
              <span className="sidebar-fav-lines">{fav.lines.slice(0, 3).join(' · ')}</span>
            )}
          </button>
          <button
            className="sidebar-fav-delete"
            onClick={() => setConfirming(true)}
            aria-label="Eliminar favorito"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

export default function Sidebar({
  isOpen,
  onOpen,
  onClose,
  isDarkMode,
  onToggleDarkMode,
  userName,
  selectedAvatar,
  onAvatarSelect,
  showAvatarPicker,
  onToggleAvatarPicker,
  greeting,
  onLogout,
  onSearchBus,
  favourites,
  onSelectFavourite,
  onRemoveFavourite,
}) {
  const handleClose = () => {
    onClose();
    if (showAvatarPicker) onToggleAvatarPicker();
  };

  return (
    <>
      {/* Boton hamburguesa para abrir sidebar */}
      <button
        className="sidebar-toggle-btn"
        onClick={onOpen}
        aria-label="Abrir menú"
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      {/* Overlay oscuro cuando el sidebar esta abierto */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          role="button"
          tabIndex={0}
          aria-label="Cerrar menú"
          onClick={handleClose}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose(); }}
        />
      )}

      {/* Sidebar tipo Waze */}
      <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {/* Cabecera del sidebar con avatar y saludo */}
        <div className="sidebar-header">
          <button className="sidebar-close-btn" onClick={handleClose}>✕</button>
          <div
            className="sidebar-avatar-container"
            role="button"
            tabIndex={0}
            aria-label="Cambiar avatar"
            onClick={() => onToggleAvatarPicker()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleAvatarPicker(); }}
          >
            <img src={avatars[selectedAvatar]} alt="Avatar" className="sidebar-avatar" />
            <span className="avatar-edit-badge">✎</span>
          </div>
          <p className="sidebar-greeting">{greeting}</p>
          <h2 className="sidebar-username">{userName.split(' ')[0]}</h2>
        </div>

        {/* Selector de avatares */}
        {showAvatarPicker && (
          <div className="avatar-picker">
            <p className="avatar-picker-title">Elige tu avatar</p>
            <div className="avatar-grid">
              {avatars.map((av, i) => (
                <img
                  key={i}
                  src={av}
                  alt={`Avatar ${i + 1}`}
                  className={`avatar-option ${i === selectedAvatar ? 'avatar-selected' : ''}`}
                  onClick={() => onAvatarSelect(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAvatarSelect(i); }}
                  tabIndex={0}
                  role="button"
                />
              ))}
            </div>
          </div>
        )}

        {/* Opciones del sidebar */}
        <div className="sidebar-menu">
          <button className="sidebar-menu-item" onClick={onSearchBus}>
            <img
              src={isDarkMode ? searchWhite : searchBlack}
              alt="Buscar"
              className="sidebar-menu-icon"
            />
            <span>Buscar bus cerca de mí</span>
          </button>

          <button className="sidebar-menu-item" onClick={onToggleDarkMode}>
            <img
              src={isDarkMode ? lightThemeIcon : darkThemeIcon}
              alt="Tema"
              className="sidebar-menu-icon"
            />
            <span>{isDarkMode ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>

          <div className="sidebar-divider"></div>

          {/* Paradas favoritas */}
          <div className="sidebar-favourites">
            <p className="sidebar-favourites-title">Mis paradas</p>
            {(!favourites || favourites.length === 0) ? (
              <p className="sidebar-favourites-empty">Aún no tienes paradas guardadas</p>
            ) : (
              <div className="sidebar-favourites-list">
                {favourites.map(fav => (
                  <FavItem
                    key={fav.id}
                    fav={fav}
                    onSelect={() => { handleClose(); onSelectFavourite(fav); }}
                    onRemove={onRemoveFavourite}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-divider"></div>

          <button className="sidebar-menu-item sidebar-logout" onClick={onLogout}>
            <span className="sidebar-menu-icon-text">⏻</span>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </>
  );
}
