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
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
      // Cuando el usuario confirma el email o inicia sesión de alguna forma global
      if (event === 'SIGNED_IN') {
        navigate('/mapa');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
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
