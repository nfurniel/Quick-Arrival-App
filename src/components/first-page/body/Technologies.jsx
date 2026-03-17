import "./Technologies.css";
import SpotlightCard from "./SpotlightCard.jsx";

export default function Technologies() {
    return (
        <section className="tech-container">
            <h2 className="tech-title">Tecnologías de Vanguardia</h2>
            <p className="tech-subtitle">Quick Arrival está construido bajo un patrón de arquitectura Headless, garantizando velocidad extrema y precisión milimétrica.</p>

            <div className="tech-grid">
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"></div>
                    <h3>Frontend Moderno</h3>
                    <p>Desarrollado en React, asegurando una interfaz visual fluida, mapas interactivos ultrarrápidos y experiencia de App Nativa (PWA).</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"></div>
                    <h3>Backend Robusto</h3>
                    <p>Potenciado por Laravel para procesar miles de coordenadas GPS en tiempo real, conectando pasajeros sin interrupciones ni lag.</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"></div>
                    <h3>Google Maps API</h3>
                    <p>Integración oficial para trazado de rutas, visualización de tráfico y sincronización geolocalizada perfecta al segundo.</p>
                </SpotlightCard>
                <SpotlightCard className="tech-card" spotlightColor="rgba(251, 32, 73, 0.2)">
                    <div className="icon-placeholder"></div>
                    <h3>OpenData EMT</h3>
                    <p>Conexión directa con la base de datos de transportes de Madrid para obtener los paraderos, rutas y trayectos oficiales.</p>
                </SpotlightCard>
            </div>
        </section>
    );
}
