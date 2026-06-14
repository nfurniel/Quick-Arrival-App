// routeGeometryService.js — Trazado real de las líneas interurbanas (CRTM)
//
// En vez de pedirle a OSRM una ruta de coche inventada (que se metía por
// direcciones prohibidas y a veces cogía otro bus), usamos la geometría
// OFICIAL del recorrido que el CRTM publica en su servidor GIS (capa
// M8_Tramos). Con ella:
//   1. Dibujamos el recorrido REAL que sigue el bus.
//   2. Proyectamos la posición GPS del bus sobre ese recorrido para elegir
//      el bus que de verdad viene a tu parada (el que está justo antes de
//      ella en la ruta), no el más cercano en línea recta.
//
// La capa es pública (sin API key) y permite CORS, así que se consulta
// directamente desde el frontend igual que se hacía con las paradas.

const TRAMOS_URL =
  'https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services/M8_Red/FeatureServer/2/query';

// El trazado de una línea no cambia, así que lo cacheamos durante la sesión.
// Guardamos la promesa para que varias llamadas seguidas no disparen
// varias descargas de lo mismo.
const itinerariesCache = new Map();

// Umbrales (en metros) para decidir si un punto GPS "pertenece" al trazado.
const STOP_SNAP = 150;  // distancia máx. parada → trazado para considerarlo válido
const BUS_SNAP = 150;   // distancia máx. bus → trazado para considerar que va por ahí
const ARRIVE_TOL = 100; // margen tras la parada para seguir considerando que el bus "está llegando" (GPS ruidoso); pasado esto, ya pasó y no es tu bus

// ---------------------------------------------------------------------------
// Helpers de geometría (todo en [lat, lng])
// ---------------------------------------------------------------------------

// Distancia aproximada en metros entre dos puntos. Usamos la aproximación
// equirectangular: a estas distancias tan cortas el error es despreciable y
// es mucho más rápido que la fórmula de Haversine.
function metros(a, b) {
  const mPorGradoLat = 111320;
  const mPorGradoLng = 111320 * Math.cos((a[0] * Math.PI) / 180);
  const dy = (b[0] - a[0]) * mPorGradoLat;
  const dx = (b[1] - a[1]) * mPorGradoLng;
  return Math.hypot(dx, dy);
}

// Interpola un punto entre a y b según t (0..1)
function interpolar(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Proyecta un punto sobre el segmento a-b. Devuelve el parámetro t (posición
// dentro del segmento, 0..1) y la distancia perpendicular en metros.
function proyectarEnSegmento(plat, plng, a, b) {
  const latRef = a[0];
  const mLat = 111320;
  const mLng = 111320 * Math.cos((latRef * Math.PI) / 180);

  // Pasamos a coordenadas locales en metros con origen en 'a'
  const bx = (b[1] - a[1]) * mLng;
  const by = (b[0] - a[0]) * mLat;
  const px = (plng - a[1]) * mLng;
  const py = (plat - a[0]) * mLat;

  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));

  const dx = px - t * bx;
  const dy = py - t * by;
  return { t, dist: Math.hypot(dx, dy) };
}

// Proyecta un punto sobre toda la polilínea. Devuelve a qué distancia del
// inicio del recorrido cae (distAlong, en metros) y lo lejos que está del
// trazado (snapDist).
function proyectarEnRuta(it, lat, lng) {
  const { points, cumDist } = it;
  let mejor = { snapDist: Infinity, distAlong: 0 };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const { t, dist } = proyectarEnSegmento(lat, lng, a, b);
    if (dist < mejor.snapDist) {
      const segLen = cumDist[i + 1] - cumDist[i];
      mejor = { snapDist: dist, distAlong: cumDist[i] + t * segLen };
    }
  }
  return mejor;
}

// Devuelve el punto [lat,lng] que está a 'd' metros del inicio del recorrido
function puntoEnDistancia(it, d) {
  const { points, cumDist } = it;
  if (d <= 0) return points[0];
  const total = cumDist[cumDist.length - 1];
  if (d >= total) return points[points.length - 1];

  for (let i = 0; i < points.length - 1; i++) {
    if (cumDist[i + 1] >= d) {
      const segLen = cumDist[i + 1] - cumDist[i];
      const t = segLen > 0 ? (d - cumDist[i]) / segLen : 0;
      return interpolar(points[i], points[i + 1], t);
    }
  }
  return points[points.length - 1];
}

