// mapIcons.js — Definicion de todos los iconos del mapa
import L from 'leaflet';
import busIconImg from '../../assets/icono-parada-bus.png';
import busInterurbanoImg from '../../assets/icono-parada-bus-interurbano.png';
import busLocalImg from '../../assets/icono-parada-bus-local.png';

// Fix para los iconos por defecto de Leaflet con Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Iconos de parada por tipo
export const busStopIcons = {
  urbano: new L.Icon({
    iconUrl: busIconImg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    className: 'bus-stop-marker'
  }),
  interurbano: new L.Icon({
    iconUrl: busInterurbanoImg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    className: 'bus-stop-marker'
  }),
  local: new L.Icon({
    iconUrl: busLocalImg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    className: 'bus-stop-marker'
  }),
};

// Iconos activos (parada seleccionada, un poco mas grande)
export const activeBusStopIcons = {
  urbano: new L.Icon({
    iconUrl: busIconImg,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    className: 'bus-stop-marker active-bus-stop-marker'
  }),
  interurbano: new L.Icon({
    iconUrl: busInterurbanoImg,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    className: 'bus-stop-marker active-bus-stop-marker'
  }),
  local: new L.Icon({
    iconUrl: busLocalImg,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    className: 'bus-stop-marker active-bus-stop-marker'
  }),
};

// Icono del bus en movimiento
export const liveBusIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  className: 'live-bus-marker'
});

// Icono de la parada destino durante el tracking
export const trackingStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -19],
  className: 'tracking-stop-marker'
});

// Icono destacado para paradas de busqueda
export const highlightedStopIcon = new L.Icon({
  iconUrl: busIconImg,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
  className: 'highlighted-stop-marker'
});

// Determinar el tipo de parada segun cod_mode y lineas
export function getStopType(codMode, lines) {
  if (codMode === 6) return 'urbano';
  if (lines) {
    const lineas = lines.split(',').map(l => l.trim());
    const soloLocales = lineas.every(l => /^L\d/.test(l));
    if (soloLocales) return 'local';
  }
  return 'interurbano';
}
