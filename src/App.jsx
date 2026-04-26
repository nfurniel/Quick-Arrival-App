import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import FirstPage from "./components/first-page/FirstPage.jsx"
import ResetPasswordModal from "./components/first-page/header/ResetPasswordModal.jsx"
import MapPage from "./components/map-page/MapPage.jsx"
import AdminPanel from "./components/admin/AdminPanel.jsx"
import { supabase, isPasswordRecovery } from "./supabaseClient.js"
import './app.css'

function App() {
  const [showResetPassword, setShowResetPassword] = useState(false);
  const navigate = useNavigate();
  const recoveryMode = useRef(isPasswordRecovery);

  useEffect(() => {
    // Si el usuario recargó la página durante un reset pendiente, restauramos el modal
    if (sessionStorage.getItem('pendingPasswordReset')) {
      recoveryMode.current = true;
      setShowResetPassword(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.pathname === '/' && !recoveryMode.current) {
        navigate('/mapa');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.current = true;
        sessionStorage.setItem('pendingPasswordReset', 'true');
        setShowResetPassword(true);
        navigate('/');
      } else if (event === 'SIGNED_IN' && !recoveryMode.current) {
        navigate('/mapa');
      } else if (event === 'SIGNED_OUT') {
        recoveryMode.current = false;
        sessionStorage.removeItem('pendingPasswordReset');
        navigate('/');
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [navigate]);

  const handleResetSuccess = () => {
    recoveryMode.current = false;
    sessionStorage.removeItem('pendingPasswordReset');
    setShowResetPassword(false);
    navigate('/mapa');
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<FirstPage />} />
        <Route path="/mapa" element={<MapPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
      <ResetPasswordModal
        isOpen={showResetPassword}
        onClose={() => setShowResetPassword(false)}
        onSuccess={handleResetSuccess}
      />
    </>
  )
}

export default App
