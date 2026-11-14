import type { ThemePreference } from "@/lib/types";

/**
 * Theme handling shared by the pre-hydration script and the client.
 *
 * The preference ("dark", "light" or "system") is saved in localStorage so it
 * can be applied before React loads; signed-in users also have it stored on
 * their account, which wins when the two differ.
 */

export const THEME_STORAGE_KEY = "avio-theme";

/** Runs in <head> before first paint. Keep it tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"dark";var l=p==="light"||(p==="system"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.setAttribute("data-theme",l?"light":"dark")}catch(e){}})()`;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "dark";
  } catch {
    return "dark";
  }
}

function resolve(preference: ThemePreference): "dark" | "light" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Applies a preference to the document and remembers it on this device. */
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", resolve(preference));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}
