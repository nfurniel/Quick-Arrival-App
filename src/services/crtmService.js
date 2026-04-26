// Servicios para obtener datos del transporte público de Madrid.
// Las paradas se obtienen de los servidores GIS del CRTM.
// Los tiempos de llegada se piden al backend propio (/api/arrivals).

import { getEMTBusLocations } from './emtService';

const ARCGIS_BASE = 'https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services';
const INTERURBAN_URL = `${ARCGIS_BASE}/M8_Red/FeatureServer/0/query`;
const URBAN_URL      = `${ARCGIS_BASE}/M6_Red/FeatureServer/0/query`;

// Devuelve las paradas visibles en el área del mapa en ese momento
export async function getCRTMStopsInBounds(minLng, minLat, maxLng, maxLat) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'DENOMINACION,LINEAS,CODIGOESTACION,CODIGOMUNICIPIO',
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    resultRecordCount: '300',
    f: 'geojson',
  });

  try {
    const [interurbanRes, urbanRes] = await Promise.all([
      fetch(`${INTERURBAN_URL}?${params}`),
      fetch(`${URBAN_URL}?${params}`),
    ]);

    const results = [];
    if (interurbanRes.ok) {
      const data = await interurbanRes.json();
      if (data.features) results.push(...data.features.map(f => ({ ...f, _type: 'interurbano' })));
    }
    if (urbanRes.ok) {
      const data = await urbanRes.json();
      if (data.features) results.push(...data.features.map(f => ({ ...f, _type: 'urbano' })));
    }
    return results;
  } catch (error) {
    console.error('Error al obtener paradas CRTM:', error);
    return [];
  }
}

// Pide los tiempos de llegada al backend. La caché la gestiona el servidor.
export async function getStopTimes(codStop, signal) {
  try {
    const response = await fetch(`/api/arrivals?codStop=${encodeURIComponent(codStop)}`, { signal });
    if (!response.ok) {
      return { arrivals: [], stale: false, cachedAt: null, error: true };
    }
    const json = await response.json();
    return {
      arrivals: json.arrivals ?? [],
      stale:    json.stale    ?? false,
      cachedAt: null,
      error:    json.error    ?? false,
    };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return { arrivals: [], stale: false, cachedAt: null, error: true };
  }
}

// Devuelve la posición GPS de los autobuses de una línea en tiempo real
export async function getBusLocation(mode, codLine, direction, codStop, maxRetries = 2, busId, codItinerary = '') {
  if (String(mode) === '6') {
    try {
      return await getEMTBusLocations(codStop.replace('6_', ''), codLine, busId);
    } catch {
      return [];
    }
  }

  const CRTM_WIDGETS_BASE = '/api/crtm/widgets/api';
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
    }
    try {
      const url = `${CRTM_WIDGETS_BASE}/GetLineLocation.php?mode=${mode}&codLine=${codLine}&codStop=${codStop}&direction=${direction}&codItinerary=&_=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (response.status >= 500) continue;
        break;
      }

      const json = await response.json();
      const vehiclesData = json?.vehiclesLocation?.VehicleLocation;
      if (!vehiclesData) return [];

      const vehicles = Array.isArray(vehiclesData) ? vehiclesData : [vehiclesData];
      return vehicles
        .filter(v => !v.direction || String(v.direction) === String(direction))
        .map(v => ({
          latitude:  v.coordinates?.latitude,
          longitude: v.coordinates?.longitude,
          vehicleId: v.codVehicle,
          lineCode:  v.line?.shortDescription || '',
        }))
        .filter(v => v.latitude && v.longitude);

    } catch (error) {
      lastError = error.message;
    }
  }

  console.error(`[CRTM] Sin ubicación para línea ${codLine}. Error: ${lastError}`);
  return [];
}
