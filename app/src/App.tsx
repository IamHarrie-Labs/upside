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

type Tab = "feed" | "post" | "portfolio" | "board";
type VaultState = Awaited<ReturnType<typeof getVaultState>>;
type Toast = { kind: "info" | "ok" | "err"; text: string; hash?: string } | null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number, digits = 1) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(digits)}%`;
const NAMES: Record<string, string> = {
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "Ada",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": "Sybil Farm",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906": "Femi",
};
const nameOf = (a: string) => NAMES[a.toLowerCase()] ?? short(a);

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
  const [tab, setTab] = useState<Tab>("feed");
  const [mid, setMid] = useState<bigint | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Map<Address, CallerStats>>(new Map());
  const [vault, setVault] = useState<Address | null>(null);
  const [vs, setVs] = useState<VaultState | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [m, cs] = await Promise.all([getMid(), getCalls()]);
    setMid(m);
    setCalls(cs);
    setStats(await getCallerStats(cs.map((c) => c.caller)));
    if (session) {
      const v = await getVault(session.account.address);
      setVault(v);
      setVs(v ? await getVaultState(v) : null);
    }
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

  if (!session) return <Onboard onSession={setSession} />;

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
        <button className="chip" onClick={() => (session.end(), setSession(null))} title="Switch account">
          {session.label.split(" ")[0]} · {short(session.account.address)}
        </button>
      </header>

      <main>
        {tab === "feed" && (
          <Feed calls={calls} stats={stats} mid={mid} vault={vault} vs={vs} session={session} busy={busy} run={run} />
        )}
        {tab === "post" && <Post session={session} mid={mid} stats={stats} busy={busy} run={run} />}
        {tab === "portfolio" && (
          <Portfolio session={session} vault={vault} vs={vs} mid={mid} calls={calls} stats={stats} busy={busy} run={run} />
        )}
        {tab === "board" && <Board stats={stats} />}
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
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ----------------------------------------------------------------- onboarding

function Onboard({ onSession }: { onSession: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<Session>) => {
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Femi" />
        </label>
        <button className="primary" disabled={busy} onClick={() => go(() => createPasskeyAccount(name || "Upside user"))}>
          Create account with a passkey
        </button>
        {hasPasskey() && (
          <button className="ghost" disabled={busy} onClick={() => go(signInWithPasskey)}>
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
  session: Session;
  busy: boolean;
  run: Runner;
}) {
  const { calls, stats, mid, session, busy, run } = props;
  const now = useNow();
  const [amount, setAmount] = useState("50");
  if (!calls.length) return <Empty text="No calls yet. Post the first one." />;

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
                  {nameOf(c.caller)} <CallerBadge s={s} />
                </div>
                <Record s={s} />
              </div>
              <div className="fee">{c.feeBps / 100}% of net gains</div>
            </div>
            <div className="thesis">
              <span className="long">LONG</span> {BASE_SYMBOL}/{QUOTE_SYMBOL} from <b>{humanPrice(c.entryMid).toFixed(4)}</b>
              <span className="lv"> target {humanPrice(c.targetMid).toFixed(4)}</span>
              <span className="lv"> stop {humanPrice(c.stopMid).toFixed(4)}</span>
            </div>
            <div className="row foot">
              <span className="sub">
                Call #{c.id} · committed {new Date(c.postedAt * 1000).toLocaleTimeString()} ·{" "}
                {c.scored ? "scored" : countdown(c.expiry - now)}
              </span>
              {c.scored ? (
                <b className={c.returnBps >= 0 ? "up" : "down"}>{pct(c.returnBps)}</b>
              ) : (
                live !== null && <span className={live >= 0 ? "up" : "down"}>{pct(live)} now</span>
              )}
            </div>
            {active && c.caller.toLowerCase() !== session.account.address.toLowerCase() && (
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
