import "./AboutSection.css";

export default function AboutSection() {
    return (
        <section id="sobre-nosotros" className="about-hero-container">
            <div className="about-hero-content">
                <div className="about-hero-text">
                    <h2>El fin de las esperas a ciegas.</h2>
                    <p>
                        Quick Arrival es una iniciativa colaborativa tipo "Waze" para los autobuses de Madrid.
                        Usamos la tecnología y ubicación de los usuarios a bordo para decirte, exactamente,
                        dónde está tu autobús y si llegará lleno. La información oficial de la EMT mejorada
                        por la comunidad, para evitar los "buses fantasmas" y llegar <strong>siempre a tiempo</strong>.
                    </p>
                    <div className="about-hero-buttons">
                        <button className="btn-primary">Ver el Mapa</button>
                        <button className="btn-secondary">Saber más</button>
                    </div>
                </div>
                <div className="about-hero-image-wrapper">
                    {/* Placeholder para la imagen de la sección About. Ej: Un móvil mostrando el mapa en tiempo real */}
                    <div className="about-image-placeholder">
                        <span className="placeholder-text">IMAGEN DEL MAPA/APP AQUÍ</span>
                    </div>
                </div>
            </div>
        </section>
    );
}