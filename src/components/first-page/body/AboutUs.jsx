import "./AboutUs.css";
import RotatingText from "./RotatingText.jsx";

export default function AboutUs() {
    return (
        <div className="about-us-container">
            <div className="about-us-content">
                <div className="about-us-text">
                    <h1>Quick Arrival</h1>
                    <p>
                        Somos
                        <RotatingText
                            texts={['precisos.', 'puntuales.', 'rápidos.', 'fiables.', 'colaborativos.']}
                            mainClassName="reactbits-rotating-badge"
                            staggerFrom="first"
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "-120%" }}
                            staggerDuration={0.045}
                            splitLevelClassName="reactbits-split-level"
                            transition={{ type: "spring", damping: 30, stiffness: 400 }}
                            rotationInterval={2500}
                        />
                    </p>
                </div>
            </div>
        </div>
    );
}