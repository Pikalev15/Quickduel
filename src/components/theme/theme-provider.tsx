"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isSiteAccent, SITE_ACCENT_KEY, type SiteAccent } from "@/lib/site-accent";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  accent: SiteAccent;
  setAccent: (accent: SiteAccent) => void;
};

const storageKey = "quickduel:theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(storageKey);
  return isThemePreference(stored) ? stored : "light";
}

function appliedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(storedPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(appliedTheme);
  const [accent, setAccentState] = useState<SiteAccent>(() => {
    const value = typeof document === "undefined" ? null : document.documentElement.dataset.accent;
    return isSiteAccent(value) ? value : "blue";
  });
  const setAccent = useCallback((next: SiteAccent) => {
    if (!isSiteAccent(next)) return;
    document.documentElement.dataset.accent = next;
    try { localStorage.setItem(SITE_ACCENT_KEY, next); } catch { /* Storage unavailable. */ }
    setAccentState(next);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === SITE_ACCENT_KEY) setAccent(isSiteAccent(event.newValue) ? event.newValue : "blue"); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [setAccent]);

  const applyTheme = useCallback((next: ThemePreference) => {
    const resolved = next === "system" ? systemTheme() : next;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    setResolvedTheme(resolved);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [applyTheme, preference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      window.localStorage.setItem(storageKey, next);
      setPreferenceState(next);
      applyTheme(next);
    },
    [applyTheme],
  );

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference, accent, setAccent }),
    [preference, resolvedTheme, setPreference, accent, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
