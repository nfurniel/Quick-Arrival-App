// crtmService.js — Servicio para obtener paradas de bus de la Comunidad de Madrid
// Fuente: CRTM (Consorcio Regional de Transportes de Madrid) — Datos Abiertos ArcGIS
// Para paradas urbanas (EMT): usa la API oficial de EMT
// Para paradas interurbanas: usa el widget del CRTM

import { getEMTBusLocations } from './emtService';

const ARCGIS_BASE = 'https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services';

// FeatureServers oficiales del CRTM:
// Layer 0 = Estaciones (paradas con DENOMINACION y LINEAS)
const INTERURBAN_URL = `${ARCGIS_BASE}/M8_Red/FeatureServer/0/query`;
const URBAN_URL = `${ARCGIS_BASE}/M6_Red/FeatureServer/0/query`;

/**
 * Obtiene paradas de autobuses (urbanos + interurbanos) dentro del viewport del mapa.
 * Usa el filtro geométrico "esriGeometryEnvelope" de ArcGIS para limitar al viewport.
 * @param {number} minLng - Longitud mínima del viewport
 * @param {number} minLat - Latitud mínima del viewport
 * @param {number} maxLng - Longitud máxima del viewport
 * @param {number} maxLat - Latitud máxima del viewport
 * @returns {Array} Array de features GeoJSON con paradas
 */
export async function getCRTMStopsInBounds(minLng, minLat, maxLng, maxLat) {
  const geometryParam = `${minLng},${minLat},${maxLng},${maxLat}`;

  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'DENOMINACION,LINEAS,CODIGOESTACION,CODIGOMUNICIPIO',
    geometry: geometryParam,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    resultRecordCount: '300',
    f: 'geojson',
  });

  try {
    // Pedir interurbanas y urbanas en paralelo
    const [interurbanRes, urbanRes] = await Promise.all([
      fetch(`${INTERURBAN_URL}?${params}`),
      fetch(`${URBAN_URL}?${params}`),
    ]);

    const results = [];

    if (interurbanRes.ok) {
      const interurbanData = await interurbanRes.json();
      if (interurbanData.features) {
        results.push(...interurbanData.features.map(f => ({ ...f, _type: 'interurbano' })));
      }
    }

    if (urbanRes.ok) {
      const urbanData = await urbanRes.json();
      if (urbanData.features) {
        results.push(...urbanData.features.map(f => ({ ...f, _type: 'urbano' })));
      }
    }

    return results;
  } catch (error) {
    console.error('Error al obtener paradas CRTM:', error);
    return [];
  }
}

/**
 * Obtiene los tiempos de llegada en tiempo real para una parada.
 * La caché y la lógica de reintentos se gestionan en el servidor (/api/arrivals).
 *
 * @param {string} codStop - Código de parada (ej: "8_06032" para interurbano, "6_1234" para EMT)
 * @param {AbortSignal} [signal] - Señal para cancelar la petición si el popup se cierra
 * @returns {Object} { arrivals: Array, stale: boolean, cachedAt: Date|null, error: boolean }
 */
export async function getStopTimes(codStop, signal) {
  try {
    const response = await fetch(`/api/arrivals?codStop=${encodeURIComponent(codStop)}`, { signal });
    if (!response.ok) {
      console.error(`[arrivals] Error ${response.status} para ${codStop}`);
      return { arrivals: [], stale: false, cachedAt: null, error: true };
    }
    const json = await response.json();
    return {
      arrivals:  json.arrivals  ?? [],
      stale:     json.stale     ?? false,
      cachedAt:  null,
      error:     json.error     ?? false,
    };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('[arrivals] Error de red:', error.message);
    return { arrivals: [], stale: false, cachedAt: null, error: true };
  }
}

/**
 * Obtiene la ubicación GPS en tiempo real de los autobuses de una línea.
 * Usa backoff exponencial para reintentos.
 * @param {string} mode - Código del modo de transporte (ej: 8 para interurbanos, 6 para EMT)
 * @param {string} codLine - Código de la línea (obtenido de getStopTimes, ej: "8__611___")
 * @param {number} direction - Dirección del itinerario (1 o 2)
 * @param {string} codStop - Código de la parada origen
 * @param {number} [maxRetries=1] - Número máximo de reintentos
 * @returns {Array} Array de ubicaciones con latitud y longitud
 */
export async function getBusLocation(mode, codLine, direction, codStop, maxRetries = 2, busId) {
  // Para buses urbanos (EMT), usar la API de EMT
  if (String(mode) === '6') {
    const emtStopId = codStop.replace('6_', '');
    console.log(`[EMT Location] Usando API de EMT para localizar bus ${busId || codLine} en parada ${emtStopId}...`);
    try {
      const locations = await getEMTBusLocations(emtStopId, codLine, busId);
      return locations;
    } catch (e) {
      console.error('[EMT Location] Error:', e.message);
      return [];
    }
  }

  // Para interurbanos, usar CRTM
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffDelay(attempt - 1);
      console.log(`[CRTM Location] Reintento ${attempt}/${maxRetries} en ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const cacheBust = Date.now();
      const url = `${CRTM_WIDGETS_BASE}/GetLineLocation.php?mode=${mode}&codLine=${codLine}&codStop=${codStop}&direction=${direction}&codItinerary=&_=${cacheBust}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        console.warn(`[CRTM Location] ${response.status} para línea ${codLine} (intento ${attempt + 1})`);
        lastError = `HTTP ${response.status}`;
        if (response.status >= 500) continue;
        break;
      }

      const json = await response.json();
      const vehiclesData = json?.vehiclesLocation?.VehicleLocation;

      if (!vehiclesData) return [];

      const vehiclesArray = Array.isArray(vehiclesData) ? vehiclesData : [vehiclesData];

      return vehiclesArray.map(v => ({
        latitude: v.coordinates?.latitude,
        longitude: v.coordinates?.longitude,
        vehicleId: v.codVehicle,
        lineCode: v.line?.shortDescription || ''
      })).filter(v => v.latitude && v.longitude);

    } catch (error) {
      console.warn(`[CRTM Location] Error de red (intento ${attempt + 1}):`, error.message);
      lastError = error.message;
    }
  }

  console.error(`[CRTM Location] ❌ Sin ubicación para línea ${codLine}. Error: ${lastError}`);
  return [];
}
