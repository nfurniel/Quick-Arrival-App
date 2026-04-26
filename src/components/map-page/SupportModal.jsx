import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import './SupportModal.css';

const TIPOS = [
  { value: 'bug',       label: 'Error en la app' },
  { value: 'datos',     label: 'Datos incorrectos (parada, línea...)' },
  { value: 'sugerencia',label: 'Sugerencia de mejora' },
  { value: 'cuenta',    label: 'Problema con mi cuenta' },
  { value: 'otro',      label: 'Otro' },
];

export default function SupportModal({ isOpen, onClose }) {
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setType('');
    setDescription('');
    setError('');
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!type) return setError('Selecciona un tipo de incidencia');

    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="support-overlay" onClick={handleClose}>
      <div className="support-modal" onClick={e => e.stopPropagation()}>
        <button className="support-close" onClick={handleClose}>✕</button>

        {success ? (
          <div className="support-success">
            <p>Ticket enviado. Gracias por contactar con soporte.</p>
            <button className="support-btn" onClick={handleClose}>Cerrar</button>
          </div>
        ) : (
          <>
            <h2 className="support-title">Contactar con soporte</h2>

            <form className="support-form" onSubmit={handleSubmit}>
              <label className="support-label">Tipo de incidencia</label>
              <select
                className="support-select"
                value={type}
                onChange={e => setType(e.target.value)}
                required
              >
                <option value="">Selecciona...</option>
                {TIPOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <label className="support-label">Descripción <span className="support-optional">(opcional)</span></label>
              <textarea
                className="support-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Describe el problema con el mayor detalle posible..."
              />
              <span className="support-counter">{description.length}/500</span>

              {error && <p className="support-error">{error}</p>}

              <button className="support-btn" type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
