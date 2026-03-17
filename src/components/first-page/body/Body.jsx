import AboutUs from "./AboutUs.jsx";
import AboutSection from "./AboutSection.jsx";
import Features from "./Features.jsx";
import HowItWorks from "./HowItWorks.jsx";
import Technologies from "./Technologies.jsx";
import "./Body.css";

export default function Body() {
    return (
        <div className="body-container">
            <AboutUs />
            <AboutSection />
            <Features />
            <HowItWorks />
            <Technologies />
        </div>
    )
}