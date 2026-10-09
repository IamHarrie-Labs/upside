import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./Brand";
import { chain } from "./env";
import { BASE_SYMBOL, QUOTE_SYMBOL, fmtQuote, humanPrice, type Call, type getVaultState } from "./lib/upside";

import { type DashboardTab, type Theme } from "./workspace";
export function WorkspaceIcon({ name }: { name: DashboardTab | "theme" }) {
  const paths = { feed: "M4 6h16v14H4zM7 3h10M8 10h8M8 14h5", post: "M5 5h14v14H5zM12 8v8M8 12h8", portfolio: "M4 7h16v13H4zM4 7V4h13v3M15 11h5v5h-5z", board: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3", profile: "M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21v-3a8 8 0 0 1 16 0v3", funding: "M4 6h16v14H4zM8 3h8M12 10v6M9 13h6", theme: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 3v18" };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
const destinations: [DashboardTab, string][] = [["feed", "Calls"], ["post", "Create"], ["portfolio", "Vault"], ["board", "Record"], ["profile", "Profile"], ["funding", "Funding"]];
export function DashboardFrame({ children, tab, detail, theme, setTheme, navigate, home, account, busy, signIn, signOut, mid }: {
  children: ReactNode; tab: DashboardTab; detail: boolean; theme: Theme; setTheme: (theme: Theme) => void; navigate: (tab: DashboardTab) => void;
  home: () => void; account?: { name: string; address: string }; busy: boolean; signIn: () => void; signOut: () => void; mid: bigint | null;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const act = (fn: () => void) => { if (menu.current) menu.current.open = false; fn(); };
  return <div className="workspace-surface" data-workspace-theme={theme}><div className="shell dashboard-shell">
    <a className="skip" href="#workspace">Skip to content</a>
    <aside className="dashboard-rail"><button className="wordmark home-button" onClick={home} aria-label="Upside home"><BrandMark/>Upside</button><p className="rail-label">Workspace</p><nav className="tabs" aria-label="Workspace">{destinations.map(([key,label]) => <button key={key} className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => navigate(key)}><WorkspaceIcon name={key}/><span>{label}</span></button>)}</nav><div className="rail-resources"><a href="/docs">Help & documentation</a><span className="rail-network">{chain.name}</span></div></aside>
    <header className="top"><div className="workspace-location"><span>Workspace</span><b>{detail ? (tab === "board" ? "Trader record" : "Call details") : destinations.find(([key]) => key === tab)?.[1]}</b></div><div className="ticker"><span>{BASE_SYMBOL}/{QUOTE_SYMBOL} reference price</span><b>{mid ? humanPrice(mid).toFixed(4) : "Unavailable"}</b></div><button className="theme-control theme-toggle" aria-label="Dark mode" aria-pressed={theme === "dark"} title={theme === "dark" ? "Use the default light appearance" : "Use the brand's dark appearance"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><WorkspaceIcon name="theme"/><span>{theme === "dark" ? "Light" : "Dark"}</span></button>
      {account ? <details ref={menu} className="account-menu"><summary aria-label="Open account menu"><span className="account-avatar">{account.name.replace(/^@/, "").slice(0,2).toUpperCase()}</span><span>{account.name}</span></summary><div className="account-popover"><strong>{account.name}</strong><code>{account.address}</code><button onClick={() => act(() => navigate("profile"))}>Edit profile</button><button onClick={() => act(() => navigate("funding"))}>Fund account or vault</button><button disabled={busy} onClick={() => act(signOut)} className="sign-out">Sign out</button></div></details> : <button className="chip" onClick={signIn}>Sign in</button>}
    </header>{children}
  </div></div>;
}
export function DashboardOverview({ calls, state, signedIn, loading }: { calls: Call[]; state: Awaited<ReturnType<typeof getVaultState>> | null; signedIn: boolean; loading: boolean }) {
  const [now, setNow] = useState(() => Math.floor(Date.now()/1000));
  useEffect(() => { const timer = setInterval(() => setNow(Math.floor(Date.now()/1000)), 30000); return () => clearInterval(timer); }, []);
  const live = calls.filter(call => !call.scored && call.expiry > now).length;
  return <section className="dashboard-overview" aria-label="Workspace overview">
    <div><span>Available in vault</span><strong>{loading ? "–" : state ? `${fmtQuote(state.cash)} ${QUOTE_SYMBOL}` : signedIn ? "No vault yet" : "Sign in"}</strong><small>Cash available for your next follow</small></div>
    <div><span>Committed to trades</span><strong>{loading ? "–" : state ? `${fmtQuote(state.openCost)} ${QUOTE_SYMBOL}` : "–"}</strong><small>{state ? `Your limit: ${fmtQuote(state.maxExposure,0)} ${QUOTE_SYMBOL}` : "Set a limit in your vault"}</small></div>
    <div><span>Live calls</span><strong>{loading ? "–" : live}</strong><small>{loading ? "Reading the record" : `${calls.length} calls in the public record`}</small></div>
    <div><span>Your open follows</span><strong>{loading ? "–" : state ? state.positions.filter(position => position.open).length : "–"}</strong><small>Positions still held in your vault</small></div>
  </section>;
}
