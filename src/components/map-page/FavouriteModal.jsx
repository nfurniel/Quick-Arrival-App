import { useState, useEffect, useRef } from 'react';
import './FavouriteModal.css';

export default function FavouriteModal({ stopName, isDarkMode, existingAliases = [], onSave, onCancel }) {
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    const trimmed = alias.trim();
    if (trimmed && existingAliases.some(a => a.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError('Ya tienes un favorito con ese nombre');
      return;
    }
    onSave(trimmed || null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={`fav-modal-overlay ${isDarkMode ? 'dark' : ''}`} onClick={onCancel}>
      <div className="fav-modal" onClick={e => e.stopPropagation()}>
        <h3 className="fav-modal-title">Guardar parada</h3>
        <p className="fav-modal-stop">{stopName}</p>
        <input
          ref={inputRef}
          className={`fav-modal-input ${error ? 'fav-modal-input--error' : ''}`}
          type="text"
          placeholder="Ej: Casa, Trabajo, Gimnasio…"
          value={alias}
          onChange={e => { setAlias(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          maxLength={40}
        />
        {error && <p className="fav-modal-error">{error}</p>}
        <div className="fav-modal-actions">
          <button className="fav-modal-cancel" onClick={onCancel}>Cancelar</button>
          <button className="fav-modal-save" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
