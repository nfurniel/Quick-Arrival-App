import { useState, useEffect, useRef } from "react";
import { supabase, setRememberSession } from "../../../supabaseClient.js";
import { useNavigate } from "react-router-dom";
import "./AuthModal.css";

const RATE_LIMIT_KEY = 'auth_rate_limit';
const MAX_ATTEMPTS = 4;
const BLOCK_DURATION_MS = 2 * 60 * 1000;

function getRateLimit() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { count: 0, blockedUntil: 0 };
    return JSON.parse(raw);
  } catch {
    return { count: 0, blockedUntil: 0 };
  }
}

function saveRateLimit(state) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
}

function clearRateLimit() {
  localStorage.removeItem(RATE_LIMIT_KEY);
}

export default function AuthModal({ isOpen, onClose }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const navigate = useNavigate();
  const firstFieldRef = useRef(null);

  useEffect(() => {
    const state = getRateLimit();
    if (state.blockedUntil > Date.now()) {
      setBlockedUntil(state.blockedUntil);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 250);
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, isLogin, isForgotPassword]);

  useEffect(() => {
    if (blockedUntil <= 0) return;
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      if (currentNow >= blockedUntil) {
        setBlockedUntil(0);
        clearRateLimit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [blockedUntil]);

  const remainingSeconds = blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
  const isBlocked = remainingSeconds > 0;

  const registerFailedAttempt = () => {
    const state = getRateLimit();
    const newCount = state.count + 1;
    if (newCount >= MAX_ATTEMPTS) {
      const until = Date.now() + BLOCK_DURATION_MS;
      saveRateLimit({ count: newCount, blockedUntil: until });
      setBlockedUntil(until);
    } else {
      saveRateLimit({ count: newCount, blockedUntil: 0 });
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isForgotPassword && isBlocked) {
      return;
    }

    setLoading(true);

    try {
      if (isForgotPassword) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (resetError) {
          setError(resetError.message);
        } else {
          setSuccess(true);
        }
      } else if (isLogin) {
        setRememberSession(rememberMe);
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          registerFailedAttempt();
          setError(signInError.message);
        } else {
          clearRateLimit();
          setBlockedUntil(0);
          await supabase.auth.signOut({ scope: 'others' });
          handleClose();
          navigate("/mapa");
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (signUpError) {
          registerFailedAttempt();
          setError(signUpError.message);
        } else {
          clearRateLimit();
          setBlockedUntil(0);
          setSuccess(true);
        }
      }
    } catch {
      if (!isForgotPassword) {
        registerFailedAttempt();
      }
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
    setShowPassword(false);
    setIsLogin(true);
    setIsForgotPassword(false);
    onClose();
  };

  const switchToLogin = () => {
    setIsLogin(true);
    setError("");
  };
  const switchToRegister = () => {
    setIsLogin(false);
    setError("");
  };

  return (
    <div className="qa-auth-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="qa-auth-modal" onClick={(e) => e.stopPropagation()}>

        {/* Panel decorativo lateral con identidad de la app */}
        <aside className="qa-auth-aside" aria-hidden="true">
          <div className="qa-auth-aside-grain" />
          <div className="qa-auth-aside-inner">
            <div className="qa-auth-brand">
              <span className="qa-auth-brand-dot" />
              <span className="qa-auth-brand-name">Quick Arrival</span>
            </div>

            <div className="qa-auth-tagline">
              <h3>Madrid<br/>en tiempo<br/>real.</h3>
              <p>EMT + CRTM, un único mapa. Llegadas al segundo.</p>
            </div>

            {/* Ruta SVG decorativa: simula un trayecto con paradas */}
            <svg className="qa-auth-route" viewBox="0 0 220 320" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M30 20 Q 120 60 80 140 T 180 280"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="2"
                strokeDasharray="4 6"
                strokeLinecap="round"
              />
              <circle cx="30" cy="20" r="6" fill="#fff" />
              <circle cx="30" cy="20" r="11" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <circle cx="95" cy="95" r="4" fill="rgba(255,255,255,0.85)" />
              <circle cx="80" cy="170" r="4" fill="rgba(255,255,255,0.85)" />
              <circle cx="130" cy="220" r="4" fill="rgba(255,255,255,0.85)" />
              <circle cx="180" cy="280" r="6" fill="#fff" />
              <circle cx="180" cy="280" r="11" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            </svg>

            <div className="qa-auth-aside-footer">
              <span>TFC · 2º DAW</span>
            </div>
          </div>
        </aside>

        {/* Panel del formulario */}
        <div className="qa-auth-content">
          <button className="qa-auth-close" onClick={handleClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {success ? (
            <div className="qa-auth-success">
              <div className="qa-auth-success-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <h2>{isForgotPassword ? "Correo enviado" : "¡Bienvenido a bordo!"}</h2>
              <p>
                {isForgotPassword
                  ? "Si existe una cuenta con ese correo, te hemos enviado un enlace para restablecer tu contraseña."
                  : "Revisa tu correo electrónico para confirmar tu cuenta y empezar a moverte por Madrid."}
              </p>
              <button className="qa-auth-btn qa-auth-btn-primary" onClick={() => {
                if (isForgotPassword) {
                  setIsForgotPassword(false);
                  setIsLogin(true);
                  setSuccess(false);
                } else {
                  setSuccess(false);
                  setIsLogin(true);
                }
              }}>
                Ir a iniciar sesión
              </button>
            </div>
          ) : (
            <>
              <header className="qa-auth-header">
                <span className="qa-auth-eyebrow">
                  {isForgotPassword ? "Recuperación" : isLogin ? "Acceso" : "Nueva cuenta"}
                </span>
                <h2>
                  {isForgotPassword
                    ? "Recupera tu acceso"
                    : isLogin ? "Bienvenido de vuelta" : "Únete al viaje"}
                </h2>
                <p>
                  {isForgotPassword
                    ? "Introduce tu email y te enviaremos un enlace seguro."
                    : isLogin
                      ? "Inicia sesión para continuar donde lo dejaste."
                      : "Crea tu cuenta y desbloquea favoritos, reportes y más."}
                </p>
              </header>

              {!isForgotPassword && (
                <div className="qa-auth-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={isLogin}
                    className={`qa-auth-tab ${isLogin ? "is-active" : ""}`}
                    onClick={switchToLogin}
                  >
                    Iniciar sesión
                  </button>
                  <button
                    role="tab"
                    aria-selected={!isLogin}
                    className={`qa-auth-tab ${!isLogin ? "is-active" : ""}`}
                    onClick={switchToRegister}
                  >
                    Registrarse
                  </button>
                  <span
                    className="qa-auth-tab-indicator"
                    data-position={isLogin ? "left" : "right"}
                  />
                </div>
              )}

              <form className="qa-auth-form" onSubmit={handleSubmit} noValidate>
                {!isLogin && !isForgotPassword && (
                  <div className={`qa-auth-field ${name ? "has-value" : ""}`}>
                    <input
                      ref={isLogin ? null : firstFieldRef}
                      id="qa-auth-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder=" "
                    />
                    <label htmlFor="qa-auth-name">Nombre de usuario</label>
                    <span className="qa-auth-field-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
                      </svg>
                    </span>
                  </div>
                )}

                <div className={`qa-auth-field ${email ? "has-value" : ""}`}>
                  <input
                    ref={isLogin || isForgotPassword ? firstFieldRef : null}
                    id="qa-auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder=" "
                  />
                  <label htmlFor="qa-auth-email">Correo electrónico</label>
                  <span className="qa-auth-field-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 7l9 6 9-6" />
                    </svg>
                  </span>
                </div>

                {!isForgotPassword && (
                  <div className={`qa-auth-field ${password ? "has-value" : ""}`}>
                    <input
                      id="qa-auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                      placeholder=" "
                    />
                    <label htmlFor="qa-auth-password">Contraseña</label>
                    <button
                      type="button"
                      className="qa-auth-field-action"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3l18 18" />
                          <path d="M10.5 6.6A10 10 0 0121 12c-.8 1.4-1.9 2.7-3.2 3.7M6.6 6.6C4.7 7.9 3.3 9.8 3 12c1.5 2.7 4.5 5 9 5 1.6 0 3-.3 4.3-.9" />
                          <path d="M9.5 9.5a3 3 0 004.2 4.2" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}

                {isLogin && !isForgotPassword && (
                  <div className="qa-auth-options">
                    <label className="qa-auth-remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span className="qa-auth-checkbox" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                      <span>Recordarme</span>
                    </label>
                    <button
                      type="button"
                      className="qa-auth-forgot"
                      onClick={() => setIsForgotPassword(true)}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                {(error || (isBlocked && !isForgotPassword)) && (
                  <p className="qa-auth-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <span>
                      {isBlocked && !isForgotPassword
                        ? `Demasiados intentos. Espera ${remainingSeconds}s para volver a intentarlo.`
                        : error}
                    </span>
                  </p>
                )}

                <button
                  className="qa-auth-btn qa-auth-btn-primary"
                  type="submit"
                  disabled={loading || (isBlocked && !isForgotPassword)}
                >
                  {loading ? (
                    <span className="qa-auth-spinner" aria-hidden="true" />
                  ) : null}
                  <span>
                    {loading
                      ? (isForgotPassword ? "Enviando..." : isLogin ? "Entrando..." : "Creando cuenta...")
                      : (isForgotPassword ? "Enviar enlace" : isLogin ? "Iniciar sesión" : "Crear cuenta")}
                  </span>
                  {!loading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>

                {isForgotPassword && (
                  <button
                    type="button"
                    className="qa-auth-btn qa-auth-btn-ghost"
                    onClick={() => { setIsForgotPassword(false); setError(""); }}
                  >
                    ← Volver al login
                  </button>
                )}

                {!isForgotPassword && (
                  <p className="qa-auth-legal">
                    Al continuar aceptas nuestros términos y la política de privacidad.
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
