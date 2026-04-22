import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import {
  TbArmchair, TbClock, TbUsers, TbVolume, TbTemperature,
  TbSteeringWheel, TbWheelchair, TbThumbUp, TbThumbDown,
  TbChevronDown, TbChevronUp,
} from 'react-icons/tb';
import './ReportsPanel.css';

const TYPE_META = {
  seats:         { Icon: TbArmchair,      label: 'Asientos' },
  punctuality:   { Icon: TbClock,         label: 'Puntualidad' },
  crowding:      { Icon: TbUsers,         label: 'Ocupación' },
  noise:         { Icon: TbVolume,        label: 'Ruido' },
  temperature:   { Icon: TbTemperature,   label: 'Temperatura' },
  driver:        { Icon: TbSteeringWheel, label: 'Conducción' },
  accessibility: { Icon: TbWheelchair,    label: 'Accesibilidad' },
};

const OPTION_LABELS = {
  many: 'Muchos asientos', some: 'Algunos asientos', few: 'Pocos asientos', none: 'Sin asientos',
  early: 'Adelantado', on_time: 'A tiempo', slightly_late: 'Algo tarde', very_late: 'Muy tarde',
  empty: 'Vacío', normal: 'Normal', full: 'Lleno', overcrowded: 'Abarrotado',
  quiet: 'Silencioso', noisy: 'Ruidoso',
  cold: 'Frío', ok: 'Agradable', hot: 'Calor',
  great: 'Conducción suave', bad: 'Conducción brusca',
  ramp_ok: 'Rampa OK', ramp_broken: 'Rampa rota',
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  return `hace ${Math.floor(diff / 3600)} h`;
}

// Agrupa reportes por tipo y calcula la opción más votada en cada grupo
function groupByType(reports) {
  const map = {};
  for (const rep of reports) {
    if (!map[rep.type]) map[rep.type] = [];
    map[rep.type].push(rep);
  }
  return Object.entries(map).map(([type, reps]) => {
    // La opción más frecuente como resumen del grupo
    const freq = {};
    reps.forEach(r => { const v = r.metadata?.value; if (v) freq[v] = (freq[v] || 0) + 1; });
    const topOption = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { type, reps, topOption };
  });
}

export default function ReportsPanel({ lineName, busId, isDarkMode, onBus }) {
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [userVotes, setUserVotes] = useState({});
  const [voting, setVoting]       = useState(null);
  const [voteError, setVoteError] = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/reports?lineName=${encodeURIComponent(lineName)}`;
      if (busId) url += `&busId=${encodeURIComponent(busId)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error();
      const { reports } = await r.json();
      setReports(reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [lineName, busId]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleVote = async (reportId, voteType) => {
    if (!onBus) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || userVotes[reportId] === voteType) return;

    setVoting(reportId);
    try {
      const r = await fetch('/api/report-votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId, voteType }),
      });
      if (!r.ok) throw new Error();
      const { up, down } = await r.json();
      setUserVotes(v => ({ ...v, [reportId]: voteType }));
      setReports(prev => prev.map(rep =>
        rep.id === reportId ? { ...rep, votes: { up, down } } : rep
      ));
    } catch {
      setVoteError('No se pudo guardar el voto. Inténtalo de nuevo.');
      setTimeout(() => setVoteError(null), 3000);
    } finally {
      setVoting(null);
    }
  };

  const groups = !loading && reports.length > 0 ? groupByType(reports) : [];
  const count  = groups.length;

  return (
    <div className={`reports-panel ${isDarkMode ? 'dark' : ''}`}>
      <button
        className="reports-panel-toggle"
        onClick={() => setCollapsed(v => !v)}
      >
        <span className="reports-panel-title">
          Reportes · Línea {lineName}
          {!loading && count > 0 && (
            <span className="reports-panel-badge">{count}</span>
          )}
        </span>
        {collapsed ? <TbChevronDown size={15} /> : <TbChevronUp size={15} />}
      </button>

      {!collapsed && (
        <>
          {loading && <p className="reports-empty">Cargando reportes…</p>}
          {!loading && count === 0 && (
            <p className="reports-empty">Sin reportes recientes para esta línea</p>
          )}
          {voteError && <p className="reports-vote-error">{voteError}</p>}
          {!loading && count > 0 && (
      <div className="reports-list">
        {groups.map(({ type, reps, topOption }) => {
          const meta = TYPE_META[type] || { Icon: TbVolume, label: type };
          const { Icon } = meta;
          const isOpen = expanded === type;
          const totalVotesUp = reps.reduce((s, r) => s + (r.votes?.up || 0), 0);

          return (
            <div key={type} className="report-group">
              {/* Fila resumen — clickable */}
              <button
                className="report-group-header"
                onClick={() => setExpanded(isOpen ? null : type)}
              >
                <Icon size={18} className="report-group-icon" />
                <div className="report-group-summary">
                  <span className="report-group-label">{meta.label}</span>
                  <span className="report-group-top">
                    {OPTION_LABELS[topOption] || topOption || '—'}
                    {reps.length > 1 && (
                      <span className="report-group-count">{reps.length} reportes</span>
                    )}
                  </span>
                </div>
                <div className="report-group-right">
                  {totalVotesUp > 0 && (
                    <span className="report-group-upvotes">
                      <TbThumbUp size={12} /> {totalVotesUp}
                    </span>
                  )}
                  {isOpen ? <TbChevronUp size={16} /> : <TbChevronDown size={16} />}
                </div>
              </button>

              {/* Reportes individuales expandidos */}
              {isOpen && (
                <div className="report-group-detail">
                  {reps.map(rep => {
                    const myVote  = userVotes[rep.id];
                    const isVoting = voting === rep.id;
                    return (
                      <div key={rep.id} className="report-detail-card">
                        <div className="report-detail-top">
                          <span className="report-detail-time">{timeAgo(rep.created_at)}</span>
                        </div>
                        {rep.description
                          ? <p className="report-detail-desc">{rep.description}</p>
                          : <p className="report-detail-desc muted">Sin comentario</p>
                        }
                        <div className="report-detail-votes">
                          <button
                            className={`vote-btn up ${myVote === 'up' ? 'active' : ''} ${!onBus ? 'locked' : ''}`}
                            onClick={() => handleVote(rep.id, 'up')}
                            disabled={isVoting || !onBus}
                            title={onBus ? 'Confirmo' : 'Activa "Voy en este bus" para votar'}
                          >
                            <TbThumbUp size={12} /> {rep.votes.up}
                          </button>
                          <button
                            className={`vote-btn down ${myVote === 'down' ? 'active' : ''} ${!onBus ? 'locked' : ''}`}
                            onClick={() => handleVote(rep.id, 'down')}
                            disabled={isVoting || !onBus}
                            title={onBus ? 'No aplica' : 'Activa "Voy en este bus" para votar'}
                          >
                            <TbThumbDown size={12} /> {rep.votes.down}
                          </button>
                        </div>
                        {!onBus && (
                          <p className="vote-locked-hint">Activa "Voy en este bus" para votar</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
