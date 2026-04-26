import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tumoqeuueqbvfstdhdmn.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bW9xZXV1ZXFidmZzdGRoZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTcwMTIsImV4cCI6MjA4NTk3MzAxMn0.3WtuEz7LwxyYq9V4EIZm7DXFuQlb_4z-J5y5QYyD6zA";

// Capturamos si hay token de recovery ANTES de que Supabase borre el hash.
// Este módulo se ejecuta sincrónicamente al importarse, así que el hash aún está presente.
export const isPasswordRecovery = window.location.hash.includes('type=recovery');

if (isPasswordRecovery) {
  // Borramos la sesión guardada directamente del storage para que Supabase
  // no haga auto-login y procese el token de recovery en su lugar.
  Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
  Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-')) sessionStorage.removeItem(k); });
}

const STORAGE_KEY_PREFIX = "sb-tumoqeuueqbvfstdhdmn-auth-token";

const customStorage = {
  getItem: (key) => {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  },
  setItem: (key, value) => {
    const useSession = sessionStorage.getItem("qa-session-only") === "true";
    if (useSession) {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const setRememberSession = (remember) => {
  if (remember) {
    sessionStorage.removeItem("qa-session-only");
  } else {
    sessionStorage.setItem("qa-session-only", "true");
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
  },
});
