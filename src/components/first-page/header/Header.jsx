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
        { label: "Company", ariaLabel: "About Company" },
        { label: "Careers", ariaLabel: "About Careers" },
      ],
    },
    {
      label: "Projects",
      bgColor: "#F8FAFC",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Featured", ariaLabel: "Featured Projects" },
        { label: "Case Studies", ariaLabel: "Project Case Studies" },
      ],
    },
    {
      label: "Contact",
      bgColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#DC2626",
      links: [
        { label: "Email", ariaLabel: "Email us" },
        { label: "Twitter", ariaLabel: "Twitter" },
        { label: "LinkedIn", ariaLabel: "LinkedIn" },
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
