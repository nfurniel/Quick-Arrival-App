import "./header.css";
import CardNav from "./CardNav.jsx";
import logo from "../../../assets/logo-bus.png";
export default function Header() {
  const items = [
    {
      label: "About",
      bgColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "About us", ariaLabel: "About us" },
        { label: "How it works", ariaLabel: "How it works" },
      ],
    },
    {
      label: "Map",
      bgColor: "#F8FAFC",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Bus Stops", ariaLabel: "Bus Stops" },
        { label: "Routes", ariaLabel: "Routes" },
      ],
    },
    {
      label: "Support",
      bgColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "FAQ", ariaLabel: "FAQ" },
        { label: "Contact", ariaLabel: "Contact" },
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
      />
    </div>
  );
}
