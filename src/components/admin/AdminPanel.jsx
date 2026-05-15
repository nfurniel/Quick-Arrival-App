import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SupportTab from './SupportTab';
import ReportsTab from './ReportsTab';
import AnnouncementsTab from './AnnouncementsTab';
import './AdminPanel.css';

const TABS = [
  { id: 'support', label: 'Soporte' },
  { id: 'reports', label: 'Reportes' },
  { id: 'announcements', label: 'Anuncios' },
];

export default function AdminPanel() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('support');

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <button className="admin-back-btn" onClick={() => navigate('/mapa')}>← Volver al mapa</button>
        <h1 className="admin-title">Panel de administración</h1>
      </div>

      <div className="admin-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'admin-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'support' && <SupportTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'announcements' && <AnnouncementsTab />}
    </div>
  );
}
