// Mismo servicio que en la web pero con la URL completa del backend.
import { API_URL } from '../config';

// Paradas que caen dentro de lo que se ve del mapa
export async function getStopsInBounds(minLng, minLat, maxLng, maxLat) {
  try {
    const params = new URLSearchParams({ minLat, maxLat, minLng, maxLng });
    const response = await fetch(`${API_URL}/api/stops?${params}`);

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

let allLinesCache = null;

export async function getAllLines() {
  if (allLinesCache)
    return allLinesCache;

  try {
    const response = await fetch(`${API_URL}/api/lines`);

    if (!response.ok) {
      console.error('Error cargando lineas:', response.status);
      return [];
    }

    allLinesCache = await response.json();
    return allLinesCache;
  } catch (error) {
    console.error('Error cargando lineas:', error.message);
    return [];
  }
}
