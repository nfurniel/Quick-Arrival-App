import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tumoqeuueqbvfstdhdmn.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bW9xZXV1ZXFidmZzdGRoZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTcwMTIsImV4cCI6MjA4NTk3MzAxMn0.3WtuEz7LwxyYq9V4EIZm7DXFuQlb_4z-J5y5QYyD6zA';

// Aqui no hay localStorage ni sessionStorage, la sesion se guarda con AsyncStorage.
// detectSessionInUrl va en false porque en el movil no hay URL con hash que mirar,
// asi que todo el lio del recovery de la web aqui no aplica.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
