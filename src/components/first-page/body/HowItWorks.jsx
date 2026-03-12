import "./HowItWorks.css";

export default function HowItWorks() {
    return (
        <section className="how-it-works-container">
            <h2 className="how-title">¿Cómo funciona Quick Arrival?</h2>
            <div className="how-steps">
                <div className="how-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                        <h3>Sube al Autobús</h3>
                        <p>Inicias tu viaje de manera habitual. Solo necesitas tener tu móvil con conexión a internet y GPS.</p>
                    </div>
                </div>
                <div className="how-step">
                    <div className="step-number">2</div>
                    <div className="step-content">
                        <h3>Haz Check-in</h3>
                        <p>Abres la app e indicas rápidamente tu ruta y si hay asientos libres. Tu teléfono comenzará a emitir coordenadas anónimas.</p>
                    </div>
                </div>
                <div className="how-step">
                    <div className="step-number">3</div>
                    <div className="step-content">
                        <h3>Ayuda al Resto</h3>
                        <p>Los usuarios que esperan en las paradas ven en tiempo real la posición de tu autobús y evitan esperas innecesarias.</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
