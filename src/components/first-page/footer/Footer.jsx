import "./Footer.css";

export default function Footer() {
    return (
        <footer className="footer-container">
            <div className="footer-content">
                <div className="footer-brand">
                    <h2>Quick Arrival</h2>
                    <p>Menos esperas, más tiempo para ti.</p>
                </div>
                <div className="footer-links">
                    <div className="link-group">
                        <h3>Proyecto</h3>
                        <a href="#">Sobre nosotros</a>
                        <a href="#">Cómo funciona</a>
                        <a href="#">Tecnología</a>
                    </div>
                    <div className="link-group">
                        <h3>Legal</h3>
                        <a href="#">Términos y condiciones</a>
                        <a href="#">Política de privacidad</a>
                    </div>
                </div>
            </div>
            <div className="footer-bottom">
                <p>&copy; {new Date().getFullYear()} Quick Arrival - Proyecto de Fin de Ciclo</p>
            </div>
        </footer>
    );
}
