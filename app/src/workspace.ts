export type DashboardTab = "feed" | "post" | "portfolio" | "board" | "profile" | "funding";
export type Theme = "light" | "ivory" | "dark" | "forest";
export const THEMES: [Theme, string][] = [["light", "Light"], ["ivory", "Ivory"], ["dark", "Dark"], ["forest", "Forest"]];
export function initialTheme(): Theme {
  try { const value = localStorage.getItem("upside.workspace.theme"); if (THEMES.some(([key]) => key === value)) return value as Theme; } catch { /* Storage is optional. */ }
  return "light";
}
