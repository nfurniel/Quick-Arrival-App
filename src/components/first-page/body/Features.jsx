import "./Features.css";
import SpotlightCard from "./SpotlightCard.jsx";

import icon1 from "../../../assets/icono-bus.jpg";
import icon2 from "../../../assets/icono-bus2.jpg";
import icon3 from "../../../assets/icono-bus3.jpg";

export default function Features() {
    return (
        <section id="funcionalidades" className="features-container">
            <h2 className="features-title">Una solución pensada para ti</h2>
            <div className="features-grid">
                <SpotlightCard className="feature-card" spotlightColor="rgba(251, 32, 73, 0.15)">
                    <img src={icon1} className="feature-icon" alt="Ubicación Real" />
                    <h3>Ubicación Real</h3>
                    <p>Olvídate de los tiempos estimados. Mira exactamente dónde se encuentra el autobús en nuestro mapa interactivo de Google Maps. Cero "buses fantasmas".</p>
                </SpotlightCard>
                <SpotlightCard className="feature-card" spotlightColor="rgba(251, 32, 73, 0.15)">
                    <img src={icon2} className="feature-icon" alt="Evita Multitudes" />
                    <h3>Evita Multitudes</h3>
                    <p>Conoce el nivel de ocupación del autobús en vivo antes de que llegue a tu parada para decidir si esperar al siguiente.</p>
                </SpotlightCard>
                <SpotlightCard className="feature-card" spotlightColor="rgba(251, 32, 73, 0.15)">
                    <img src={icon3} className="feature-icon" alt="100% Colaborativa" />
                    <h3>100% Colaborativa</h3>
                    <p>Una herramienta construida por la comunidad. Haz "check-in" cuando estés a bordo para informar automáticamente al resto de usuarios conectados.</p>
                </SpotlightCard>
            </div>
        </section>
    );
}
