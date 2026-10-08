import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import {
  createPasskeyAccount,
  describeError,
  DEV_ACCOUNTS,
  devSession,
  hasPasskey,
  signInWithPasskey,
  type Session,
} from "./lib/account";
import {
  BASE_SYMBOL,
  closePosition,
  demoFaucet,
  devFundGas,
  ensureVault,
  fmtBase,
  fmtQuote,
  follow,
  getCallerStats,
  getCalls,
  getHandles,
  setHandle,
  toHandle,
  getMid,
  getVault,
  getVaultState,
  humanPrice,
  parseQuote,
  postCall,
  previewFee,
  QUOTE_SYMBOL,
  setExposure,
  withdrawCash,
  type Call,
  type CallerStats,
} from "./lib/upside";
import { deployment, EXPLORER, IS_LOCAL, REFRESH_MS } from "./env";
import { getPerplPositions, perplEnabled, perplUrl, type PerplPosition } from "./lib/perpl";
import { getNansen, type NansenInfo } from "./lib/nansen";
import Landing from "./Landing";
import { BrandMark, WalletGlyph } from "./Brand";
import InfoPage from "./InfoPage";
const infoRoutes = ["guide", "privacy", "terms"];

type Tab = "feed" | "post" | "portfolio" | "board";
type VaultState = Awaited<ReturnType<typeof getVaultState>>;
type Toast = { kind: "info" | "ok" | "err"; text: string; hash?: string } | null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number, digits = 1) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(digits)}%`;
// Public handles from the Handles contract, refreshed with the rest of the state.
let HANDLES = new Map<string, string>();
// Callers' current MON positions on Perpl (null = none), refreshed with the rest of the state.
let PERPL = new Map<string, PerplPosition | null>();
// Nansen labels per caller (Smart Money etc.), via the keeper.
let NANSEN = new Map<string, NansenInfo | null>();
const nameOf = (a: string) => {
  const h = HANDLES.get(a.toLowerCase());
  return h ? `@${h}` : short(a);
};
const go = (hash: string) => (location.hash = hash);
/** "#/" and "#" are the home screen; detail routes are "#/call/N" and "#/caller/0x…". */
const currentRoute = () => (location.hash === "#/" || location.hash === "#" ? "" : location.hash);

async function share(title: string, text: string, hash: string) {
  const url = `${location.origin}${location.pathname}${hash}`;
  try {
    if (navigator.share) return await navigator.share({ title, text, url });
    await navigator.clipboard.writeText(`${text} ${url}`);
    window.dispatchEvent(new CustomEvent("upside:notice", { detail: "Link copied to clipboard." }));
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") window.dispatchEvent(new CustomEvent("upside:notice", { detail: { kind: "err", text: "Sharing is unavailable. Copy this page's address from your browser." } }));
  }
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function countdown(sec: number) {
  if (sec <= 0) return "scoring…";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}h ${m}m left` : `${m}:${String(s).padStart(2, "0")} left`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [browsing, setBrowsing] = useState(() => location.hash.startsWith("#/"));
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [mid, setMid] = useState<bigint | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Map<Address, CallerStats>>(new Map());
  const [vault, setVault] = useState<Address | null>(null);
  const [vs, setVs] = useState<VaultState | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [route, setRoute] = useState(currentRoute);
  const [, setHandleTick] = useState(0);
  const refreshVersion = useRef(0);
  const adoptSession = (next: Session | null) => {
    refreshVersion.current++;
    setLoading(true); setLoadError(""); setVault(null); setVs(null); setSession(next);
  };

  useEffect(() => {
    const on = () => { const next = currentRoute(); setRoute(next); if (next.startsWith("#/")) setBrowsing(true); if (!next || next.startsWith("#/")) window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    const notice = (e: Event) => { const detail = (e as CustomEvent<string | NonNullable<Toast>>).detail; setToast(typeof detail === "string" ? { kind: "ok", text: detail } : detail); };
    addEventListener("upside:notice", notice);
    return () => removeEventListener("upside:notice", notice);
  }, []);
  useEffect(() => {
    if (!toast || toast.kind !== "ok") return;
    const timeout = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const [m, cs] = await Promise.all([getMid(), getCalls()]);
      const nextStats = await getCallerStats([...cs.map((c) => c.caller), ...(session ? [session.account.address] : [])]);
      let state: VaultState | null = null;
      let nextVault: Address | null = null;
      if (session) {
        const v = await getVault(session.account.address);
        nextVault = v;
        state = v ? await getVaultState(v) : null;
      }
      const nextHandles = await getHandles([
        ...cs.map((c) => c.caller),
        ...(session ? [session.account.address] : []),
        ...(state ? state.positions.map((p) => p.caller) : []),
      ]);
      const [nextPerpl, nextNansen] = await Promise.all([
        getPerplPositions(cs.map((c) => c.caller)),
        getNansen(cs.map((c) => c.caller)),
      ]);
      if (version !== refreshVersion.current) return;
      setMid(m); setCalls(cs); setStats(nextStats); setVault(nextVault); setVs(state);
      HANDLES = nextHandles; PERPL = nextPerpl; NANSEN = nextNansen;
      setHandleTick((t) => t + 1);
      setLoading(false);
      setLoadError("");
      setUpdatedAt(Date.now());
    } catch (error) { if (version === refreshVersion.current) throw error; }
  }, [session]);

  useEffect(() => {
    if (!browsing && !session) return;
    const read = () => refresh().catch(() => { setLoading(false); setLoadError("We could not refresh the onchain record. Check your connection and try again."); });
    queueMicrotask(read);
    const t = setInterval(read, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh, browsing, session]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    setToast({ kind: "info", text: label });
    try {
      const hash = await fn();
      setToast({ kind: "ok", text: `${label} — done`, hash: hash || undefined });
      await refresh().catch(() => setLoadError("Transaction confirmed. The record could not refresh yet; retry to see the latest state."));
    } catch (e) {
      setToast({ kind: "err", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!session && !browsing) return joining
    ? <Onboard onSession={adoptSession} onBrowse={() => setBrowsing(true)} onBack={() => setJoining(false)} />
    : <Landing onStart={() => setJoining(true)} onBrowse={() => setBrowsing(true)} />;
  const signIn = () => { setJoining(true); setBrowsing(false); };
  const infoName = route.slice(2);
  const isInfo = infoRoutes.includes(infoName);
  const callRoute = /^#\/call\/\d+$/.test(route);
  const callerRoute = route.startsWith("#/caller/") && isAddress(route.slice(9));
  const invalidRoute = route.startsWith("#/") && !callRoute && !callerRoute && !isInfo;

  return (
    <div className="shell">
      <a className="skip" href="#workspace">Skip to content</a>
      <header className="top">
        <button className="wordmark home-button" onClick={() => { setBrowsing(false); setJoining(false); go(""); }} aria-label="Upside home"><BrandMark />Upside</button>
        <div className="ticker" title="Order-book mid, pushed by the keeper">
          {BASE_SYMBOL}/{QUOTE_SYMBOL}{" "}
          <b>{mid ? humanPrice(mid).toFixed(4) : "—"}</b>
          {!mid && <span className="warn"> stale</span>}
        </div>
        {session ? (
          <button className="chip" disabled={busy} onClick={() => (session.end(), adoptSession(null), setBrowsing(false))} title="Switch account">
            {session.label.split(" ")[0]} · {short(session.account.address)}
          </button>
        ) : (
          <button className="chip" onClick={signIn}>
            Sign in
          </button>
        )}
      </header>

      <main id="workspace" tabIndex={-1}>
        {isInfo && <InfoPage name={infoName} />}
        {invalidRoute && <StatePanel title="This page is off the map." text="The link does not point to a supported Upside page." action={() => go("")} label="Back to calls" />}
        {!isInfo && !invalidRoute && <div className="environment-strip"><span className="status-dot"/><span>{deployment.demo ? "Preview / test tokens only" : "Monad / onchain record"}</span><span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting to the record"}</span><a href="#/guide">Guide</a></div>}
        {!isInfo && !invalidRoute && loadError && <div className="connection-error" role="alert"><p>{loadError}</p><button className="ghost" onClick={() => refresh().catch(() => {})}>Retry connection</button></div>}
        {!route.startsWith("#/") && <div className="workspace-heading"><p className="eyebrow">{({ feed: "01 / Find your conviction", post: "02 / Make it a commitment", portfolio: "03 / Stay in control", board: "04 / Evidence over attention" })[tab]}</p><h1>{({ feed: "The call sheet.", post: "Put it on record.", portfolio: "Your vault. Your upside.", board: "A following is earned." })[tab]}</h1><p className="sub">{({ feed: "Find a thesis. Inspect its author. Make your own move.", post: "A clear thesis, committed before the outcome.", portfolio: "See your exposure, your positions, and what a caller has earned.", board: "Scored commitments, including the ones that missed." })[tab]}</p></div>}
        {!isInfo && !invalidRoute && !loadError && loading && <div className="skeleton-stack" role="status" aria-label="Loading the onchain record"><div/><div/><span>Reading the onchain record…</span></div>}
        {callRoute && !loading && !loadError && (
          <Detail>
            <Feed
              emptyTitle="That call is not on this record."
              emptyText="Check the call ID or return to the full call sheet."
              calls={calls.filter((c) => String(c.id) === route.slice(7))}
              stats={stats}
              mid={mid}
              vault={vault}
              vs={vs}
              session={session}
              signIn={signIn}
              busy={busy || !!loadError}
              run={run}
            />
          </Detail>
        )}
        {callerRoute && !loading && !loadError && (
          <Detail>
            <CallerProfile address={route.slice(9) as Address} stats={stats} />
            <Feed
              emptyTitle="No calls from this address yet."
              emptyText="When this address posts a call, its full record will appear here."
              calls={calls.filter((c) => c.caller.toLowerCase() === route.slice(9).toLowerCase())}
              stats={stats}
              mid={mid}
              vault={vault}
              vs={vs}
              session={session}
              signIn={signIn}
              busy={busy || !!loadError}
              run={run}
            />
          </Detail>
        )}
        {!route.startsWith("#/") && tab === "feed" && !loading && !loadError && (
          <Feed calls={calls} stats={stats} mid={mid} vault={vault} vs={vs} session={session} signIn={signIn} busy={busy || !!loadError} run={run} />
        )}
        {!route.startsWith("#/") && tab === "post" && !loading &&
          (session ? <Post session={session} mid={mid} stats={stats} busy={busy || !!loadError} run={run} /> : <SignInPrompt signIn={signIn} what="post a call" />)}
        {!route.startsWith("#/") && tab === "portfolio" && !loading && (
          session ? (
            <Portfolio session={session} vault={vault} vs={vs} mid={mid} calls={calls} stats={stats} busy={busy || !!loadError} run={run} />
          ) : (
            <SignInPrompt signIn={signIn} what="see your portfolio" />
          )
        )}
        {!route.startsWith("#/") && tab === "board" && !loading && !loadError && <Board stats={stats} />}
      </main>
      <footer className="workspace-footer"><span>Upside / Good calls. Shared upside.</span><nav aria-label="Product resources"><a href="#/guide">Guide</a><a href="#/privacy">Privacy</a><a href="#/terms">Preview terms</a></nav></footer>

      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>
          <button className="toast-dismiss" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
          {toast.text}
          {toast.hash &&
            (EXPLORER ? (
              <a href={`${EXPLORER}/tx/${toast.hash}`} target="_blank" rel="noreferrer">
                {" "}
                view tx
              </a>
            ) : (
              <span className="mono"> {short(toast.hash)}</span>
            ))}
        </div>
      )}

      <nav className="tabs" aria-label="Workspace">
        {(
          [
            ["feed", "Calls"],
            ["post", "Create"],
            ["portfolio", "Vault"],
            ["board", "Record"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} aria-current={tab === t && !route.startsWith("#/") ? "page" : undefined} className={tab === t && !route.startsWith("#/") ? "on" : ""} onClick={() => (setTab(t), go(""))}>
            <span className="nav-number" aria-hidden="true">{({feed:"01",post:"02",portfolio:"03",board:"04"})[t]}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ----------------------------------------------------------------- onboarding

function Onboard({ onSession, onBrowse, onBack }: { onSession: (s: Session) => void; onBrowse: () => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async (fn: () => Promise<Session>) => {
    setBusy(true);
    setErr("");
    try {
      const s = await fn();
      await devFundGas(s.account.address);
      onSession(s);
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="shell onboard">
      <button className="back" disabled={busy} onClick={onBack}>Back to Upside</button>
      <div className="hero">
        <BrandMark className="onboard-mark" />
        <p className="eyebrow">Your account</p>
        <h1>Start with your<br />own account.</h1>
        <p className="lede">Sign in with a passkey. Your account controls your vault.</p>
        <ul className="points">
          <li>Every call is committed on Monad before the move. No deleting losers.</li>
          <li>Callers earn a share of your net gains. Still down with them? They get nothing.</li>
          <li>Inspect committed calls and scored outcomes before you follow.</li>
        </ul>
      </div>
      <div className="card">
        <label className="field">
          <span>Display name</span>
          <input autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" />
          <small>Choose your public onchain handle from your vault after funding.</small>
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const s = await createPasskeyAccount(name || "Upside user");
              await devFundGas(s.account.address);
              return s;
            })
          }
        >
          Create account with a passkey
        </button>
        {(
          <button className="ghost" disabled={busy} onClick={() => start(signInWithPasskey)}>
            Sign in with your passkey
          </button>
        )}
        <p className="fine">{hasPasskey() ? "A passkey was previously used on this browser. " : ""}Use a passkey provider with PRF support. Keep access to your original passkey.</p>
        {busy && <p role="status" className="fine">Waiting for your passkey provider…</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      {IS_LOCAL && (
        <div className="card dev">
          <div className="dev-title">Local demo accounts</div>
          {DEV_ACCOUNTS.map((a, i) => (
            <button key={a.label} className="ghost" disabled={busy} onClick={() => onSession(devSession(i))}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button className="back center-btn" onClick={onBrowse}>
        Just browse calls
      </button>
      <p className="fine center">
        Chain {deployment.chainId}
        {deployment.demo ? " · demo venue (test tokens)" : ""}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- feed

type Runner = (label: string, fn: () => Promise<string | void>) => Promise<void>;

function CallerBadge({ s }: { s?: CallerStats }) {
  if (!s) return null;
  return (
    <span className={`badge ${s.verified ? "ok" : "muted"}`} title={deployment.demo ? "Current test attestation from the demo gate" : "Current gate attestation; not a guarantee of results"}>{s.verified ? (deployment.demo ? "Test verified" : "Verified") : "Unverified · earns $0"}</span>
  );
}

function Record({ s }: { s?: CallerStats }) {
  if (!s || s.scored === 0) return <span className="sub">No scored calls yet</span>;
  return (
    <span className="sub">
      <b className={s.avgReturnBps >= 0 ? "up" : "down"}>{pct(s.avgReturnBps)}</b> avg over {s.scored} scored ·{" "}
      {Math.round((s.wins / s.scored) * 100)}% hit
    </span>
  );
}

function Feed(props: {
  calls: Call[];
  stats: Map<Address, CallerStats>;
  mid: bigint | null;
  vault: Address | null;
  vs: VaultState | null;
  session: Session | null;
  signIn: () => void;
  busy: boolean;
  run: Runner;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const { calls, stats, mid, session, busy, run } = props;
  const now = useNow();
  const [amount, setAmount] = useState("50");
  const [filter, setFilter] = useState<"all" | "live" | "scored">("all");
  const [query, setQuery] = useState("");
  const shown = calls.filter(c => (filter === "all" || (filter === "live" ? !c.scored && c.expiry > now : c.scored)) && `${nameOf(c.caller)} ${c.caller} ${c.id}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (!calls.length) return <StatePanel title={props.emptyTitle ?? "The next call is still unwritten."} text={props.emptyText ?? "Committed calls will appear here with their full record. Explore the guide or sign in to create the first one."} />;

  return (
    <div className="feed-layout">
      <div className="feed-toolbar">
        <div className="filter-group" role="group" aria-label="Filter calls">{(["all", "live", "scored"] as const).map(f => <button key={f} className={`pill ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{({all:"All calls",live:"Live",scored:"Scored"})[f]}</button>)}</div>
        <label className="search-field"><span className="sr-only">Search calls by handle, address or ID</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a caller or call…" /></label>
      </div>
      <div className="amount-row">
        <span>Follow size</span>
        {["20", "50", "100"].map((v) => (
          <button key={v} aria-pressed={amount === v} className={`pill ${amount === v ? "on" : ""}`} onClick={() => setAmount(v)}>
            ${v}
          </button>
        ))}
      </div>
      {!shown.length && <StatePanel title="Nothing in this view yet." text="Try another filter or search." action={() => { setQuery(""); setFilter("all"); }} label="Show all calls" />}
      <div className="call-grid">
      {shown.map((c) => {
        const s = stats.get(c.caller);
        const active = !c.scored && c.expiry > now;
        const live = mid && !c.scored ? Number(((mid - c.entryMid) * 10000n) / c.entryMid) * (c.side === 0 ? 1 : -1) : null;
        return (
          <article key={c.id} className={`call ${active ? "" : "done"}`}>
            <div className="call-label"><span>CALL / {String(c.id).padStart(3,"0")}</span><span className={`call-status ${active ? "live" : ""}`}>{c.scored ? "Scored" : active ? "Live thesis" : "Awaiting score"}</span></div>
            <div className="row">
              <div className="caller-identity">
                <WalletGlyph address={c.caller} />
                <div>
                <div className="who">
                  <a className="link" href={`#/caller/${c.caller}`}>
                    {nameOf(c.caller)}
                  </a>{" "}
                  <CallerBadge s={s} />
                  <NansenChip caller={c.caller} />
                </div>
                <Record s={s} />
                </div>
              </div>
              <div className="fee">
                {c.feeBps / 100}% of net gains
                <br />
                {c.followers} {c.followers === 1 ? "follower" : "followers"} · ${fmtQuote(c.followedVolume, 0)}
              </div>
            </div>
            <div className="thesis">
              <span className="long">{c.side === 0 ? "LONG" : "SHORT"}</span> {BASE_SYMBOL}/{QUOTE_SYMBOL} from <b>{humanPrice(c.entryMid).toFixed(4)}</b>
              <span className="lv"> target {humanPrice(c.targetMid).toFixed(4)}</span>
              <span className="lv"> stop {humanPrice(c.stopMid).toFixed(4)}</span>
            </div>
            <PerplBadge caller={c.caller} side={c.side} />
            <div className="row foot">
              <span className="sub">
                <a className="link" href={`#/call/${c.id}`}>
                  Call #{c.id}
                </a>{" "}
                · committed {new Date(c.postedAt * 1000).toLocaleTimeString()} ·{" "}
                {c.scored ? "scored" : countdown(c.expiry - now)}
              </span>
              {c.scored ? (
                <b className={c.returnBps >= 0 ? "up" : "down"}>{pct(c.returnBps)}</b>
              ) : (
                live !== null && <span className={live >= 0 ? "up" : "down"}>{pct(live)} now</span>
              )}
            </div>
            <button
              className="share"
              onClick={() =>
                share(
                  `Upside call #${c.id}`,
                  `${nameOf(c.caller)} called ${c.side === 0 ? "LONG" : "SHORT"} ${BASE_SYMBOL} at ${humanPrice(c.entryMid).toFixed(4)}, target ${humanPrice(c.targetMid).toFixed(4)}. Committed onchain; you only pay if you profit.`,
                  `#/call/${c.id}`,
                )
              }
            >
              Share
            </button>
            {active && c.side !== 0 && <p className="fine">Short calls are viewable; spot follows support long calls only.</p>}
            {active && c.side === 0 && !session && (
              <button className="primary" onClick={props.signIn}>
                Sign in to follow
              </button>
            )}
            {active && session && c.side === 0 && c.caller.toLowerCase() !== session.account.address.toLowerCase() && (
              <button
                className="primary"
                disabled={busy || !mid}
                onClick={() =>
                  run(`Following call #${c.id} with $${amount}`, async () => {
                    const amt = parseQuote(amount);
                    let v = props.vault;
                    if (!v) v = await ensureVault(session, parseQuote("500"));
                    const st = await getVaultState(v);
                    if (deployment.demo && st.cash < amt) await demoFaucet(session, v, parseQuote("500"));
                    return follow(session, v, c.id, amt, (await getMid()) ?? mid!);
                  })
                }
              >
                Follow ${amount}
              </button>
            )}
            {active && session && c.caller.toLowerCase() === session.account.address.toLowerCase() && <p className="fine">Your own call · inspect how it performs in your public record.</p>}
          </article>
        );
      })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- post

function Post(props: { session: Session; mid: bigint | null; stats: Map<Address, CallerStats>; busy: boolean; run: Runner }) {
  const { session, mid, busy, run } = props;
  const [target, setTarget] = useState("3");
  const [stop, setStop] = useState("2");
  const [fee, setFee] = useState("20");
  const [horizon, setHorizon] = useState(300);
  const me = props.stats.get(session.account.address);
  const m = mid ? humanPrice(mid) : 0;
  const t = m * (1 + Number(target) / 100);
  const s = m * (1 - Number(stop) / 100);
  const validation = !target.trim() || !Number.isFinite(Number(target)) || Number(target) <= 0 ? "Enter a target greater than 0%."
    : !stop.trim() || !Number.isFinite(Number(stop)) || Number(stop) <= 0 || Number(stop) >= 100 ? "Enter a stop between 0% and 100%."
    : !fee.trim() || !Number.isFinite(Number(fee)) || Number(fee) < 0 || Number(fee) > 30 ? "Enter a performance fee from 0% to 30%." : "";

  return (
    <div className="card form">
      <h2>Post a call</h2>
      <p className="sub">
        Your call is committed onchain and scored against the market mid when scored after expiry. Losers count.
      </p>
      {me && !me.verified && (
        <p className="notice">
          You can post but won't rank or earn fees without a current gate attestation.{deployment.demo ? " This preview uses test attestations." : " Production verification requires the configured verification service."}
        </p>
      )}
      <div className="thesis big">
        <span className="long">LONG</span> {BASE_SYMBOL}/{QUOTE_SYMBOL} at {m ? m.toFixed(4) : "—"}
      </div>
      <div className="grid2">
        <label className="field">
          <span>Target +%</span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          <small>{t ? t.toFixed(4) : ""}</small>
        </label>
        <label className="field">
          <span>Stop −%</span>
          <input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
          <small>{s ? s.toFixed(4) : ""}</small>
        </label>
        <label className="field">
          <span>Your fee, % of net gains</span>
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          <small>max 30%</small>
        </label>
        <label className="field">
          <span>Scored after</span>
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={120}>2 minutes (demo)</option>
            <option value={300}>5 minutes</option>
            <option value={3600}>1 hour</option>
            <option value={86400}>1 day</option>
            <option value={604800}>1 week</option>
          </select>
        </label>
      </div>
      <p className="fine">Target and stop levels describe your thesis. They do not trigger an automatic close.</p>
      {!mid && <p className="notice">Waiting for a fresh price before this call can be committed.</p>}
      {validation && <p className="error" role="alert">{validation}</p>}
      <button
        className="primary"
        disabled={busy || !mid || !!validation}
        onClick={() =>
          run("Committing your call", () =>
            postCall(session, { target: t, stop: s, feeBps: Math.round(Number(fee) * 100), horizonSec: horizon }),
          )
        }
      >
        Commit call onchain
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- portfolio

function Portfolio(props: {
  session: Session;
  vault: Address | null;
  vs: VaultState | null;
  mid: bigint | null;
  calls: Call[];
  stats: Map<Address, CallerStats>;
  busy: boolean;
  run: Runner;
}) {
  const { session, vault, vs, mid, calls, stats, busy, run } = props;
  const [limit, setLimit] = useState("500");
  const [editingLimit, setEditingLimit] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const validLimit = limit.trim() !== "" && /^\d+(\.\d{1,6})?$/.test(limit) && Number(limit) > 0;
  const callById = useMemo(() => new Map(calls.map((c) => [c.id, c])), [calls]);

  if (!vault || !vs)
    return (
      <div className="card form">
        <h2>Your vault</h2>
        <p className="sub">
          Follows run through your own vault on Monad. Only you can trade or withdraw. Callers are paid by the vault, and
          only from your net gains with them.
        </p>
        <label className="field">
          <span>Exposure limit ({QUOTE_SYMBOL})</span>
          <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          <small>The vault refuses any follow that would put more than this at risk.</small>
        </label>
        <button className="primary" disabled={busy || !validLimit} onClick={() => run("Creating your vault", async () => {
          const v = await ensureVault(session, parseQuote(limit));
          if (deployment.demo) await demoFaucet(session, v, parseQuote("500"));
        })}>
          Create vault{deployment.demo ? " + 500 test AUSD" : ""}
        </button>
        {!validLimit && <p className="error" role="alert">Enter a positive amount with up to 6 decimals.</p>}
      </div>
    );

  const open = vs.positions.filter((p) => p.open);
  const closed = vs.positions.filter((p) => !p.open);
  const used = Number(vs.openCost) / Math.max(1, Number(vs.maxExposure));

  return (
    <div className="list portfolio-list">
      <HandleCard key={session.account.address + (HANDLES.get(session.account.address.toLowerCase()) ?? "")} session={session} run={run} busy={busy} />
      <div className="card">
        <div className="row">
          <div>
            <div className="sub">Cash in vault</div>
            <div className="big-num">${fmtQuote(vs.cash)}</div>
          </div>
          <div className="right">
            <div className="sub">At risk</div>
            <div>
              ${fmtQuote(vs.openCost)} / ${fmtQuote(vs.maxExposure, 0)}
            </div>
          </div>
        </div>
        <div className="meter" role="meter" aria-label="Exposure used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, used * 100))}>
          <div style={{ width: `${Math.min(100, used * 100)}%` }} className={used > 0.8 ? "hot" : ""} />
        </div>
        <div className="row actions">
          {deployment.demo && (
            <button className="ghost" disabled={busy} onClick={() => run("Adding 500 test AUSD", () => demoFaucet(session, vault, parseQuote("500")))}>
              + 500 test AUSD
            </button>
          )}
          <button
            className="ghost"
            disabled={busy}
            onClick={() => { setLimit(fmtQuote(vs.maxExposure, 0)); setEditingLimit(!editingLimit); }}
          >
            Exposure limit
          </button>
        </div>
        {editingLimit && <div className="inline-editor"><label className="field"><span>Exposure limit ({QUOTE_SYMBOL})</span><input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} /></label><button className="primary" disabled={busy || !validLimit || (validLimit && parseQuote(limit) < vs.openCost)} onClick={() => run("Updating exposure limit", async () => { const hash = await setExposure(session, vault, parseQuote(limit)); setEditingLimit(false); return hash; })}>Save exposure limit</button><p className="fine">The limit must cover the original cost of open follows. It does not guarantee a maximum loss.</p></div>}
        <details className="vault-access"><summary>Fund or withdraw your vault</summary><p className="fine">Deposit {QUOTE_SYMBOL} on this network to the vault address. MON is needed in your account for gas.</p><div className="address-block"><span>Vault address</span><code>{vault}</code><button className="share" onClick={() => navigator.clipboard.writeText(vault).then(() => window.dispatchEvent(new CustomEvent("upside:notice", { detail:"Vault address copied." }))).catch(() => setToastNotice("Clipboard unavailable. Select and copy the address above."))}>Copy address</button></div><label className="field"><span>Withdraw available {QUOTE_SYMBOL} to your account</span><input inputMode="decimal" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Amount" /></label><button className="ghost" disabled={busy || !/^\d+(\.\d{1,6})?$/.test(withdrawAmount) || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > Number(fmtQuote(vs.cash,6))} onClick={() => run("Withdrawing available cash", async () => { const hash = await withdrawCash(session, vault, parseQuote(withdrawAmount)); setWithdrawAmount(""); return hash; })}>Withdraw to my account</button></details>
      </div>

      <h3>Open</h3>
      {!open.length && <Empty text="No open follows." />}
      {open.map((p) => {
        const c = callById.get(p.callId);
        const st = stats.get(p.caller);
        const rel = vs.pnl.get(p.caller) ?? { net: 0n, hwm: 0n };
        const pv = mid && c ? previewFee(p, mid, c.feeBps, rel.net, rel.hwm, !!st?.verified) : null;
        return (
          <article key={p.id} className="call">
            <div className="row">
              <div className="who">
                {nameOf(p.caller)} · call #{p.callId} <CallerBadge s={st} />
              </div>
              {pv && (
                <b className={pv.pnl >= 0n ? "up" : "down"}>
                  {pv.pnl >= 0n ? "+" : "−"}${fmtQuote(pv.pnl < 0n ? -pv.pnl : pv.pnl)}
                </b>
              )}
            </div>
            <div className="sub">
              {fmtBase(p.baseAmount)} {BASE_SYMBOL} for ${fmtQuote(p.cost)}
            </div>
            {pv && (
              <div className="feebox">
                {pv.fee > 0n ? (
                  <>
                    Estimated performance fee: <b>${fmtQuote(pv.fee)}</b> on gains above your previous peak. The protocol receives its configured share of this fee.
                  </>
                ) : pv.stillDown ? (
                  <>Close now: you are below your previous peak with {nameOf(p.caller)}, so there is no new performance fee.</>
                ) : (
                  <>Close now: caller earns $0{st?.verified ? "" : " (unverified)"}.</>
                )}
              </div>
            )}
            <p className="fine">Estimated at the current mid. Execution price, fees, and gas may change the result.</p>
            <button
              className="primary"
              disabled={busy || !mid}
              onClick={() => run(`Closing follow #${p.id}`, async () => closePosition(session, vault, p, (await getMid()) ?? mid!))}
            >
              Close and settle
            </button>
          </article>
        );
      })}

      {!!closed.length && <h3>Closed</h3>}
      {closed.map((p) => (
        <div key={p.id} className="closed-row">
          <span>
            {nameOf(p.caller)} · call #{p.callId}
          </span>
          <span className="sub">${fmtQuote(p.cost)} in</span>
        </div>
      ))}
      {[...vs.pnl.entries()].length > 0 && (
        <div className="card">
          <div className="sub">Net with each caller (fees only above the high-water mark)</div>
          {[...vs.pnl.entries()].map(([c, r]) => (
            <div key={c} className="row">
              <span>{nameOf(c)}</span>
              <span className={r.net >= 0n ? "up" : "down"}>
                {r.net >= 0n ? "+" : "−"}${fmtQuote(r.net < 0n ? -r.net : r.net)}{" "}
                <span className="sub">peak ${fmtQuote(r.hwm)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- leaderboard

function Board({ stats }: { stats: Map<Address, CallerStats> }) {
  const all = [...stats.values()];
  const ranked = all
    .filter((s) => s.verified && s.scored > 0)
    .sort((a, b) => b.avgReturnBps * Math.sqrt(b.scored) - a.avgReturnBps * Math.sqrt(a.scored));
  const unranked = all.filter((s) => !s.verified || s.scored === 0);
  return (
    <div className="list">
      <div className="card">
        <h2>Leaders</h2>
        <p className="sub">
          Verified callers only, ranked by average return of committed calls (weighted by how many were scored). Follower
          count and reviews are not inputs.
        </p>
      </div>
      {!ranked.length && <Empty text="No scored calls from verified callers yet." />}
      {ranked.map((s, i) => (
        <a key={s.address} className="leader link" href={`#/caller/${s.address}`}>
          <span className="rank">{i + 1}</span>
          <span className="who"><WalletGlyph address={s.address} />{nameOf(s.address)}</span>
          <span className={s.avgReturnBps >= 0 ? "up" : "down"}>{pct(s.avgReturnBps)}</span>
          <span className="sub">
            {s.scored} {s.scored === 1 ? "call" : "calls"} · {Math.round((s.wins / s.scored) * 100)}% hit
          </span>
        </a>
      ))}
      {!!unranked.length && <h3>Not ranked</h3>}
      {unranked.map((s) => (
        <a key={s.address} className="leader muted link" href={`#/caller/${s.address}`}>
          <span className="rank">–</span>
          <span className="who">{nameOf(s.address)}</span>
          <span className="sub">{s.verified ? "no scored calls yet" : "unverified"}</span>
        </a>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><BrandMark /><p>{text}</p><a href="#/guide">Read the guide</a></div>;
}

function setToastNotice(text: string) { window.dispatchEvent(new CustomEvent("upside:notice", { detail: text })); }
function StatePanel({ title, text, action, label }: { title: string; text: string; action?: () => void; label?: string }) {
  return <section className="state-panel"><BrandMark /><h2>{title}</h2><p>{text}</p>{action ? <button className="ghost" onClick={action}>{label}</button> : <a className="text-link" href="#/guide">Read the guide</a>}</section>;
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <div className="detail-stack">
      <button className="back" onClick={() => go("")}>
        Back
      </button>
      {children}
    </div>
  );
}

function CallerProfile({ address, stats }: { address: Address; stats: Map<Address, CallerStats> }) {
  const s = [...stats.values()].find((x) => x.address.toLowerCase() === address.toLowerCase());
  return (
    <div className="card profile">
      <div className="row">
        <div className="caller-identity"><WalletGlyph address={address} /><div>
          <h2>{nameOf(address)}</h2>
          <div className="sub mono">{short(address)}</div>
        </div></div>
        <CallerBadge s={s} />
      </div>
      {s && (
        <div className="stats">
          <div>
            <b className={s.avgReturnBps >= 0 ? "up" : "down"}>{s.scored ? pct(s.avgReturnBps) : "—"}</b>
            <span>avg return</span>
          </div>
          <div>
            <b>{s.scored ? `${Math.round((s.wins / s.scored) * 100)}%` : "—"}</b>
            <span>hit rate</span>
          </div>
          <div>
            <b>{s.posted}</b>
            <span>calls posted</span>
          </div>
        </div>
      )}
      <NansenLabels caller={address} />
      <PerplBadge caller={address} side={0} profile />
      <p className="sub">Every call this address ever posted is below, losers included. Calls cannot be deleted.</p>
      <button
        className="ghost"
        onClick={() =>
          share(
            `${nameOf(address)} on Upside`,
            `${nameOf(address)}: full, undeletable trading record on Upside.`,
            `#/caller/${address}`,
          )
        }
      >
        Share profile
      </button>
    </div>
  );
}

function HandleCard({ session, run, busy }: { session: Session; run: Runner; busy: boolean }) {
  const current = HANDLES.get(session.account.address.toLowerCase());
  const [v, setV] = useState(current ?? "");
  return (
    <div className="card">
      <div className="sub">Public handle</div>
      <div className="row handle-row">
        <input aria-label="Public handle" className="inline" maxLength={20} value={v} onChange={(e) => setV(toHandle(e.target.value))} placeholder="your_handle" />
        <button
          className="ghost"
          disabled={busy || v.length < 3 || v === current}
          onClick={() => run("Saving handle", () => setHandle(session, v))}
        >
          Save
        </button>
      </div>
      <p className="fine">3–20 lowercase letters, numbers, or underscores. Saved publicly onchain.</p>
    </div>
  );
}

function SignInPrompt({ signIn, what }: { signIn: () => void; what: string }) {
  return (
    <div className="card form">
      <h2>Sign in to {what}</h2>
      <p className="sub">A passkey creates your Monad account in seconds. No seed phrase.</p>
      <button className="primary" onClick={signIn}>
        Sign in
      </button>
    </div>
  );
}

/** Whether the caller holds the same trade on Perpl right now, read from Perpl's Exchange contract. */
function PerplBadge({ caller, side, profile }: { caller: Address; side: number; profile?: boolean }) {
  if (!perplEnabled) return null;
  const key = caller.toLowerCase();
  if (!PERPL.has(key)) return null; // not loaded or unknown
  const p = PERPL.get(key);
  if (!p)
    return profile ? <div className="perpl none">No MON position on Perpl right now</div> : null;
  const sameWay = (p.side === "long") === (side === 0);
  const size = p.size >= 1000 ? `${(p.size / 1000).toFixed(1)}k` : p.size.toFixed(0);
  return (
    <a className={`perpl ${sameWay ? "aligned" : "against"}`} href={perplUrl} target="_blank" rel="noreferrer">
      {sameWay ? "Skin in the game: " : "Warning: "}
      {p.side} {size} MON on Perpl from {p.entry.toFixed(4)}
      <span className={p.pnlPct >= 0 ? "up" : "down"}>
        {" "}
        ({p.pnlPct >= 0 ? "+" : ""}
        {p.pnlPct.toFixed(1)}%)
      </span>
      {!sameWay && !profile && " · opposite of this call"}
    </a>
  );
}

/** Compact Nansen chip next to a caller's name: their Smart Money label, if any. */
function NansenChip({ caller }: { caller: Address }) {
  const n = NANSEN.get(caller.toLowerCase());
  if (!n || !n.labels.length) return null;
  const top = n.labels.find((l) => /smart|fund|trader/i.test(l)) ?? n.labels[0];
  return (
    <span className="badge nansen" title={`Nansen: ${n.labels.join(", ")}`}>
      Nansen · {top}
    </span>
  );
}

function NansenLabels({ caller }: { caller: Address }) {
  const n = NANSEN.get(caller.toLowerCase());
  if (!n || !n.labels.length) return null;
  return (
    <div className="nansen-labels">
      <span className="sub">Nansen labels</span>
      {n.labels.slice(0, 6).map((l) => (
        <span key={l} className="badge nansen">
          {l}
        </span>
      ))}
    </div>
  );
}
