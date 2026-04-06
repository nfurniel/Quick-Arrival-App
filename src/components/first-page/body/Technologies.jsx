import "./Technologies.css";
import SpotlightCard from "./SpotlightCard.jsx";
import { FaReact } from "react-icons/fa";
import { SiSupabase, SiLeaflet } from "react-icons/si";
import { MdDirectionsBus } from "react-icons/md";

export default function Technologies() {
    return (
        <section id="tecnologias" className="tech-container">
            <h2 className="tech-title">Tecnologías de Vanguardia</h2>
            <p className="tech-subtitle">Quick Arrival está construido bajo un patrón de arquitectura Headless, garantizando velocidad extrema y precisión milimétrica.</p>

            <div className="tech-grid">
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"><FaReact className="tech-icon" /></div>
                    <h3>React + Vite</h3>
                    <p>Interfaz construida en React con Vite, consiguiendo tiempos de carga mínimos y una experiencia fluida sin recargas de página.</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"><SiSupabase className="tech-icon" /></div>
                    <h3>Supabase</h3>
                    <p>Gestión de usuarios, autenticación segura y presencia en tiempo real mediante Supabase Realtime, sin infraestructura propia.</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"><SiLeaflet className="tech-icon" /></div>
                    <h3>Leaflet + CartoDB</h3>
                    <p>Mapas interactivos open-source con capas vectoriales de CartoDB, sin costes de API y con total libertad de personalización.</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"><MdDirectionsBus className="tech-icon" /></div>
                    <h3>APIs de Transporte</h3>
                    <p>Datos en tiempo real directamente desde la API oficial de la EMT Madrid y el CRTM para autobuses, metro y Cercanías.</p>
                </SpotlightCard>
            </div>
        </section>
    );
}
