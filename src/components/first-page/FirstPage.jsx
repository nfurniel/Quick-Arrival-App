import Header from "./header/Header.jsx";
import Body from "./body/Body.jsx";
import Footer from "./footer/Footer.jsx";
import GradualBlur from "./body/GradualBlur.jsx";
import Antigravity from "./body/Antigravity.jsx";

export default function FirstPage() {
    return (
        <div style={{ position: "relative", minHeight: "100vh" }}>
            <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100vh", zIndex: -1, pointerEvents: "none" }}>
                <Antigravity
                    count={70}
                    magnetRadius={16}
                    ringRadius={14}
                    waveSpeed={0.1}
                    waveAmplitude={1}
                    particleSize={2}
                    lerpSpeed={0.1}
                    color="#fb2049"
                    autoAnimate={true}
                    particleVariance={1}
                    rotationSpeed={0.1}
                    depthFactor={1}
                    pulseSpeed={3}
                    particleShape="capsule"
                    fieldStrength={8}
                />
            </div>
            <Header />
            <Body />
            <Footer />
            <GradualBlur
                target="page"
                position="bottom"
                height="7rem"
                strength={2}
                divCount={5}
                curve="bezier"
                exponential
                opacity={1}
                style={{
                    background: "linear-gradient(to bottom, rgba(251, 32, 73, 0) 0%, rgba(251, 32, 73, 0.08) 100%)"
                }}
            />
        </div>
    )
}
