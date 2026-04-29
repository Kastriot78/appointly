import { useState } from "react";
import { parsePhoneNumber } from "libphonenumber-js";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { clampPhoneNumber } from "./phoneClamp.js";
import "./phone-field.css";


export default function PhoneField({
  value,
  onChange,
  id,
  disabled,
  className = "",
  defaultCountry = "XK",
  numberInputProps: numberInputPropsFromParent = {},
}) {
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);

  const handleChange = (v) => {
    const raw = v ?? "";
    let countryForClamp = selectedCountry;
    try {
      const p = parsePhoneNumber(raw, defaultCountry);
      if (p?.country) countryForClamp = p.country;
    } catch {
    }
    const clamped = clampPhoneNumber(raw, countryForClamp);
    onChange(clamped);
  };

  const mergedNumberInputProps = {
    ...(id ? { id } : {}),
    ...numberInputPropsFromParent,
  };

  return (
    <div className={`phone-field-wrap ${className}`.trim()}>
      <PhoneInput
        international
        defaultCountry={defaultCountry}
        limitMaxLength
        countryCallingCodeEditable={false}
        value={value || undefined}
        onChange={handleChange}
        onCountryChange={(c) => {
          const next = c || defaultCountry;
          setSelectedCountry(next);
          const raw = value || "";
          if (raw) {
            const clamped = clampPhoneNumber(raw, next);
            if (clamped !== raw) onChange(clamped);
          }
        }}
        disabled={disabled}
        numberInputProps={
          Object.keys(mergedNumberInputProps).length
            ? mergedNumberInputProps
            : undefined
        }
      />
    </div>
  );
}
