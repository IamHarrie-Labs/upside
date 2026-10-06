import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
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
  type Call,
  type CallerStats,
} from "./lib/upside";
import { deployment, EXPLORER, IS_LOCAL } from "./env";
import { getPerplPositions, perplEnabled, perplUrl, type PerplPosition } from "./lib/perpl";

type Tab = "feed" | "post" | "portfolio" | "board";
type VaultState = Awaited<ReturnType<typeof getVaultState>>;
type Toast = { kind: "info" | "ok" | "err"; text: string; hash?: string } | null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number, digits = 1) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(digits)}%`;
// Public handles from the Handles contract, refreshed with the rest of the state.
let HANDLES = new Map<string, string>();
// Callers' current MON positions on Perpl (null = none), refreshed with the rest of the state.
let PERPL = new Map<string, PerplPosition | null>();
const nameOf = (a: string) => {
  const h = HANDLES.get(a.toLowerCase());
  return h ? `@${h}` : short(a);
};
const go = (hash: string) => (location.hash = hash);

async function share(title: string, text: string, hash: string) {
  const url = `${location.origin}${location.pathname}${hash}`;
  try {
    if (navigator.share) return await navigator.share({ title, text, url });
    await navigator.clipboard.writeText(`${text} ${url}`);
    alert("Link copied");
  } catch {
    // user cancelled
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
  const [tab, setTab] = useState<Tab>("feed");
  const [mid, setMid] = useState<bigint | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Map<Address, CallerStats>>(new Map());
  const [vault, setVault] = useState<Address | null>(null);
  const [vs, setVs] = useState<VaultState | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState(location.hash);
  const [, setHandleTick] = useState(0);

  useEffect(() => {
    const on = () => (setRoute(location.hash), window.scrollTo(0, 0));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  const refresh = useCallback(async () => {
    const [m, cs] = await Promise.all([getMid(), getCalls()]);
    setMid(m);
    setCalls(cs);
    setStats(await getCallerStats(cs.map((c) => c.caller)));
    let state: VaultState | null = null;
    if (session) {
      const v = await getVault(session.account.address);
      setVault(v);
      state = v ? await getVaultState(v) : null;
      setVs(state);
    }
    HANDLES = await getHandles([
      ...cs.map((c) => c.caller),
      ...(session ? [session.account.address] : []),
      ...(state ? state.positions.map((p) => p.caller) : []),
    ]);
    PERPL = await getPerplPositions(cs.map((c) => c.caller));
    setHandleTick((t) => t + 1);
  }, [session]);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    setToast({ kind: "info", text: label });
    try {
      const hash = await fn();
      setToast({ kind: "ok", text: `${label} — done`, hash: hash || undefined });
      await refresh();
    } catch (e) {
      setToast({ kind: "err", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!session && !browsing) return <Onboard onSession={setSession} onBrowse={() => setBrowsing(true)} />;
  const signIn = () => setBrowsing(false);

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo">▲</span> Upside
        </div>
        <div className="ticker" title="Order-book mid, pushed by the keeper">
          {BASE_SYMBOL}/{QUOTE_SYMBOL}{" "}
          <b>{mid ? humanPrice(mid).toFixed(4) : "—"}</b>
          {!mid && <span className="warn"> stale</span>}
        </div>
        {session ? (
          <button className="chip" onClick={() => (session.end(), setSession(null), setBrowsing(false))} title="Switch account">
            {session.label.split(" ")[0]} · {short(session.account.address)}
          </button>
        ) : (
          <button className="chip" onClick={signIn}>
            Sign in
          </button>
        )}
      </header>

      <main>
        {route.startsWith("#/call/") && (
          <Detail>
            <Feed
              calls={calls.filter((c) => String(c.id) === route.slice(7))}
              stats={stats}
              mid={mid}
              vault={vault}
              vs={vs}
              session={session}
              signIn={signIn}
              busy={busy}
              run={run}
            />
          </Detail>
        )}
        {route.startsWith("#/caller/") && (
          <Detail>
            <CallerProfile address={route.slice(9) as Address} stats={stats} />
            <Feed
              calls={calls.filter((c) => c.caller.toLowerCase() === route.slice(9).toLowerCase())}
              stats={stats}
              mid={mid}
              vault={vault}
              vs={vs}
              session={session}
              signIn={signIn}
              busy={busy}
              run={run}
            />
          </Detail>
        )}
        {!route.startsWith("#/") && tab === "feed" && (
          <Feed calls={calls} stats={stats} mid={mid} vault={vault} vs={vs} session={session} signIn={signIn} busy={busy} run={run} />
        )}
        {!route.startsWith("#/") && tab === "post" &&
          (session ? <Post session={session} mid={mid} stats={stats} busy={busy} run={run} /> : <SignInPrompt signIn={signIn} what="post a call" />)}
        {!route.startsWith("#/") && tab === "portfolio" && (
          session ? (
            <Portfolio session={session} vault={vault} vs={vs} mid={mid} calls={calls} stats={stats} busy={busy} run={run} />
          ) : (
            <SignInPrompt signIn={signIn} what="see your portfolio" />
          )
        )}
        {!route.startsWith("#/") && tab === "board" && <Board stats={stats} />}
      </main>

      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
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

      <nav className="tabs">
        {(
          [
            ["feed", "Calls"],
            ["post", "Post"],
            ["portfolio", "Portfolio"],
            ["board", "Leaders"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t && !route.startsWith("#/") ? "on" : ""} onClick={() => (setTab(t), go(""))}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ----------------------------------------------------------------- onboarding

function Onboard({ onSession, onBrowse }: { onSession: (s: Session) => void; onBrowse: () => void }) {
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
      <div className="hero">
        <div className="logo big">▲</div>
        <h1>Upside</h1>
        <p className="lede">Trading calls you only pay for when you profit.</p>
        <ul className="points">
          <li>Every call is committed on Monad before the move. No deleting losers.</li>
          <li>Callers earn a share of your net gains. Still down with them? They get nothing.</li>
          <li>Scores come from market prices, so fake followers can't buy a reputation.</li>
        </ul>
      </div>
      <div className="card">
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. femi" />
          <small>Becomes your public handle, e.g. @{toHandle(name) || "femi"}</small>
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const s = await createPasskeyAccount(name || "Upside user");
              await devFundGas(s.account.address);
              if (toHandle(name).length >= 3) setHandle(s, toHandle(name)).catch(() => {}); // needs gas; best effort
              return s;
            })
          }
        >
          Create account with a passkey
        </button>
        {hasPasskey() && (
          <button className="ghost" disabled={busy} onClick={() => start(signInWithPasskey)}>
            Sign in with your passkey
          </button>
        )}
        <p className="fine">No seed phrase. Your passkey derives your Monad account on this device (Mera).</p>
        {err && <p className="error">{err}</p>}
      </div>
      {IS_LOCAL && (
        <div className="card dev">
          <div className="dev-title">Local demo accounts</div>
          {DEV_ACCOUNTS.map((a, i) => (
            <button key={a.label} className="ghost" onClick={() => onSession(devSession(i))}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button className="back center-btn" onClick={onBrowse}>
        Just browse calls →
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
    <span className={`badge ${s.verified ? "ok" : "muted"}`}>{s.verified ? "Verified" : "Unverified · earns $0"}</span>
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
}) {
  const { calls, stats, mid, session, busy, run } = props;
  const now = useNow();
  const [amount, setAmount] = useState("50");
  if (!calls.length) return <Empty text="No calls here yet." />;

  return (
    <div className="list">
      <div className="amount-row">
        <span>Follow size</span>
        {["20", "50", "100"].map((v) => (
          <button key={v} className={`pill ${amount === v ? "on" : ""}`} onClick={() => setAmount(v)}>
            ${v}
          </button>
        ))}
      </div>
      {calls.map((c) => {
        const s = stats.get(c.caller);
        const active = !c.scored && c.expiry > now;
        const live = mid && !c.scored ? Number(((mid - c.entryMid) * 10000n) / c.entryMid) : null;
        return (
          <article key={c.id} className={`call ${active ? "" : "done"}`}>
            <div className="row">
              <div>
                <div className="who">
                  <a className="link" href={`#/caller/${c.caller}`}>
                    {nameOf(c.caller)}
                  </a>{" "}
                  <CallerBadge s={s} />
                </div>
                <Record s={s} />
              </div>
              <div className="fee">
                {c.feeBps / 100}% of net gains
                <br />
                {c.followers} {c.followers === 1 ? "follower" : "followers"} · ${fmtQuote(c.followedVolume, 0)}
              </div>
            </div>
            <div className="thesis">
              <span className="long">LONG</span> {BASE_SYMBOL}/{QUOTE_SYMBOL} from <b>{humanPrice(c.entryMid).toFixed(4)}</b>
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
                  `${nameOf(c.caller)} called LONG ${BASE_SYMBOL} at ${humanPrice(c.entryMid).toFixed(4)}, target ${humanPrice(c.targetMid).toFixed(4)}. Committed onchain; you only pay if you profit.`,
                  `#/call/${c.id}`,
                )
              }
            >
              Share
            </button>
            {active && !session && (
              <button className="primary" onClick={props.signIn}>
                Sign in to follow
              </button>
            )}
            {active && session && c.caller.toLowerCase() !== session.account.address.toLowerCase() && (
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
          </article>
        );
      })}
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

  return (
    <div className="card form">
      <h2>Post a call</h2>
      <p className="sub">
        Your call is committed onchain at this block and scored against the market mid when it expires. Losers count.
      </p>
      {me && !me.verified && (
        <p className="notice">
          You are not verified, so you can post but won't rank or earn fees. Verification uses a Cleanverse A-Pass.
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
      <button
        className="primary"
        disabled={busy || !mid}
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
        <button className="primary" disabled={busy} onClick={() => run("Creating your vault", async () => {
          const v = await ensureVault(session, parseQuote(limit));
          if (deployment.demo) await demoFaucet(session, v, parseQuote("500"));
        })}>
          Create vault{deployment.demo ? " + 500 test AUSD" : ""}
        </button>
      </div>
    );

  const open = vs.positions.filter((p) => p.open);
  const closed = vs.positions.filter((p) => !p.open);
  const used = Number(vs.openCost) / Math.max(1, Number(vs.maxExposure));

  return (
    <div className="list">
      <HandleCard session={session} run={run} busy={busy} />
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
        <div className="meter">
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
            onClick={() => {
              const v = prompt("New exposure limit (AUSD)", fmtQuote(vs.maxExposure, 0));
              if (v) run("Updating exposure limit", () => setExposure(session, vault, parseQuote(v)));
            }}
          >
            Exposure limit
          </button>
        </div>
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
                    Close now: caller earns <b>${fmtQuote(pv.fee)}</b> of your gain above your previous best with them.
                  </>
                ) : pv.stillDown ? (
                  <>Close now: you are still net down with {nameOf(p.caller)}, so they earn $0.</>
                ) : (
                  <>Close now: caller earns $0{st?.verified ? "" : " (unverified)"}.</>
                )}
              </div>
            )}
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
        <div key={s.address} className="leader">
          <span className="rank">{i + 1}</span>
          <span className="who">{nameOf(s.address)}</span>
          <span className={s.avgReturnBps >= 0 ? "up" : "down"}>{pct(s.avgReturnBps)}</span>
          <span className="sub">
            {s.scored} {s.scored === 1 ? "call" : "calls"} · {Math.round((s.wins / s.scored) * 100)}% hit
          </span>
        </div>
      ))}
      {!!unranked.length && <h3>Not ranked</h3>}
      {unranked.map((s) => (
        <div key={s.address} className="leader muted">
          <span className="rank">–</span>
          <span className="who">{nameOf(s.address)}</span>
          <span className="sub">{s.verified ? "no scored calls yet" : "unverified"}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <div className="list">
      <button className="back" onClick={() => go("")}>
        ← Back
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
        <div>
          <h2>{nameOf(address)}</h2>
          <div className="sub mono">{short(address)}</div>
        </div>
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
        <input className="inline" value={v} onChange={(e) => setV(toHandle(e.target.value))} placeholder="your_handle" />
        <button
          className="ghost"
          disabled={busy || v.length < 3 || v === current}
          onClick={() => run("Saving handle", () => setHandle(session, v))}
        >
          Save
        </button>
      </div>
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
