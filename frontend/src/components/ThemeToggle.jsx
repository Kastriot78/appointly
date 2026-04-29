import { HiOutlineMoon, HiOutlineSun } from "react-icons/hi";
import { useTheme } from "../theme/ThemeContext";
import "./theme-toggle.css";

export default function ThemeToggle({ variant = "header", className = "" }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  const cls = `theme-toggle theme-toggle--${variant}${
    className ? ` ${className}` : ""
  }`;

  if (variant === "menu") {
    return (
      <button
        type="button"
        className={cls}
        onClick={toggleTheme}
        aria-label={`Switch to ${next} theme`}
      >
        <span className="theme-toggle__icon" aria-hidden>
          {isDark ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />}
        </span>
        <span className="theme-toggle__label">
          {isDark ? "Light theme" : "Dark theme"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      aria-pressed={isDark}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {isDark ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />}
      </span>
    </button>
  );
}
