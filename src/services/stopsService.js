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

// Esta es la caché de todas las líneas únicas
let allLinesCache = null;

// Obtener todas las líneas únicas disponibles
export async function getAllLines() {
  if (allLinesCache)
    return allLinesCache;

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

