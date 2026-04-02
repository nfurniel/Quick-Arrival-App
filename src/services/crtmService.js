// crtmService.js — Servicio para obtener paradas de bus de la Comunidad de Madrid
// Fuente: CRTM (Consorcio Regional de Transportes de Madrid) — Datos Abiertos ArcGIS
// Para paradas urbanas (EMT): usa la API oficial de EMT
// Para paradas interurbanas: usa el widget del CRTM

import { getEMTArrivals, getEMTBusLocations } from './emtService';

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

// --- API de Tiempos en Tiempo Real ---
// Endpoint: https://www.crtm.es/widgets/api/GetStopsTimes.php
// Se enruta a través del proxy de Vite (/api/crtm -> www.crtm.es)

const CRTM_WIDGETS_BASE = '/api/crtm/widgets/api';

// --- CACHÉ EN MEMORIA ---
// Guarda las últimas respuestas exitosas por parada para servir como fallback
// cuando la API falla. TTL = 2 minutos para datos frescos.
const stopTimesCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

/**
 * Espera con backoff exponencial. Delay base = 2s, se duplica en cada reintento.
 * @param {number} attempt - Número de intento (0 = primer reintento)
 */
function backoffDelay(attempt) {
  const baseDelay = 2000; // 2 segundos
  return baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s...
}

/**
 * Obtiene los tiempos de llegada en tiempo real para una parada.
 * Incluye caché local y backoff exponencial para mayor fiabilidad.
 *
 * @param {string} codStop - Código de parada (ej: "8_06032" para interurbano, "6_1234" para EMT)
 * @param {AbortSignal} [signal] - Señal para cancelar la petición si el popup se cierra
 * @param {number} [maxRetries=3] - Número máximo de reintentos si el servidor falla
 * @returns {Object} { arrivals: Array, stale: boolean, cachedAt: Date|null, error: boolean }
 */
export async function getStopTimes(codStop, signal, maxRetries = 3) {
  // Para paradas urbanas (EMT, modo 6), usar la API oficial de EMT
  if (codStop.startsWith('6_')) {
    const emtStopId = codStop.replace('6_', '');
    console.log(`[EMT] Parada urbana detectada (${codStop}), usando API de EMT...`);
    const emtResult = await getEMTArrivals(emtStopId, signal);
    if (!emtResult.error) {
      stopTimesCache.set(codStop, { data: emtResult.arrivals, timestamp: Date.now() });
    }
    return emtResult;
  }

  // 1. Comprobar caché fresco (< 2 min)
  const cached = stopTimesCache.get(codStop);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[CRTM Cache] ✅ Datos frescos de caché para ${codStop}`);
    return { arrivals: cached.data, stale: false, cachedAt: null, error: false };
  }

  // 2. Intentar obtener datos frescos de la API con reintentos
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Si no es el primer intento, esperar con backoff exponencial
    if (attempt > 0) {
      const delay = backoffDelay(attempt - 1);
      console.log(`[CRTM] Reintento ${attempt}/${maxRetries} en ${delay / 1000}s para ${codStop}...`);
      await new Promise(r => setTimeout(r, delay));
    }

    // Comprobar si se canceló la petición (popup cerrado)
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const cacheBust = Date.now();
      const url = `${CRTM_WIDGETS_BASE}/GetStopsTimes.php?codStop=${codStop}&type=0&orderBy=2&stopTimesByIti=${codStop}&_=${cacheBust}`;
      const response = await fetch(url, { cache: 'no-store', signal });

      if (!response.ok) {
        console.warn(`[CRTM] ${response.status} para ${codStop} (intento ${attempt + 1}/${maxRetries + 1})`);
        lastError = `HTTP ${response.status}`;
        // Solo reintentar en errores de servidor (5xx)
        if (response.status >= 500) continue;
        // Para otros errores (4xx), no reintentar
        break;
      }

      const json = await response.json();
      const timesData = json?.stopTimes?.times?.Time;

      if (!timesData) {
        // La API respondió OK pero no hay datos → no es un error, simplemente no hay buses
        // Guardar en cache como "sin datos" para evitar martillear la API
        stopTimesCache.set(codStop, { data: [], timestamp: Date.now() });
        return { arrivals: [], stale: false, cachedAt: null, error: false };
      }

      // Normalizar a array (a veces viene un solo objeto)
      const timesArray = Array.isArray(timesData) ? timesData : [timesData];
      const now = new Date();

      const arrivals = timesArray.map(t => {
        const arrivalTime = new Date(t.time);
        const diffMs = arrivalTime - now;
        const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

        return {
          line: t.line?.shortDescription || '?',
          lineDescription: t.line?.description || '',
          destination: t.destination || '',
          minutes: diffMinutes,
          arrivalTime: arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          codMode: t.line?.codMode || '8',
          codLine: t.line?.codLine || '',
          direction: t.direction || 1,
        };
      }).filter(t => t.minutes >= 0).slice(0, 6);

      //  Éxito — Guardar en caché
      stopTimesCache.set(codStop, { data: arrivals, timestamp: Date.now() });
      console.log(`[CRTM]  Datos frescos obtenidos para ${codStop} (${arrivals.length} llegadas)`);
      return { arrivals, stale: false, cachedAt: null, error: false };

    } catch (error) {
      if (error.name === 'AbortError') throw error; // Propagar cancelación
      console.warn(`[CRTM] Error de red (intento ${attempt + 1}/${maxRetries + 1}):`, error.message);
      lastError = error.message;
    }
  }

  // 3. Todos los reintentos agotados → Intentar servir caché stale como fallback
  if (cached) {
    const cachedAge = Math.round((Date.now() - cached.timestamp) / 60000);
    console.warn(`[CRTM] ⚠️ API falló. Sirviendo caché de hace ${cachedAge} min para ${codStop}`);
    return {
      arrivals: cached.data,
      stale: true,
      cachedAt: new Date(cached.timestamp),
      error: false,
    };
  }

  // 4. Sin caché y sin respuesta → Error total
  console.error(`[CRTM] ❌ Sin datos para ${codStop}. Error: ${lastError}`);
  return { arrivals: [], stale: false, cachedAt: null, error: true };
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
export async function getBusLocation(mode, codLine, direction, codStop, maxRetries = 1, busId) {
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
