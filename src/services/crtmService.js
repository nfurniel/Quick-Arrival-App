// crtmService.js — Servicio para obtener paradas de bus de la Comunidad de Madrid
// Fuente: CRTM (Consorcio Regional de Transportes de Madrid) — Datos Abiertos ArcGIS
// No requiere autenticación. Datos públicos.

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

/**
 * Obtiene los tiempos de llegada en tiempo real para una parada.
 * @param {string} codStop - Código de parada (ej: "8_06032" para interurbano, "6_1234" para EMT)
 * @param {AbortSignal} [signal] - Señal para cancelar la petición si el popup se cierra
 * @param {number} [retries=2] - Número de reintentos si el servidor falla
 * @returns {Array} Array de llegadas con línea, destino y minutos restantes
 */
export async function getStopTimes(codStop, signal, retries = 2) {
  try {
    const cacheBust = Date.now();
    const url = `${CRTM_WIDGETS_BASE}/GetStopsTimes.php?codStop=${codStop}&type=0&orderBy=2&stopTimesByIti=${codStop}&_=${cacheBust}`;
    const response = await fetch(url, { cache: 'no-store', signal });

    if (!response.ok) {
      console.warn(`CRTM StopTimes: ${response.status} para ${codStop}`);
      // Reintentar si el CRTM devuelve 500/504 (servidor inestable)
      if ((response.status >= 500) && retries > 0) {
        console.log(`CRTM: Reintentando en 3s... (${retries} intentos restantes)`);
        await new Promise(r => setTimeout(r, 3000));
        return getStopTimes(codStop, signal, retries - 1);
      }
      return [];
    }

    const json = await response.json();
    const timesData = json?.stopTimes?.times?.Time;

    if (!timesData) return [];

    // Normalizar a array (a veces viene un solo objeto)
    const timesArray = Array.isArray(timesData) ? timesData : [timesData];

    const now = new Date();

    return timesArray.map(t => {
      const arrivalTime = new Date(t.time);
      const diffMs = arrivalTime - now;
      const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

      return {
        line: t.line?.shortDescription || '?',
        lineDescription: t.line?.description || '',
        destination: t.destination || '',
        minutes: diffMinutes,
        arrivalTime: arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        // Datos extra necesarios para pedir la localización del bus
        codMode: t.line?.codMode || '8',
        codLine: t.line?.codLine || '',
        direction: t.direction || 1,
      };
    }).filter(t => t.minutes >= 0).slice(0, 6); // Máximo 6 próximas llegadas
  } catch (error) {
    console.error('Error al obtener tiempos CRTM:', error);
    return [];
  }
}

/**
 * Obtiene la ubicación GPS en tiempo real de los autobuses de una línea.
 * @param {string} mode - Código del modo de transporte (ej: 8 para interurbanos, 6 para EMT)
 * @param {string} codLine - Código de la línea (obtenido de getStopTimes, ej: "8__611___")
 * @param {number} direction - Dirección del itinerario (1 o 2)
 * @param {string} codStop - Código de la parada origen
 * @returns {Array} Array de ubicaciones con latitud y longitud
 */
export async function getBusLocation(mode, codLine, direction, codStop, retries = 2) {
  try {
    const cacheBust = Date.now();
    const url = `${CRTM_WIDGETS_BASE}/GetLineLocation.php?mode=${mode}&codLine=${codLine}&codStop=${codStop}&direction=${direction}&codItinerary=&_=${cacheBust}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.warn(`CRTM LineLocation: ${response.status} para línea ${codLine}`);
      if (response.status >= 500 && retries > 0) {
        console.log(`CRTM Location: Reintentando en 3s... (${retries} intentos restantes)`);
        await new Promise(r => setTimeout(r, 3000));
        return getBusLocation(mode, codLine, direction, codStop, retries - 1);
      }
      return [];
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
    console.error('Error al obtener ubicación del bus CRTM:', error);
    return [];
  }
}
