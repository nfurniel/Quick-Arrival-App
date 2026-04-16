import { useState, useEffect, useRef } from 'react';
import './FavouriteModal.css';

export default function FavouriteModal({ stopName, isDarkMode, onSave, onCancel }) {
  const [alias, setAlias] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => onSave(alias.trim() || null);

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
          className="fav-modal-input"
          type="text"
          placeholder="Ej: Casa, Trabajo, Gimnasio…"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={40}
        />
        <div className="fav-modal-actions">
          <button className="fav-modal-cancel" onClick={onCancel}>Cancelar</button>
          <button className="fav-modal-save" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
