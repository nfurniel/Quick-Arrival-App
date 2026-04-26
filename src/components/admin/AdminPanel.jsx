import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import './AdminPanel.css';

const TYPE_LABELS = {
  bug:        'Error en la app',
  datos:      'Datos incorrectos',
  sugerencia: 'Sugerencia',
  cuenta:     'Problema con cuenta',
  otro:       'Otro',
};

const STATUS_LABELS = {
  pending:   'Pendiente',
  reviewed:  'Revisado',
  dismissed: 'Descartado',
};

export default function AdminPanel() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('No autenticado'); setLoading(false); return; }

      const res = await fetch('/api/support', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) { setError('No tienes permisos de administrador'); setLoading(false); return; }
      if (!res.ok) { setError('Error al cargar los tickets'); setLoading(false); return; }

      const data = await res.json();
      setTickets(data.tickets || []);
      setLoading(false);
    }
    cargar();
  }, []);

  if (loading) return <div className="admin-panel"><p>Cargando...</p></div>;
  if (error) return <div className="admin-panel"><p className="admin-error">{error}</p></div>;

  return (
    <div className="admin-panel">
      <h1 className="admin-title">Panel de administración</h1>

      <section className="admin-section">
        <h2 className="admin-section-title">
          Tickets de soporte <span className="admin-count">({tickets.length})</span>
        </h2>

        {tickets.length === 0 ? (
          <p className="admin-empty">No hay tickets todavía.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td className="admin-date">
                      {new Date(t.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </td>
                    <td><span className="admin-badge">{TYPE_LABELS[t.type] || t.type}</span></td>
                    <td className="admin-desc">{t.description || <span className="admin-empty-cell">—</span>}</td>
                    <td>
                      <span className={`admin-status admin-status-${t.status}`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
