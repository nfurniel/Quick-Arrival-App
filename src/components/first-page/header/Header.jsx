import "./header.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CardNav from "./CardNav.jsx";
import AuthModal from "./AuthModal.jsx";
import logo from "../../../assets/logo-bus.png";
export default function Header() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const items = [
    {
      label: "Info",
      bgColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Sobre nosotros", ariaLabel: "Sobre nosotros", href: "#sobre-nosotros" },
        { label: "Cómo funciona", ariaLabel: "Cómo funciona", href: "#como-funciona" },
      ],
    },
    {
      label: "App",
      bgColor: "#F8FAFC",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Funcionalidades", ariaLabel: "Funcionalidades", href: "#funcionalidades" },
        { label: "Tecnologías", ariaLabel: "Tecnologías", href: "#tecnologias" },
      ],
    },
    {
      label: "Acceso",
      bgColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Iniciar sesión", ariaLabel: "Iniciar sesión", onClick: () => setIsModalOpen(true) },
        { label: "Ir al mapa", ariaLabel: "Ir al mapa", onClick: () => navigate("/mapa") },
      ],
    },
  ];
  return (
    <div className="first-main-container">
      {/* <img src={logo} alt="logo" /> */}
      <CardNav
        logo={logo}
        logoAlt="Quick Arrival"
        items={items}
        baseColor="#fff"
        menuColor="#000"
        buttonBgColor="#111"
        buttonTextColor="#fff"
        ease="power3.out"
        theme="light"
        onCtaClick={() => setIsModalOpen(true)}
      />
      <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
