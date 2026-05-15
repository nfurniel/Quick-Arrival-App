import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import {
  TbArmchair, TbClock, TbUsers, TbVolume, TbTemperature,
  TbSteeringWheel, TbWheelchair, TbArrowLeft, TbX, TbSend,
} from 'react-icons/tb';
import './ReportModal.css';

const REPORT_TYPES = [
  {
    id: 'seats',
    Icon: TbArmchair,
    label: 'Asientos libres',
    options: [
      { value: 'many',  label: 'Muchos', desc: 'El bus está casi vacío' },
      { value: 'some',  label: 'Algunos', desc: 'Hay donde sentarse' },
      { value: 'few',   label: 'Pocos', desc: 'Queda alguno suelto' },
      { value: 'none',  label: 'Ninguno', desc: 'Todo ocupado' },
    ],
  },
  {
    id: 'punctuality',
    Icon: TbClock,
    label: 'Puntualidad',
    options: [
      { value: 'early',         label: 'Adelantado',  desc: 'Llegó antes de tiempo' },
      { value: 'on_time',       label: 'A tiempo',    desc: 'Coincide con el horario' },
      { value: 'slightly_late', label: 'Algo tarde',  desc: '5–10 min de retraso' },
      { value: 'very_late',     label: 'Muy tarde',   desc: 'Más de 10 min de retraso' },
    ],
  },
  {
    id: 'crowding',
    Icon: TbUsers,
    label: 'Ocupación',
    options: [
      { value: 'empty',       label: 'Vacío',       desc: 'Poca gente' },
      { value: 'normal',      label: 'Normal',      desc: 'Aforo razonable' },
      { value: 'full',        label: 'Lleno',       desc: 'Casi sin espacio' },
      { value: 'overcrowded', label: 'Abarrotado',  desc: 'Imposible moverse' },
    ],
  },
  {
    id: 'noise',
    Icon: TbVolume,
    label: 'Ruido',
    options: [
      { value: 'quiet',  label: 'Silencioso', desc: 'Ambiente tranquilo' },
      { value: 'normal', label: 'Normal',     desc: 'Ruido habitual' },
      { value: 'noisy',  label: 'Ruidoso',    desc: 'Mucho ruido o música' },
    ],
  },
  {
    id: 'temperature',
    Icon: TbTemperature,
    label: 'Temperatura',
    options: [
      { value: 'cold', label: 'Frío',       desc: 'Demasiado aire acondicionado' },
      { value: 'ok',   label: 'Agradable',  desc: 'Temperatura correcta' },
      { value: 'hot',  label: 'Calor',      desc: 'Hace mucho calor' },
    ],
  },
  {
    id: 'driver',
    Icon: TbSteeringWheel,
    label: 'Conducción',
    options: [
      { value: 'great',  label: 'Suave',   desc: 'Conducción tranquila' },
      { value: 'normal', label: 'Normal',  desc: 'Sin incidencias' },
      { value: 'bad',    label: 'Brusca',  desc: 'Frenadas o acelerones bruscos' },
    ],
  },
  {
    id: 'accessibility',
    Icon: TbWheelchair,
    label: 'Accesibilidad',
    options: [
      { value: 'ramp_ok',     label: 'Rampa OK',   desc: 'Rampa de acceso funciona' },
      { value: 'ramp_broken', label: 'Rampa rota', desc: 'La rampa no funciona' },
    ],
  },
];

// Modal en 3 pasos: tipo -> opcion -> confirmar
export default function ReportModal({ bus, userLocation, isDarkMode, onClose, onSuccess }) {
  const [step, setStep] = useState('type');
  const [selectedType, setSelectedType] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const typeData = REPORT_TYPES.find(t => t.id === selectedType);

  const handleSelectType = (typeId) => {
    setSelectedType(typeId);
    setSelectedOption(null);
    setStep('options');
  };

  const handleSelectOption = (value) => {
    setSelectedOption(value);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Debes iniciar sesión para reportar');

      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: selectedType,
          metadata: { value: selectedOption },
          description: description.trim() || null,
          lat: userLocation[0],
          lng: userLocation[1],
          lineName: bus.line,
          busId: bus.busId || null,
        }),
      });

      // El 409 es cuando el backend detecta que ya reportaste lo mismo en las ultimas 2h
      if (!r.ok) {
        const json = await r.json().catch(() => ({}));
        throw new Error(r.status === 409 ? json.error : 'Error al enviar el reporte');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'options') setStep('type');
    if (step === 'confirm') setStep('options');
  };

  return (
    <div className={`report-overlay ${isDarkMode ? 'dark' : ''}`} onClick={onClose}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>

        <div className="report-header">
          {step !== 'type' && (
            <button className="report-back" onClick={handleBack}>
              <TbArrowLeft size={18} />
            </button>
          )}
          <div className="report-header-text">
            <span className="report-header-title">Reportar incidencia</span>
            <span className="report-header-sub">Línea {bus.line} · {bus.destination}</span>
          </div>
          <button className="report-close" onClick={onClose}>
            <TbX size={18} />
          </button>
        </div>

        {step === 'type' && (
          <div className="report-types-grid">
            {REPORT_TYPES.map(({ id, Icon, label }) => (
              <button
                key={id}
                className="report-type-card"
                onClick={() => handleSelectType(id)}
              >
                <Icon size={28} className="report-type-icon" />
                <span className="report-type-label">{label}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'options' && typeData && (
          <div className="report-options-list">
            <p className="report-step-hint">
              {typeData.label} — elige una opción:
            </p>
            {typeData.options.map(opt => (
              <button
                key={opt.value}
                className="report-option-card"
                onClick={() => handleSelectOption(opt.value)}
              >
                <span className="report-option-label">{opt.label}</span>
                <span className="report-option-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'confirm' && typeData && (
          <div className="report-confirm">
            <div className="report-confirm-summary">
              <typeData.Icon size={28} className="report-confirm-icon" />
              <div>
                <span className="report-confirm-type">{typeData.label}</span>
                <span className="report-confirm-option">
                  {typeData.options.find(o => o.value === selectedOption)?.label}
                </span>
              </div>
            </div>

            <div className="report-description-wrap">
              <textarea
                className={`report-description ${description.length >= 150 ? 'at-limit' : ''}`}
                placeholder="Comentario adicional (opcional)…"
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 150))}
                rows={3}
              />
              <span className={`report-char-counter ${description.length >= 140 ? 'warn' : ''}`}>
                {description.length}/150
              </span>
            </div>

            {error && <p className="report-error">{error}</p>}

            <button
              className="report-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <TbSend size={16} />
              {submitting ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
