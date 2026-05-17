import { useState, useEffect } from 'react';
import { TbX, TbBus, TbInfoCircle, TbAlertTriangle, TbAlertOctagon } from 'react-icons/tb';
import './AnnouncementPopup.css';

const STORAGE_KEY = 'seen_announcements';

const TYPE_META = {
  info: { label: 'Aviso', Icon: TbInfoCircle },
  warning: { label: 'Aviso importante', Icon: TbAlertTriangle },
  danger: { label: 'Aviso urgente', Icon: TbAlertOctagon },
};

function loadSeen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveSeen(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function AnnouncementPopup({ isDarkMode = false }) {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/announcements')
      .then(r => r.ok ? r.json() : { announcements: [] })
      .then(data => {
        if (cancelled) return;
        const seen = loadSeen();
        const pendientes = (data.announcements || []).filter(a => !seen.includes(a.id));
        if (pendientes.length > 0) {
          setQueue(pendientes);
          setCurrent(pendientes[0]);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  function cerrar() {
    if (!current || closing) return;
    setClosing(true);
    const idActual = current.id;

    // Damos tiempo a que termine la animación antes de pasar al siguiente
    setTimeout(() => {
      const seen = loadSeen();
      if (!seen.includes(idActual)) saveSeen([...seen, idActual]);
      const resto = queue.slice(1);
      setQueue(resto);
      setCurrent(resto[0] || null);
      setClosing(false);
    }, 180);
  }

  if (!current) return null;

  const meta = TYPE_META[current.type] || TYPE_META.info;
  const { Icon } = meta;
  const total = queue.length;
  const idx = total > 1 ? (total - queue.length + 1) : 0;

  return (
    <div
      className={`ann-overlay ${closing ? 'ann-closing' : ''} ${isDarkMode ? 'dark' : ''}`}
      onClick={cerrar}
      role="presentation"
    >
      <div
        className={`ann-card ann-card-${current.type}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="ann-title"
        aria-describedby="ann-body"
      >
        <button className="ann-close-btn" onClick={cerrar} aria-label="Cerrar aviso">
          <TbX size={18} />
        </button>

        <div className="ann-ribbon">
          <span className="ann-ribbon-icon"><Icon size={16} /></span>
          <span className="ann-ribbon-text">{meta.label}</span>
          {total > 1 && <span className="ann-ribbon-counter">{idx}/{total}</span>}
        </div>

        <div className="ann-content">
          <h3 id="ann-title" className="ann-title">{current.title}</h3>
          <p id="ann-body" className="ann-body">{current.body}</p>
        </div>

        <div className="ann-footer">
          <div className="ann-brand">
            <TbBus size={14} aria-hidden="true" />
            <span>Quick Arrival · {formatFecha(current.created_at)}</span>
          </div>
          <button className="ann-action" onClick={cerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
