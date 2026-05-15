import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../../supabaseClient';

const TYPE_LABELS = {
  seats: 'Asientos',
  punctuality: 'Puntualidad',
  crowding: 'Ocupación',
  noise: 'Ruido',
  temperature: 'Temperatura',
  driver: 'Conducción',
  accessibility: 'Accesibilidad',
};

const OPTION_LABELS = {
  many: 'muchos libres', some: 'algunos libres', few: 'pocos libres', none: 'ninguno libre',
  early: 'adelantado', on_time: 'puntual', slightly_late: 'algo tarde', very_late: 'muy tarde',
  empty: 'vacío', normal: 'normal', full: 'lleno', overcrowded: 'saturado',
  quiet: 'silencioso', noisy: 'ruidoso',
  cold: 'frío', ok: 'ok', hot: 'calor',
  great: 'excelente', bad: 'mala',
  ramp_ok: 'rampa OK', ramp_broken: 'rampa rota',
};

const MOTIVOS_PREDEFINIDOS = [
  'Hemos detectado que este reporte parece ser falso o no se ajusta a la realidad observada en la línea.',
  'Tu reporte contiene lenguaje inapropiado. Por favor, mantén un tono respetuoso.',
  'Hemos recibido varios reportes contradictorios al tuyo y vamos a eliminarlo por seguridad.',
];

export default function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [warnOpen, setWarnOpen] = useState(null);
  const [warnText, setWarnText] = useState('');
  const [warnDeleteAfter, setWarnDeleteAfter] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('No autenticado'); setLoading(false); return; }

    const res = await fetch('/api/reports?admin=1', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) { setError('No tienes permisos de administrador'); setLoading(false); return; }
    if (!res.ok) { setError('Error al cargar los reportes'); setLoading(false); return; }
    const data = await res.json();
    setReports(data.reports || []);
    setLoading(false);
  }

  async function handleDelete(reportId) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/reports', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    });
    if (res.ok) {
      setReports(prev => prev.filter(r => r.id !== reportId));
    }
    setConfirmingDelete(null);
  }

  function abrirAdvertencia(reportId) {
    setWarnOpen(warnOpen === reportId ? null : reportId);
    setWarnText('');
    setWarnDeleteAfter(true);
    setSendError('');
  }

  async function handleWarn(reportId) {
    if (!warnText.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'warn', reportId, motivo: warnText, deleteAfter: warnDeleteAfter }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSendError(data.error || 'Error enviando el aviso'); setSending(false); return; }
      if (data.deleted) {
        setReports(prev => prev.filter(r => r.id !== reportId));
      }
      setWarnOpen(null);
      setWarnText('');
    } catch {
      setSendError('Error de conexión');
    }
    setSending(false);
  }

  if (loading) return <p>Cargando...</p>;
  if (error) return <p className="admin-error">{error}</p>;

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">
        Reportes de usuarios <span className="admin-count">({reports.length})</span>
      </h2>

      {reports.length === 0 ? (
        <p className="admin-empty">No hay reportes todavía.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Línea</th>
                <th>Tipo</th>
                <th>Mensaje</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const tipo = TYPE_LABELS[r.type] || r.type;
                const opcion = OPTION_LABELS[r.metadata?.value] || r.metadata?.value;
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td data-label="Fecha" className="admin-date">
                        {new Date(r.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </td>
                      <td data-label="Usuario">
                        <span className="admin-user">
                          {r.username || <span className="admin-empty-cell">(sin nombre)</span>}
                        </span>
                      </td>
                      <td data-label="Línea"><b>{r.line_name}</b></td>
                      <td data-label="Tipo">
                        <span className="admin-badge">{tipo}</span>
                        {opcion && <span className="admin-option-value"> · {opcion}</span>}
                      </td>
                      <td data-label="Mensaje" className="admin-desc">
                        {r.description || <span className="admin-empty-cell">—</span>}
                      </td>
                      <td className="admin-actions-cell">
                        <button
                          className="admin-action-btn admin-action-warn"
                          onClick={() => abrirAdvertencia(r.id)}
                        >
                          {warnOpen === r.id ? 'Cerrar' : 'Advertir'}
                        </button>
                        {confirmingDelete === r.id ? (
                          <span className="admin-confirm-inline">
                            <span className="admin-confirm-text">¿Eliminar?</span>
                            <button className="admin-confirm-yes" onClick={() => handleDelete(r.id)}>Sí</button>
                            <button className="admin-confirm-no" onClick={() => setConfirmingDelete(null)}>No</button>
                          </span>
                        ) : (
                          <button className="admin-action-btn admin-action-delete" onClick={() => setConfirmingDelete(r.id)}>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>

                    {warnOpen === r.id && (
                      <tr className="admin-reply-row">
                        <td colSpan={6}>
                          <div className="admin-reply-form">
                            <div className="admin-warn-presets">
                              {MOTIVOS_PREDEFINIDOS.map((m, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className="admin-warn-preset-btn"
                                  onClick={() => setWarnText(m)}
                                >
                                  Plantilla {i + 1}
                                </button>
                              ))}
                            </div>
                            <textarea
                              className="admin-reply-textarea"
                              placeholder="Motivo de la advertencia (se enviará por email al usuario)..."
                              value={warnText}
                              onChange={(e) => setWarnText(e.target.value)}
                              rows={3}
                              maxLength={500}
                            />
                            <label className="admin-warn-checkbox">
                              <input
                                type="checkbox"
                                checked={warnDeleteAfter}
                                onChange={(e) => setWarnDeleteAfter(e.target.checked)}
                              />
                              Eliminar el reporte después de enviar el aviso
                            </label>
                            {sendError && <p className="admin-send-error">{sendError}</p>}
                            <div className="admin-reply-actions">
                              <button
                                className="admin-reply-send"
                                onClick={() => handleWarn(r.id)}
                                disabled={sending || !warnText.trim()}
                              >
                                {sending ? 'Enviando...' : 'Enviar aviso por email'}
                              </button>
                              <button
                                className="admin-reply-cancel"
                                onClick={() => setWarnOpen(null)}
                                disabled={sending}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
