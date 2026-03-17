import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import "./AuthModal.css"; // Reusing the same styles for consistency

export default function ResetPasswordModal({ isOpen, onClose }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError("Ha ocurrido un error inesperado al actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
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
            <h2>¡Contraseña actualizada!</h2>
            <p>
              Tu contraseña se ha cambiado correctamente. Ahora puedes iniciar sesión con tu nueva contraseña.
            </p>
            <button className="auth-btn" onClick={handleClose}>
              Cerrar y continuar
            </button>
          </div>
        ) : (
          <>
            <div className="auth-header">
              <h2>Nueva contraseña</h2>
              <p>Por favor, introduce tu nueva contraseña.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="reset-password">Nueva contraseña</label>
                <input
                  id="reset-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reset-confirm-password">Confirmar contraseña</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  placeholder="Repite tu nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? "Actualizando..." : "Actualizar contraseña"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
