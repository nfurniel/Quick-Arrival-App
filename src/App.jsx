import { useState, useEffect } from 'react';
import FirstPage from "./components/first-page/FirstPage.jsx"
import ResetPasswordModal from "./components/first-page/header/ResetPasswordModal.jsx"
import { supabase } from "./supabaseClient.js"
import './app.css'

function App() {
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    // Escuchar cambios de estado de autenticación de Supabase
    // Cuando el usuario hace clic en el enlace del correo, Supabase procesa el token
    // en la URL (hash) y si es un token de recuperación de contraseña (type=recovery), 
    // emitirá el evento 'PASSWORD_RECOVERY'.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      // Abre el modal de reset password sî el usuario viene del email de recuperación
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
    });

    // Limpieza
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <FirstPage />
      <ResetPasswordModal 
        isOpen={showResetPassword} 
        onClose={() => setShowResetPassword(false)} 
      />
    </>
  )
}

export default App