// Recorta el sub-trazado entre dos distancias del inicio. Es lo que
// dibujamos: desde donde está el bus hasta la parada, siguiendo la calle.
function recortarRuta(it, dInicio, dFin) {
  let a = Math.min(dInicio, dFin);
  let b = Math.max(dInicio, dFin);
  const { points, cumDist } = it;

  const resultado = [puntoEnDistancia(it, a)];
  for (let i = 0; i < points.length; i++) {
    if (cumDist[i] > a && cumDist[i] < b) resultado.push(points[i]);
  }
  resultado.push(puntoEnDistancia(it, b));
  return resultado;
}

// ---------------------------------------------------------------------------
// Descarga y montaje del trazado
// ---------------------------------------------------------------------------

// Une los tramos de un itinerario (ordenados por NUMEROORDEN) en una sola
// polilínea continua, calculando la distancia acumulada en cada vértice y
// dónde queda cada parada (por su CODIGOESTACION).
function montarItinerario(tramos) {
  tramos.sort((x, y) => x.order - y.order);

  const points = [];
  const cumDist = [];
  const stops = new Map(); // codEstacion (número) -> distancia desde el inicio
  let cum = 0;

  for (const tramo of tramos) {
    // ArcGIS da [lng, lat]; Leaflet quiere [lat, lng]
    let seg = tramo.path.map((c) => [c[1], c[0]]);
    if (seg.length === 0) continue;

    // Evitar duplicar el vértice de unión entre tramos consecutivos
    if (points.length > 0 && metros(points[points.length - 1], seg[0]) < 1) {
      seg = seg.slice(1);
    }

    for (const p of seg) {
      if (points.length > 0) cum += metros(points[points.length - 1], p);
      points.push(p);
      cumDist.push(cum);
    }

    // El CODIGOESTACION del tramo es la parada en la que TERMINA → su
    // distancia desde el inicio es la acumulada hasta aquí.
    if (Number.isFinite(tramo.codEst)) stops.set(tramo.codEst, cum);
  }

  return { points, cumDist, stops };
}

