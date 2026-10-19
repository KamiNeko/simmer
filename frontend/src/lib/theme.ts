import { useEffect, useState } from "react";

const KEY = "simmer-theme";
const QUERY = "(prefers-color-scheme: dark)";

/** The theme the user picked with the toggle, or null to follow the system. */
function storedChoice(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const systemQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

/**
 * Dark or light mode: the system's setting, following it as it changes, until the user picks one
 * with the toggle. Only that pick is saved; public/theme.js applies the same rule before the app loads.
 */
export function useTheme() {
  const [choice, setChoice] = useState(storedChoice);
  const [systemDark, setSystemDark] = useState(() => systemQuery()?.matches ?? false);

  useEffect(() => {
    const query = systemQuery();
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const dark = choice ? choice === "dark" : systemDark;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  };
  return { dark, toggle };
}
