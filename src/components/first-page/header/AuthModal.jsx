import { useState } from "react";
import { supabase, setRememberSession } from "../../../supabaseClient.js";
import { useNavigate } from "react-router-dom";
import "./AuthModal.css";

export default function AuthModal({ isOpen, onClose }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isForgotPassword) {
        const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (resetError) {
          setError(resetError.message);
        } else {
          setSuccess(true);
        }
      } else if (isLogin) {
        // Configurar persistencia según "Recordarme"
        setRememberSession(rememberMe);
        // Inicio de sesión
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else {
          // Cerrar cualquier otra sesion activa de esta cuenta
          await supabase.auth.signOut({ scope: 'others' });
          handleClose();
          navigate("/mapa");
        }
      } else {
        // Registro
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccess(true);
        }
      }
    } catch (err) {
      setError("Ha ocurrido un error inesperado. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess(false);
    setIsLogin(true);
    setIsForgotPassword(false);
    onClose();
  };

  return (
    <div className="auth-overlay" onClick={handleClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={handleClose} aria-label="Cerrar">
          &times;
        </button>

        {success ? (
          <div className="auth-success">
            <div className="auth-success-icon">✓</div>
            <h2>{isForgotPassword ? "Correo enviado" : "¡Registro exitoso!"}</h2>
            <p>
              {isForgotPassword
                ? "Si existe una cuenta con ese correo, te hemos enviado un enlace para restablecer tu contraseña."
                : "Revisa tu correo electrónico para confirmar tu cuenta."}
            </p>
            <button className="auth-btn" onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false);
                setIsLogin(true);
                setSuccess(false);
              } else {
                setIsLogin(true);
              }
            }}>
              Ir a Iniciar Sesión
            </button>
          </div>
        ) : (
          <>
            <div className="auth-header">
              <h2>
                {isForgotPassword
                  ? "Recuperar contraseña"
                  : isLogin ? "Iniciar sesión" : "Crear cuenta"}
              </h2>
              <p>
                {isForgotPassword
                  ? "Ingresa tu email para restablecerla"
                  : isLogin
                    ? "¡Qué bueno verte de nuevo!"
                    : "Únete a la comunidad Quick Arrival"}
              </p>
            </div>

            {!isForgotPassword && (
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${isLogin ? "active" : ""}`}
                  onClick={() => setIsLogin(true)}
                >
                  Ingresar
                </button>
                <button
                  className={`auth-tab ${!isLogin ? "active" : ""}`}
                  onClick={() => setIsLogin(false)}
                >
                  Registrarse
                </button>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              {!isLogin && !isForgotPassword && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Nombre de usuario</label>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Tu nombre en la app"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">Correo Email</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {!isForgotPassword && (
                <div className="auth-field">
                  <label htmlFor="auth-password">Contraseña</label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder={isLogin ? "Tu contraseña" : "Mínimo 6 caracteres"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
              )}

              {isLogin && !isForgotPassword && (
                <div className="auth-options">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Recordarme</span>
                  </label>
                  <a href="#" className="auth-forgot" onClick={(e) => {
                    e.preventDefault();
                    setIsForgotPassword(true);
                  }}>
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
              )}

              {error && <p className="auth-error">{error}</p>}

              <button className="auth-btn" type="submit" disabled={loading}>
                {loading
                  ? (isForgotPassword ? "Enviando..." : isLogin ? "Entrando..." : "Registrando...")
                  : (isForgotPassword ? "Enviar enlace" : isLogin ? "Iniciar sesión" : "Registrarse")}
              </button>

              {isForgotPassword && (
                <button
                  type="button"
                  className="auth-btn"
                  style={{ background: "#f5f5f5", color: "#333", marginTop: "0" }}
                  onClick={() => setIsForgotPassword(false)}
                >
                  Volver al login
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
