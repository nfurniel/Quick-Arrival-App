import { API_URL } from '../config';

// El codStop lleva el modo delante (6_xxx urbano, 8_xxx interurbano) y con eso
// el backend ya sabe si tiene que preguntar a la EMT o al CRTM.
export async function getArrivals(codStop) {
  try {
    const response = await fetch(`${API_URL}/api/arrivals?codStop=${encodeURIComponent(codStop)}`);
    const json = await response.json();

    return {
      arrivals: json.arrivals || [],
      error: !!json.error,
    };
  } catch (error) {
    console.error('Error cargando llegadas:', error.message);
    return { arrivals: [], error: true };
  }
}
