// LocateControl.jsx — Boton para centrar el mapa en la ubicacion del usuario
import React from 'react';
import { useMap } from 'react-leaflet';
import centerLogo from '../../assets/center-logo.png';

export default function LocateControl({ position }) {
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
          <img src={centerLogo} alt="Centrar" className="center-logo-icon" />
        </button>
      </div>
    </div>
  );
}
