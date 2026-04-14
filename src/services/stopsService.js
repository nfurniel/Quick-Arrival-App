// stopsService.js - Servicio para cargar las paradas desde el backend propio
// Las peticiones van a los endpoints de la API REST en /api
// El backend es el único que accede directamente a Supabase

// Consultar las paradas que están dentro del área visible del mapa
export async function getStopsInBounds(minLng, minLat, maxLng, maxLat) {
  try {
    const params = new URLSearchParams({ minLat, maxLat, minLng, maxLng });
    const response = await fetch(`/api/stops?${params}`);

    if (!response.ok) {
      console.error('Error cargando paradas:', response.status);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error cargando paradas:', error.message);
    return [];
  }
}

// Caché de todas las líneas únicas
let allLinesCache = null;

// Obtener todas las líneas únicas disponibles
export async function getAllLines() {
  if (allLinesCache) return allLinesCache;

  try {
    const response = await fetch('/api/lines');

    if (!response.ok) {
      console.error('Error cargando líneas:', response.status);
      return [];
    }

    allLinesCache = await response.json();
    return allLinesCache;
  } catch (error) {
    console.error('Error cargando líneas:', error.message);
    return [];
  }
}

// Buscar las paradas más cercanas al usuario que tengan una línea concreta
// Devuelve max 4 paradas ordenadas por distancia
export async function getNearbyStopsForLine(userLat, userLng, lineNumber, radiusKm = 1.5) {
  try {
    const params = new URLSearchParams({ lat: userLat, lng: userLng, line: lineNumber, radius: radiusKm });
    const response = await fetch(`/api/stops-nearby?${params}`);

    if (!response.ok) {
      console.error('Error buscando paradas por línea:', response.status);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error buscando paradas por línea:', error.message);
    return [];
  }
}
