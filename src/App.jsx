import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import FirstPage from "./components/first-page/FirstPage.jsx"
import ResetPasswordModal from "./components/first-page/header/ResetPasswordModal.jsx"
import MapPage from "./components/map-page/MapPage.jsx"
import { supabase } from "./supabaseClient.js"
import './app.css'

function App() {
  const [showResetPassword, setShowResetPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Al cargar la app, comprobar si ya hay una sesión activa guardada.
    // Esto cubre el caso de usuarios que vuelven con el token en localStorage.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.pathname === '/') {
        navigate('/mapa');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      } else if (event === 'SIGNED_IN') {
        navigate('/mapa');
      } else if (event === 'SIGNED_OUT') {
        navigate('/');
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<FirstPage />} />
        <Route path="/mapa" element={<MapPage />} />
      </Routes>
      <ResetPasswordModal
        isOpen={showResetPassword}
        onClose={() => setShowResetPassword(false)}
      />
    </>
  )
}

export default App
