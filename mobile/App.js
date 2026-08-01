import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

import { getStopsInBounds } from './src/services/stopsService';
import { getArrivals } from './src/services/arrivalsService';

// Por si el GPS no contesta o el usuario no da permiso, arrancamos en Madrid
const MADRID = {
  latitude: 40.4168,
  longitude: -3.7038,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

// Mas alejado que esto no pido paradas, salen cientos y no se ve nada
const ZOOM_MINIMO = 0.06;

export default function App() {
  return (
    <SafeAreaProvider>
      <Mapa />
    </SafeAreaProvider>
  );
}

function Mapa() {
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState(null);
  const [stops, setStops] = useState([]);
  const [selected, setSelected] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [cargandoLlegadas, setCargandoLlegadas] = useState(false);

  const debounce = useRef(null);
  const yaCargue = useRef(false);

  // Igual que en la web: si el GPS tarda mucho no bloqueamos la app entera,
  // se abre en Madrid y que el usuario se mueva
  useEffect(() => {
    let cancelado = false;

    const red = setTimeout(() => {
      if (!cancelado) setRegion(actual => actual || MADRID);
    }, 9000);

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelado) setRegion(MADRID);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelado) return;
        setRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        });
      } catch {
        if (!cancelado) setRegion(MADRID);
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(red);
    };
  }, []);

  // La primera tanda de paradas la pido yo, a partir de ahi ya salta al mover el mapa
  useEffect(() => {
    if (region && !yaCargue.current) {
      yaCargue.current = true;
      cargarParadas(region);
    }
  }, [region]);

  useEffect(() => {
    return () => clearTimeout(debounce.current);
  }, []);

  async function cargarParadas(r) {
    if (r.latitudeDelta > ZOOM_MINIMO) {
      setStops([]);
      return;
    }

    const data = await getStopsInBounds(
      r.longitude - r.longitudeDelta / 2,
      r.latitude - r.latitudeDelta / 2,
      r.longitude + r.longitudeDelta / 2,
      r.latitude + r.latitudeDelta / 2,
    );

    setStops(data);
  }

  // Sin esto se dispara una peticion por cada pixel que mueves el mapa
  function alMoverMapa(r) {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => cargarParadas(r), 400);
  }

  async function abrirParada(stop) {
    setSelected(stop);
    setArrivals([]);
    setCargandoLlegadas(true);

    const codStop = `${stop.cod_mode}_${stop.cod_estacion}`;
    const res = await getArrivals(codStop);

    setArrivals(res.arrivals);
    setCargandoLlegadas(false);
  }

  if (!region) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator size="large" color="#1e88e5" />
        <Text style={styles.cargandoTexto}>Buscando tu ubicacion...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={alMoverMapa}
        showsUserLocation
        showsMyLocationButton
      >
        {stops.map(stop => (
          <Marker
            key={stop.stop_id}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            pinColor={stop.cod_mode === 8 ? '#43a047' : '#1e88e5'}
            onPress={() => abrirParada(stop)}
            tracksViewChanges={false}
          />
        ))}
      </MapView>

      {stops.length === 0 && (
        <View style={[styles.avisoWrap, { top: insets.top }]} pointerEvents="none">
          <Text style={styles.aviso}>Acercate mas para ver las paradas</Text>
        </View>
      )}

      {selected && (
        // El padding de abajo respeta la barra de gestos del movil
        <View style={[styles.panel, { paddingBottom: 18 + insets.bottom }]}>
          <View style={styles.panelCabecera}>
            <View style={styles.panelTitulos}>
              <Text style={styles.panelNombre} numberOfLines={2}>{selected.name}</Text>
              <Text style={styles.panelTipo}>
                {selected.cod_mode === 8 ? 'Interurbano' : 'Urbano'} · {selected.cod_mode}_{selected.cod_estacion}
              </Text>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={12}>
              <Text style={styles.cerrar}>✕</Text>
            </Pressable>
          </View>

          {cargandoLlegadas ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color="#1e88e5" />
          ) : arrivals.length === 0 ? (
            <Text style={styles.sinDatos}>No hay proximos buses ahora mismo</Text>
          ) : (
            <ScrollView style={{ maxHeight: 260 }}>
              {arrivals.map((a, i) => (
                <View key={`${a.line}-${i}`} style={styles.llegada}>
                  <View style={styles.linea}>
                    <Text style={styles.lineaTexto}>{a.line}</Text>
                  </View>
                  <Text style={styles.destino} numberOfLines={1}>{a.destination || '—'}</Text>
                  <Text style={styles.minutos}>
                    {a.minutes === 0 ? 'Llegando' : `${a.minutes} min`}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cargando: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  cargandoTexto: { color: '#666' },

  avisoWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  aviso: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 13,
  },

  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  panelCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  panelTitulos: { flex: 1 },
  panelNombre: { fontSize: 18, fontWeight: '700', color: '#111' },
  panelTipo: { fontSize: 12, color: '#888', marginTop: 2 },
  cerrar: { fontSize: 20, color: '#888', paddingHorizontal: 4 },

  sinDatos: { color: '#888', paddingVertical: 20, textAlign: 'center' },

  llegada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  linea: {
    minWidth: 46,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1e88e5',
    alignItems: 'center',
  },
  lineaTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
  destino: { flex: 1, color: '#444', fontSize: 14 },
  minutos: { fontWeight: '700', color: '#111', fontSize: 15 },
});
