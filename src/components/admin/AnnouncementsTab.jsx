import { useState, useEffect, Fragment } from 'react';
import { TbCalendarEvent, TbCheck, TbAlertTriangle, TbInfoCircle } from 'react-icons/tb';
import { supabase } from '../../supabaseClient';

const CAL_MSG_ICON = { ok: TbCheck, error: TbAlertTriangle, info: TbInfoCircle };

const TYPE_LABELS = {
  info: 'Información',
  warning: 'Advertencia',
  danger: 'Importante',
};

const EMPTY_FORM = { title: '', body: '', type: 'info', active: true };

export default function AnnouncementsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmingDelete, setConfirmingDelete] = useState(null);

  // Comprobación del calendario EMT (festivos / huelgas)
  const [calChecking, setCalChecking] = useState(false);
  const [calMsg, setCalMsg] = useState('');
  const [calMsgType, setCalMsgType] = useState('info'); // info | ok | error

  useEffect(() => { cargar(); }, []);

  // ¿la fecha ISO es de hoy? (para no duplicar el aviso si se pulsa dos veces)
  function esHoy(iso) {
    const d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function etiquetaDia(d) {
    if (d.dayType === 'LA') return 'día laborable';
    if (d.dayType === 'SA') return 'sábado';
    if (d.dayType === 'FE') return 'festivo en fin de semana';
    return d.dayType || 'día normal';
  }

  // Mira el calendario de la EMT y, si toca (festivo entre semana o huelga),
  // crea y publica el aviso directamente.
  async function comprobarCalendario() {
    setCalChecking(true);
    setCalMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setCalMsg('No autenticado'); setCalMsgType('error'); return; }

      const res = await fetch('/api/emt-calendar', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCalMsg(data.error || 'No se pudo consultar el calendario de la EMT.');
        setCalMsgType('error');
        return;
      }

      if (!data.shouldAnnounce) {
        setCalMsg(`Hoy (${data.date}) es ${etiquetaDia(data)}: no hace falta ningún aviso.`);
        setCalMsgType('info');
        return;
      }

      // Evitar duplicar si ya hay un aviso activo de hoy con ese título
      const yaExiste = items.some(i => i.active && i.title === data.suggestion.title && esHoy(i.created_at));
      if (yaExiste) {
        setCalMsg('Ya hay un aviso activo para hoy, no se ha duplicado.');
        setCalMsgType('info');
        return;
      }

      const crear = await fetch('/api/announcements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data.suggestion, active: true }),
      });
      const cd = await crear.json().catch(() => ({}));
      if (!crear.ok) { setCalMsg(cd.error || 'Error creando el aviso.'); setCalMsgType('error'); return; }

      setItems(prev => [cd.announcement, ...prev]);
      setCalMsg(data.reason === 'strike'
        ? 'Aviso de HUELGA creado y publicado.'
        : 'Aviso de FESTIVO creado y publicado.');
      setCalMsgType('ok');
    } catch {
      setCalMsg('Error de red consultando el calendario.');
      setCalMsgType('error');
    } finally {
      setCalChecking(false);
    }
  }

  async function cargar() {
    setLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('No autenticado'); setLoading(false); return; }
    const res = await fetch('/api/announcements?admin=1', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) { setError('No tienes permisos de administrador'); setLoading(false); return; }
    if (!res.ok) { setError('Error al cargar los anuncios'); setLoading(false); return; }
    const data = await res.json();
    setItems(data.announcements || []);
    setLoading(false);
  }

  function abrirCrear() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setFormError('');
  }

  function abrirEditar(item) {
    setEditingId(item.id);
    setForm({ title: item.title, body: item.body, type: item.type, active: item.active });
    setShowForm(true);
    setFormError('');
  }

  function cerrarForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function guardar() {
    if (!form.title.trim() || !form.body.trim()) {
      setFormError('El título y el mensaje son obligatorios');
      return;
    }
    setSaving(true);
    setFormError('');
    const { data: { session } } = await supabase.auth.getSession();

    const isEdit = !!editingId;
    const res = await fetch('/api/announcements', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { id: editingId, ...form } : form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(data.error || 'Error al guardar');
      setSaving(false);
      return;
    }
    if (isEdit) {
      setItems(prev => prev.map(i => i.id === editingId ? data.announcement : i));
    } else {
      setItems(prev => [data.announcement, ...prev]);
    }
    cerrarForm();
    setSaving(false);
  }

  async function toggleActive(item) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/announcements', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === item.id ? data.announcement : i));
    }
  }

  async function eliminar(id) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/announcements', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
    setConfirmingDelete(null);
  }

  if (loading) return <p>Cargando...</p>;
  if (error) return <p className="admin-error">{error}</p>;

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          Anuncios globales <span className="admin-count">({items.length})</span>
        </h2>
        {!showForm && (
          <div className="admin-header-actions">
            <button
              className="admin-action-secondary"
              onClick={comprobarCalendario}
              disabled={calChecking}
            >
              <TbCalendarEvent size={16} />
              {calChecking ? 'Comprobando...' : 'Comprobar calendario EMT'}
            </button>
            <button className="admin-action-btn admin-action-primary" onClick={abrirCrear}>
              + Nuevo anuncio
            </button>
          </div>
        )}
      </div>

      {calMsg && (() => {
        const CalIcon = CAL_MSG_ICON[calMsgType] || TbInfoCircle;
        return (
          <p
            className="admin-cal-msg"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              margin: '0 0 12px', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem',
              background: calMsgType === 'error' ? '#fde8e8' : calMsgType === 'ok' ? '#e6f7ec' : '#eef2f7',
              color: calMsgType === 'error' ? '#9b1c1c' : calMsgType === 'ok' ? '#1c7c3e' : '#334155',
            }}
          >
            <CalIcon size={16} style={{ flexShrink: 0 }} />
            <span>{calMsg}</span>
          </p>
        );
      })()}

      {showForm && (
        <div className="admin-form-card">
          <h3 className="admin-form-title">{editingId ? 'Editar anuncio' : 'Nuevo anuncio'}</h3>
          <div className="admin-form-grid">
            <label className="admin-form-field">
              <span>Título</span>
              <input
                type="text"
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="admin-form-field">
              <span>Mensaje</span>
              <textarea
                rows={4}
                maxLength={600}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            <div className="admin-form-row">
              <label className="admin-form-field admin-form-field-inline">
                <span>Tipo</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="info">Información (azul)</option>
                  <option value="warning">Advertencia (amarillo)</option>
                  <option value="danger">Importante (rojo)</option>
                </select>
              </label>
              <label className="admin-form-checkbox">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Activo (visible para usuarios)
              </label>
            </div>
          </div>
          {formError && <p className="admin-send-error">{formError}</p>}
          <div className="admin-reply-actions">
            <button className="admin-reply-send" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Publicar anuncio'}
            </button>
            <button className="admin-reply-cancel" onClick={cerrarForm} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="admin-empty">No hay anuncios. Crea uno con el botón "+ Nuevo anuncio".</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Título</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <Fragment key={a.id}>
                  <tr>
                    <td data-label="Fecha" className="admin-date">
                      {new Date(a.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </td>
                    <td data-label="Tipo">
                      <span className={`admin-badge admin-badge-${a.type}`}>
                        {TYPE_LABELS[a.type] || a.type}
                      </span>
                    </td>
                    <td data-label="Título"><b>{a.title}</b></td>
                    <td data-label="Mensaje" className="admin-desc">{a.body}</td>
                    <td data-label="Estado">
                      <span className={`admin-status admin-status-${a.active ? 'reviewed' : 'dismissed'}`}>
                        {a.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="admin-actions-cell">
                      <button className="admin-action-btn admin-action-reply" onClick={() => abrirEditar(a)}>
                        Editar
                      </button>
                      <button className="admin-action-btn admin-action-view" onClick={() => toggleActive(a)}>
                        {a.active ? 'Desactivar' : 'Activar'}
                      </button>
                      {confirmingDelete === a.id ? (
                        <span className="admin-confirm-inline">
                          <span className="admin-confirm-text">¿Eliminar?</span>
                          <button className="admin-confirm-yes" onClick={() => eliminar(a.id)}>Sí</button>
                          <button className="admin-confirm-no" onClick={() => setConfirmingDelete(null)}>No</button>
                        </span>
                      ) : (
                        <button className="admin-action-btn admin-action-delete" onClick={() => setConfirmingDelete(a.id)}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