// Descarga todos los itinerarios de una línea desde el GIS del CRTM.
// Cada itinerario lleva su SENTIDO (ida/vuelta) para poder descartar el de
// vuelta, que va por la misma calle y si no se cuela como candidato.
async function descargarItinerarios(line) {
  const params = new URLSearchParams({
    where: `NUMEROLINEAUSUARIO='${line}'`,
    outFields: 'CODIGOITINERARIO,SENTIDO,NUMEROORDEN,CODIGOESTACION',
    returnGeometry: 'true',
    outSR: '4326',
    orderByFields: 'CODIGOITINERARIO,NUMEROORDEN',
    f: 'json',
  });

  const res = await fetch(`${TRAMOS_URL}?${params}`);
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`);
  const json = await res.json();
  if (!json.features) return [];

  // Agrupar tramos por itinerario (guardando su sentido)
  const grupos = new Map();
  for (const f of json.features) {
    const iti = f.attributes.CODIGOITINERARIO;
    const path = f.geometry?.paths?.[0];
    if (!path) continue;
    if (!grupos.has(iti)) grupos.set(iti, { sentido: String(f.attributes.SENTIDO), tramos: [] });
    grupos.get(iti).tramos.push({
      order: f.attributes.NUMEROORDEN,
      codEst: parseInt(f.attributes.CODIGOESTACION, 10),
      path,
    });
  }

  return Array.from(grupos.values())
    .map((g) => ({ sentido: g.sentido, ...montarItinerario(g.tramos) }))
    .filter((it) => it.points.length > 1);
}

// Versión cacheada
function getLineItineraries(line) {
  const key = String(line);
  if (!itinerariesCache.has(key)) {
    itinerariesCache.set(key, descargarItinerarios(line).catch((e) => {
      itinerariesCache.delete(key); // permitir reintento si falló
      throw e;
    }));
  }
  return itinerariesCache.get(key);
}

// ---------------------------------------------------------------------------
// Selección del bus correcto
// ---------------------------------------------------------------------------

function busMasCercano(buses, stopLat, stopLng) {
  if (!stopLat || !stopLng) return buses[0];
  return buses.reduce((cerca, b) => {
    const dB = Math.hypot(b.latitude - stopLat, b.longitude - stopLng);
    const dC = Math.hypot(cerca.latitude - stopLat, cerca.longitude - stopLng);
    return dB < dC ? b : cerca;
  });
}

// Elige, entre los itinerarios que pasan por la parada y los buses que hay en
// la línea, el bus que VIENE a por ti: el que aún no ha pasado la parada y está
// más cerca de ella por delante (el que llegará antes).
// IMPORTANTE: un bus que YA pasó la parada NO es tu bus (el de tu tiempo es el
// siguiente, que puede no tener GPS aún). Por eso los descartamos en vez de
// seguir mostrándolos. Si no hay ninguno viniendo, devolvemos null y el caller
// no muestra nada (estado "aún sin localizar").
function elegirBusYRuta(itinerarios, stopCodEst, stopLat, stopLng, buses, direction) {
  const dir = String(direction);

  // Candidatos = itinerarios que sirven esta parada, RESPETANDO EL SENTIDO.
  // Si no, el trazado de vuelta (misma calle, <150 m) se cuela y acaba
  // siguiendo el bus de vuelta o uno que en la ida ya pasó.
  //   1º del sentido correcto y que contienen la parada por código (lo fiable)
  let candidatos = itinerarios.filter((it) => it.sentido === dir && it.stops.has(stopCodEst));
  //   2º del sentido correcto, por cercanía (si la parada no casa por código)
  if (candidatos.length === 0) {
    candidatos = itinerarios.filter(
      (it) => it.sentido === dir && proyectarEnRuta(it, stopLat, stopLng).snapDist < STOP_SNAP
    );
  }
  //   3º red de seguridad: si el sentido no casara, cualquiera que la contenga
  if (candidatos.length === 0) {
    candidatos = itinerarios.filter((it) => it.stops.has(stopCodEst));
  }
  if (candidatos.length === 0) return null;

  let mejor = null;
  for (const it of candidatos) {
    const stopDist = it.stops.has(stopCodEst)
      ? it.stops.get(stopCodEst)
      : proyectarEnRuta(it, stopLat, stopLng).distAlong;

    for (const bus of buses) {
      const pr = proyectarEnRuta(it, bus.latitude, bus.longitude);
      if (pr.snapDist > BUS_SNAP) continue; // este bus no va por este trazado

      const gap = stopDist - pr.distAlong; // >0 = viene, <0 = ya pasó
      if (gap < -ARRIVE_TOL) continue;      // ya pasó la parada → no es tu bus

      // El que viene y está más cerca por delante (menor gap) llega antes.
      if (!mejor || gap < mejor.gap || (gap === mejor.gap && pr.snapDist < mejor.snapDist)) {
        mejor = { bus, it, busDist: pr.distAlong, stopDist, gap, snapDist: pr.snapDist };
      }
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Función pública
// ---------------------------------------------------------------------------

// Dada la parada/bus seleccionados y las posiciones GPS de los buses de la
// línea, devuelve { chosenBus, routePath, real }:
//   - chosenBus: el bus que viene a por ti (o null si ninguno viene)
//   - routePath: el recorrido real bus→parada para dibujar (array [lat,lng])
//   - real: true si se usó el trazado oficial; false si se cayó al plan B
//
// Si tenemos el trazado pero NINGÚN bus viene hacia la parada (los que hay ya
// pasaron / aún sin GPS), devolvemos chosenBus:null para NO mostrar un bus que
// ya se fue. El plan B (bus más cercano + línea recta) queda reservado SOLO
// para cuando no se puede obtener el trazado (GIS caído o línea sin datos).
export async function getInterurbanBusRoute(selectedBus, buses) {
  const stopLat = selectedBus.stopLat;
  const stopLng = selectedBus.stopLng;

  try {
    const itinerarios = await getLineItineraries(selectedBus.line);
    if (itinerarios.length > 0) {
      const stopCodEst = parseInt(String(selectedBus.codStop).split('_')[1], 10);
      const mejor = elegirBusYRuta(itinerarios, stopCodEst, stopLat, stopLng, buses, selectedBus.direction);

      if (mejor) {
        return {
          chosenBus: mejor.bus,
          routePath: recortarRuta(mejor.it, mejor.busDist, mejor.stopDist),
          real: true,
        };
      }
      // Trazado OK pero ningún bus viene → no inventamos un bus pasado
      return { chosenBus: null, routePath: [], real: true };
    }
  } catch (e) {
    console.error('[routeGeometry] Trazado no disponible, usando línea recta:', e.message);
  }

  // Plan B: solo si no se pudo obtener el trazado
  const chosenBus = busMasCercano(buses, stopLat, stopLng);
  const routePath =
    chosenBus && stopLat && stopLng
      ? [[chosenBus.latitude, chosenBus.longitude], [stopLat, stopLng]]
      : [];
  return { chosenBus, routePath, real: false };
}
