import { useState, useRef, useEffect } from "react";

const CustomSelect = ({
  options,
  value,
  onChange,
  icon = null,
  placeholder = "Select...",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (opt) => {
    if (disabled) return;
    onChange(opt.value);
    setIsOpen(false);
  };

  return (
    <div
      className={`cselect ${isOpen ? "open" : ""} ${disabled ? "cselect--disabled" : ""}`}
      ref={ref}
    >
      <button
        className="cselect-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        type="button"
        disabled={disabled}
      >
        {icon && <span className="cselect-icon">{icon}</span>}
        <span className="cselect-value">
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="cselect-arrow"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="cselect-dropdown">
        <div className="cselect-options">
          {options.map((opt, i) => (
            <button
              key={opt.value}
              className={`cselect-option ${opt.value === value ? "selected" : ""}`}
              onClick={() => handleSelect(opt)}
              style={{ animationDelay: `${i * 30}ms` }}
              type="button"
              disabled={disabled}
            >
              {opt.icon && <span className="cselect-opt-icon">{opt.icon}</span>}
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg
                  className="cselect-check"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                >
                  <path
                    d="M3 7.5L5.5 10L11 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomSelect;
