import { useState, useEffect } from "react";

export function usePrefersFineHover() {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      setValue(mqHover.matches && !mqCoarse.matches);
    };
    apply();
    mqHover.addEventListener("change", apply);
    mqCoarse.addEventListener("change", apply);
    return () => {
      mqHover.removeEventListener("change", apply);
      mqCoarse.removeEventListener("change", apply);
    };
  }, []);

  return value;
}
