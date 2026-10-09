export type DashboardTab = "feed" | "post" | "portfolio" | "board" | "profile" | "funding";
export type Theme = "light" | "dark";
export const THEMES: [Theme, string][] = [["light", "Light"], ["dark", "Dark"]];
export function initialTheme(): Theme {
  try { if (localStorage.getItem("upside.workspace.appearance.v2") === "dark") return "dark"; } catch { /* Storage is optional. */ }
  return "light";
}
