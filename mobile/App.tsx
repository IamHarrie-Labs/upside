import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar as RNStatusBar,
} from "react-native";
import type { Address } from "viem";
import { deployment, EXPLORER, IS_LOCAL, REFRESH_MS, WEB_URL } from "./src/env";
import { getPerplPositions, perplEnabled, perplUrl, type PerplPosition } from "./src/lib/perpl";
import { getNansen, type NansenInfo } from "./src/lib/nansen";
import {
  createPasskeyAccount,
  describeError,
  DEV_ACCOUNTS,
  devSession,
  hasPasskey,
  signInWithPasskey,
  type Session,
} from "./src/lib/account";
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
  getMid,
  getVault,
  getVaultState,
  humanPrice,
  parseQuote,
  postCall,
  previewFee,
  QUOTE_SYMBOL,
  setExposure,
  setHandle,
  toHandle,
  type Call,
  type CallerStats,
} from "./src/lib/upside";

// ----------------------------------------------------------------- theme

const C = {
  bg: "#0b0b10",
  panel: "#14141c",
  panel2: "#1b1b26",
  line: "#2a2a38",
  ink: "#f2f1f7",
  muted: "#9a99ad",
  accent: "#8b7bff",
  up: "#3ddc97",
  down: "#ff6b7a",
  warn: "#ffc857",
};

type Tab = "feed" | "post" | "portfolio" | "board";
type Route = { name: "tabs" } | { name: "call"; id: number } | { name: "caller"; address: Address };
type VaultState = Awaited<ReturnType<typeof getVaultState>>;
type Toast = { kind: "info" | "ok" | "err"; text: string; hash?: string } | null;
type Runner = (label: string, fn: () => Promise<string | void>) => Promise<void>;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number, digits = 1) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(digits)}%`;
let HANDLES = new Map<string, string>();
// Callers' current MON positions on Perpl (null = none), refreshed with the rest of the state.
let PERPL = new Map<string, PerplPosition | null>();
// Nansen labels per caller (Smart Money etc.), via the keeper.
let NANSEN = new Map<string, NansenInfo | null>();
const nameOf = (a: string) => {
  const h = HANDLES.get(a.toLowerCase());
  return h ? `@${h}` : short(a);
};

/** upside://call/3, upside://caller/0x…, or the web app's https://…/#/call/3 */
function parseRoute(url: string | null): Route {
  if (!url) return { name: "tabs" };
  const m = url.match(/(?:#\/|:\/\/)(call|caller)\/([^/?#]+)/);
  if (!m) return { name: "tabs" };
  return m[1] === "call" ? { name: "call", id: Number(m[2]) } : { name: "caller", address: m[2] as Address };
}

async function shareLink(text: string, hashPath: string) {
  const url = `${WEB_URL}/#/${hashPath}`;
  try {
    await Share.share(Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` });
  } catch {
    // cancelled
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

// ----------------------------------------------------------------- app

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [route, setRoute] = useState<Route>({ name: "tabs" });
  const [mid, setMid] = useState<bigint | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Map<Address, CallerStats>>(new Map());
  const [vault, setVault] = useState<Address | null>(null);
  const [vs, setVs] = useState<VaultState | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // Deep links: open straight to a call or caller, readable without an account.
  const url = Linking.useLinkingURL();
  useEffect(() => {
    const r = parseRoute(url);
    if (r.name !== "tabs") {
      setRoute(r);
      setBrowsing(true);
    }
  }, [url]);

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
    [PERPL, NANSEN] = await Promise.all([
      getPerplPositions(cs.map((c) => c.caller)),
      getNansen(cs.map((c) => c.caller)),
    ]);
    setTick((t) => t + 1);
  }, [session]);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const run: Runner = async (label, fn) => {
    setBusy(true);
    setToast({ kind: "info", text: label });
    try {
      const hash = await fn();
      setToast({ kind: "ok", text: `${label}: done`, hash: hash || undefined });
      await refresh();
    } catch (e) {
      setToast({ kind: "err", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const signIn = () => setBrowsing(false);
  const goHome = () => setRoute({ name: "tabs" });

  if (!session && !browsing)
    return (
      <Screen>
        <Onboard onSession={(s) => (setSession(s), setBrowsing(false))} onBrowse={() => setBrowsing(true)} />
      </Screen>
    );

  const feedProps = { stats, mid, vault, session, signIn, busy, run };
  const openCaller = (address: Address) => setRoute({ name: "caller", address });

  let body: ReactNode;
  if (route.name === "call") {
    body = (
      <>
        <Back onPress={goHome} />
        <Feed calls={calls.filter((c) => c.id === route.id)} {...feedProps} onCaller={openCaller} />
      </>
    );
  } else if (route.name === "caller") {
    body = (
      <>
        <Back onPress={goHome} />
        <CallerProfile address={route.address} stats={stats} />
        <Feed
          calls={calls.filter((c) => c.caller.toLowerCase() === route.address.toLowerCase())}
          {...feedProps}
          onCaller={openCaller}
        />
      </>
    );
  } else if (tab === "feed") {
    body = <Feed calls={calls} {...feedProps} onCaller={openCaller} />;
  } else if (tab === "post") {
    body = session ? (
      <Post session={session} mid={mid} stats={stats} busy={busy} run={run} />
    ) : (
      <SignInPrompt signIn={signIn} what="post a call" />
    );
  } else if (tab === "portfolio") {
    body = session ? (
      <Portfolio session={session} vault={vault} vs={vs} mid={mid} calls={calls} stats={stats} busy={busy} run={run} />
    ) : (
      <SignInPrompt signIn={signIn} what="see your portfolio" />
    );
  } else {
    body = <Board stats={stats} onCaller={openCaller} />;
  }

  return (
    <Screen>
      <View style={s.top}>
        <Text style={s.brand}>
          <Text style={{ color: C.accent }}>▲</Text> Upside
        </Text>
        <Text style={s.ticker}>
          {BASE_SYMBOL}/{QUOTE_SYMBOL} <Text style={{ color: C.ink, fontWeight: "700" }}>{mid ? humanPrice(mid).toFixed(4) : "—"}</Text>
          {!mid && <Text style={{ color: C.warn }}> stale</Text>}
        </Text>
        <Pressable
          style={s.chip}
          onPress={() => (session ? (session.end(), setSession(null), setBrowsing(false)) : signIn())}
        >
          <Text style={s.chipText}>{session ? `${session.label.split(" ")[0]} · ${short(session.account.address)}` : "Sign in"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>

      {toast && (
        <Pressable style={[s.toast, toast.kind === "err" && s.toastErr, toast.kind === "ok" && s.toastOk]} onPress={() => setToast(null)}>
          <Text style={[s.toastText, toast.kind === "err" && { color: C.down }]}>
            {toast.text}
            {toast.hash ? (EXPLORER ? "  · view tx" : `  ${short(toast.hash)}`) : ""}
          </Text>
          {toast.hash && EXPLORER ? (
            <Text style={s.toastLink} onPress={() => Linking.openURL(`${EXPLORER}/tx/${toast.hash}`)}>
              Open in explorer
            </Text>
          ) : null}
        </Pressable>
      )}

      <View style={s.tabs}>
        {(
          [
            ["feed", "Calls"],
            ["post", "Post"],
            ["portfolio", "Portfolio"],
            ["board", "Leaders"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <Pressable key={t} style={s.tabBtn} onPress={() => (setTab(t), goHome())}>
            <Text style={[s.tabText, tab === t && route.name === "tabs" && { color: C.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

// ----------------------------------------------------------------- shared bits

function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={[s.screen, { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 52 }]}>
      <StatusBar style="light" />
      <View style={s.column}>{children}</View>
    </View>
  );
}

function Btn(props: { title: string; onPress: () => void; disabled?: boolean; ghost?: boolean; small?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        props.ghost ? s.ghost : s.primary,
        props.small && { paddingVertical: 8, paddingHorizontal: 12 },
        (props.disabled || pressed) && { opacity: props.disabled ? 0.5 : 0.8 },
      ]}
    >
      <Text style={props.ghost ? s.ghostText : s.primaryText}>{props.title}</Text>
    </Pressable>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 6 }}>
      <Text style={s.muted}>← Back</Text>
    </Pressable>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function Badge({ st }: { st?: CallerStats }) {
  if (!st) return null;
  return (
    <View style={[s.badge, st.verified && { borderColor: "rgba(61,220,151,0.4)" }]}>
      <Text style={[s.badgeText, { color: st.verified ? C.up : C.muted }]}>{st.verified ? "Verified" : "Unverified · earns $0"}</Text>
    </View>
  );
}

function RecordLine({ st }: { st?: CallerStats }) {
  if (!st || st.scored === 0) return <Text style={s.muted}>No scored calls yet</Text>;
  return (
    <Text style={s.muted}>
      <Text style={{ color: st.avgReturnBps >= 0 ? C.up : C.down, fontWeight: "700" }}>{pct(st.avgReturnBps)}</Text> avg over{" "}
      {st.scored} scored · {Math.round((st.wins / st.scored) * 100)}% hit
    </Text>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { textAlign: "center", paddingVertical: 28 }]}>{text}</Text>;
}

function SignInPrompt({ signIn, what }: { signIn: () => void; what: string }) {
  return (
    <Card>
      <Text style={s.h2}>Sign in to {what}</Text>
      <Text style={[s.muted, { marginBottom: 12 }]}>A passkey creates your Monad account in seconds. No seed phrase.</Text>
      <Btn title="Sign in" onPress={signIn} />
    </Card>
  );
}

// ----------------------------------------------------------------- onboarding

function Onboard({ onSession, onBrowse }: { onSession: (s: Session) => void; onBrowse: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    hasPasskey().then(setReturning).catch(() => {});
  }, []);

  const start = async (fn: () => Promise<Session>) => {
    setBusy(true);
    setErr("");
    try {
      const sess = await fn();
      await devFundGas(sess.account.address);
      onSession(sess);
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 24 }]} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.accent, fontSize: 44 }}>▲</Text>
      <Text style={s.h1}>Upside</Text>
      <Text style={s.lede}>Trading calls you only pay for when you profit.</Text>
      {[
        "Every call is committed on Monad before the move. No deleting losers.",
        "Callers earn a share of your net gains. Still down with them? They get nothing.",
        "Scores come from market prices, so fake followers can't buy a reputation.",
      ].map((t) => (
        <Text key={t} style={[s.muted, { marginBottom: 6 }]}>
          •  {t}
        </Text>
      ))}

      <Card style={{ marginTop: 14, gap: 10 }}>
        <Text style={s.label}>Display name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. femi"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
        />
        <Text style={s.small}>Becomes your public handle, e.g. @{toHandle(name) || "femi"}</Text>
        <Btn
          title="Create account with a passkey"
          disabled={busy}
          onPress={() =>
            start(async () => {
              const sess = await createPasskeyAccount(name || "Upside user");
              await devFundGas(sess.account.address);
              if (toHandle(name).length >= 3) setHandle(sess, toHandle(name)).catch(() => {});
              return sess;
            })
          }
        />
        {returning && <Btn ghost title="Sign in with your passkey" disabled={busy} onPress={() => start(signInWithPasskey)} />}
        {busy && <ActivityIndicator color={C.accent} />}
        <Text style={s.small}>No seed phrase. Your passkey derives your Monad account on this device (Mera).</Text>
        {!!err && <Text style={{ color: C.down, fontSize: 13 }}>{err}</Text>}
      </Card>

      {IS_LOCAL && (
        <Card style={{ marginTop: 12, gap: 8, borderStyle: "dashed" }}>
          <Text style={s.label}>LOCAL DEMO ACCOUNTS</Text>
          {DEV_ACCOUNTS.map((a, i) => (
            <Btn key={a.label} ghost title={a.label} onPress={() => onSession(devSession(i))} />
          ))}
        </Card>
      )}
      <Pressable onPress={onBrowse} style={{ alignSelf: "center", padding: 14 }}>
        <Text style={s.muted}>Just browse calls →</Text>
      </Pressable>
      <Text style={[s.small, { textAlign: "center" }]}>
        Chain {deployment.chainId}
        {deployment.demo ? " · demo venue (test tokens)" : ""}
      </Text>
    </ScrollView>
  );
}

// ----------------------------------------------------------------- feed

function Feed(props: {
  calls: Call[];
  stats: Map<Address, CallerStats>;
  mid: bigint | null;
  vault: Address | null;
  session: Session | null;
  signIn: () => void;
  busy: boolean;
  run: Runner;
  onCaller: (a: Address) => void;
}) {
  const { calls, stats, mid, session, busy, run } = props;
  const now = useNow();
  const [amount, setAmount] = useState("50");
  if (!calls.length) return <Empty text="No calls here yet." />;

  return (
    <View style={{ gap: 10 }}>
      <View style={s.amountRow}>
        <Text style={[s.muted, { flex: 1 }]}>Follow size</Text>
        {["20", "50", "100"].map((v) => (
          <Pressable key={v} onPress={() => setAmount(v)} style={[s.pill, amount === v && s.pillOn]}>
            <Text style={{ color: amount === v ? C.accent : C.ink, fontWeight: "600" }}>${v}</Text>
          </Pressable>
        ))}
      </View>
      {calls.map((c) => {
        const st = stats.get(c.caller);
        const active = !c.scored && c.expiry > now;
        const live = mid && !c.scored ? Number(((mid - c.entryMid) * 10000n) / c.entryMid) : null;
        const mine = session && c.caller.toLowerCase() === session.account.address.toLowerCase();
        return (
          <Card key={c.id} style={[{ gap: 8 }, !active && { opacity: 0.72 }]}>
            <View style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={[s.row, { justifyContent: "flex-start", gap: 6, flexWrap: "wrap" }]}>
                  <Text style={s.who} onPress={() => props.onCaller(c.caller)}>
                    {nameOf(c.caller)}
                  </Text>
                  <Badge st={st} />
                  <NansenChip caller={c.caller} />
                </View>
                <RecordLine st={st} />
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.small}>{c.feeBps / 100}% of net gains</Text>
                <Text style={s.small}>
                  {c.followers} {c.followers === 1 ? "follower" : "followers"} · ${fmtQuote(c.followedVolume, 0)}
                </Text>
              </View>
            </View>
            <View style={s.thesis}>
              <Text style={{ color: C.ink }}>
                <Text style={{ color: C.up, fontWeight: "800", fontSize: 12 }}>LONG </Text>
                {BASE_SYMBOL}/{QUOTE_SYMBOL} from <Text style={{ fontWeight: "700" }}>{humanPrice(c.entryMid).toFixed(4)}</Text>
              </Text>
              <Text style={s.small}>
                target {humanPrice(c.targetMid).toFixed(4)} · stop {humanPrice(c.stopMid).toFixed(4)}
              </Text>
            </View>
            <PerplBadge caller={c.caller} side={c.side} />
            <View style={s.row}>
              <Text style={[s.small, { flex: 1 }]}>
                Call #{c.id} · {new Date(c.postedAt * 1000).toLocaleTimeString()} · {c.scored ? "scored" : countdown(c.expiry - now)}
              </Text>
              {c.scored ? (
                <Text style={{ color: c.returnBps >= 0 ? C.up : C.down, fontWeight: "800" }}>{pct(c.returnBps)}</Text>
              ) : live !== null ? (
                <Text style={{ color: live >= 0 ? C.up : C.down }}>{pct(live)} now</Text>
              ) : null}
            </View>
            <Text
              style={s.link}
              onPress={() =>
                shareLink(
                  `${nameOf(c.caller)} called LONG ${BASE_SYMBOL} at ${humanPrice(c.entryMid).toFixed(4)}, target ${humanPrice(c.targetMid).toFixed(4)}. Committed onchain; you only pay if you profit.`,
                  `call/${c.id}`,
                )
              }
            >
              Share
            </Text>
            {active && !session && <Btn title="Sign in to follow" onPress={props.signIn} />}
            {active && session && !mine && (
              <Btn
                title={`Follow $${amount}`}
                disabled={busy || !mid}
                onPress={() =>
                  run(`Following call #${c.id} with $${amount}`, async () => {
                    const amt = parseQuote(amount);
                    let v = props.vault;
                    if (!v) v = await ensureVault(session, parseQuote("500"));
                    const stt = await getVaultState(v);
                    if (deployment.demo && stt.cash < amt) await demoFaucet(session, v, parseQuote("500"));
                    return follow(session, v, c.id, amt, (await getMid()) ?? mid!);
                  })
                }
              />
            )}
          </Card>
        );
      })}
    </View>
  );
}

// ----------------------------------------------------------------- post

const HORIZONS: [number, string][] = [
  [120, "2 min"],
  [300, "5 min"],
  [3600, "1 hour"],
  [86400, "1 day"],
  [604800, "1 week"],
];

function Post(props: { session: Session; mid: bigint | null; stats: Map<Address, CallerStats>; busy: boolean; run: Runner }) {
  const { session, mid, busy, run } = props;
  const [target, setTarget] = useState("3");
  const [stop, setStop] = useState("2");
  const [fee, setFee] = useState("20");
  const [horizon, setHorizon] = useState(300);
  const me = props.stats.get(session.account.address);
  const m = mid ? humanPrice(mid) : 0;
  const t = m * (1 + Number(target) / 100);
  const sp = m * (1 - Number(stop) / 100);

  return (
    <Card style={{ gap: 10 }}>
      <Text style={s.h2}>Post a call</Text>
      <Text style={s.muted}>Committed onchain now and scored against the market mid when it expires. Losers count.</Text>
      {me && !me.verified && (
        <Text style={s.notice}>You are not verified, so you can post but won't rank or earn fees. Verification uses a Cleanverse A-Pass.</Text>
      )}
      <View style={s.thesis}>
        <Text style={{ color: C.ink, fontSize: 16 }}>
          <Text style={{ color: C.up, fontWeight: "800", fontSize: 12 }}>LONG </Text>
          {BASE_SYMBOL}/{QUOTE_SYMBOL} at {m ? m.toFixed(4) : "—"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Target +%" value={target} onChange={setTarget} hint={t ? t.toFixed(4) : ""} />
        <Field label="Stop −%" value={stop} onChange={setStop} hint={sp ? sp.toFixed(4) : ""} />
      </View>
      <Field label="Your fee, % of net gains (max 30)" value={fee} onChange={setFee} />
      <Text style={s.label}>Scored after</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {HORIZONS.map(([sec, label]) => (
          <Pressable key={sec} onPress={() => setHorizon(sec)} style={[s.pill, horizon === sec && s.pillOn]}>
            <Text style={{ color: horizon === sec ? C.accent : C.ink }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Btn
        title="Commit call onchain"
        disabled={busy || !mid}
        onPress={() =>
          run("Committing your call", () =>
            postCall(session, { target: t, stop: sp, feeBps: Math.round(Number(fee) * 100), horizonSec: horizon }),
          )
        }
      />
    </Card>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput style={s.input} value={props.value} onChangeText={props.onChange} keyboardType="decimal-pad" />
      {!!props.hint && <Text style={s.small}>{props.hint}</Text>}
    </View>
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
      <View style={{ gap: 10 }}>
        <HandleCard session={session} busy={busy} run={run} />
        <Card style={{ gap: 10 }}>
          <Text style={s.h2}>Your vault</Text>
          <Text style={s.muted}>
            Follows run through your own vault on Monad. Only you can trade or withdraw. Callers are paid by the vault, and
            only from your net gains with them.
          </Text>
          <Field label={`Exposure limit (${QUOTE_SYMBOL})`} value={limit} onChange={setLimit} hint="The vault refuses any follow that would put more than this at risk." />
          <Btn
            title={`Create vault${deployment.demo ? " + 500 test AUSD" : ""}`}
            disabled={busy}
            onPress={() =>
              run("Creating your vault", async () => {
                const v = await ensureVault(session, parseQuote(limit));
                if (deployment.demo) await demoFaucet(session, v, parseQuote("500"));
              })
            }
          />
        </Card>
      </View>
    );

  const open = vs.positions.filter((p) => p.open);
  const closed = vs.positions.filter((p) => !p.open);
  const used = Number(vs.openCost) / Math.max(1, Number(vs.maxExposure));

  return (
    <View style={{ gap: 10 }}>
      <HandleCard session={session} busy={busy} run={run} />
      <Card style={{ gap: 10 }}>
        <View style={s.row}>
          <View>
            <Text style={s.muted}>Cash in vault</Text>
            <Text style={s.bigNum}>${fmtQuote(vs.cash)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.muted}>At risk</Text>
            <Text style={{ color: C.ink }}>
              ${fmtQuote(vs.openCost)} / ${fmtQuote(vs.maxExposure, 0)}
            </Text>
          </View>
        </View>
        <View style={s.meter}>
          <View style={{ width: `${Math.min(100, used * 100)}%`, height: "100%", backgroundColor: used > 0.8 ? C.warn : C.accent }} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {deployment.demo && (
            <Btn ghost small title="+ 500 test AUSD" disabled={busy} onPress={() => run("Adding 500 test AUSD", () => demoFaucet(session, vault, parseQuote("500")))} />
          )}
          <Btn ghost small title="Limit +500" disabled={busy} onPress={() => run("Raising exposure limit", () => setExposure(session, vault, vs.maxExposure + parseQuote("500")))} />
        </View>
      </Card>

      <Text style={s.section}>OPEN</Text>
      {!open.length && <Empty text="No open follows." />}
      {open.map((p) => {
        const c = callById.get(p.callId);
        const st = stats.get(p.caller);
        const rel = vs.pnl.get(p.caller) ?? { net: 0n, hwm: 0n };
        const pv = mid && c ? previewFee(p, mid, c.feeBps, rel.net, rel.hwm, !!st?.verified) : null;
        return (
          <Card key={p.id} style={{ gap: 8 }}>
            <View style={s.row}>
              <Text style={s.who}>
                {nameOf(p.caller)} · call #{p.callId}
              </Text>
              {pv && (
                <Text style={{ color: pv.pnl >= 0n ? C.up : C.down, fontWeight: "800" }}>
                  {pv.pnl >= 0n ? "+" : "−"}${fmtQuote(pv.pnl < 0n ? -pv.pnl : pv.pnl)}
                </Text>
              )}
            </View>
            <Text style={s.muted}>
              {fmtBase(p.baseAmount)} {BASE_SYMBOL} for ${fmtQuote(p.cost)}
            </Text>
            {pv && (
              <Text style={s.feebox}>
                {pv.fee > 0n
                  ? `Close now: caller earns $${fmtQuote(pv.fee)} of your gain above your previous best with them.`
                  : pv.stillDown
                    ? `Close now: you are still net down with ${nameOf(p.caller)}, so they earn $0.`
                    : `Close now: caller earns $0${st?.verified ? "" : " (unverified)"}.`}
              </Text>
            )}
            <Btn
              title="Close and settle"
              disabled={busy || !mid}
              onPress={() => run(`Closing follow #${p.id}`, async () => closePosition(session, vault, p, (await getMid()) ?? mid!))}
            />
          </Card>
        );
      })}

      {!!closed.length && <Text style={s.section}>CLOSED</Text>}
      {closed.map((p) => (
        <View key={p.id} style={s.closedRow}>
          <Text style={{ color: C.ink }}>
            {nameOf(p.caller)} · call #{p.callId}
          </Text>
          <Text style={s.muted}>${fmtQuote(p.cost)} in</Text>
        </View>
      ))}

      {vs.pnl.size > 0 && (
        <Card style={{ gap: 6 }}>
          <Text style={s.muted}>Net with each caller (fees only above the high-water mark)</Text>
          {[...vs.pnl.entries()].map(([c, r]) => (
            <View key={c} style={s.row}>
              <Text style={{ color: C.ink }}>{nameOf(c)}</Text>
              <Text style={{ color: r.net >= 0n ? C.up : C.down }}>
                {r.net >= 0n ? "+" : "−"}${fmtQuote(r.net < 0n ? -r.net : r.net)}
                <Text style={s.muted}>  peak ${fmtQuote(r.hwm)}</Text>
              </Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function HandleCard({ session, busy, run }: { session: Session; busy: boolean; run: Runner }) {
  const current = HANDLES.get(session.account.address.toLowerCase());
  const [v, setV] = useState(current ?? "");
  return (
    <Card style={{ gap: 6 }}>
      <Text style={s.muted}>Public handle</Text>
      <View style={[s.row, { gap: 8 }]}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={v}
          onChangeText={(x) => setV(toHandle(x))}
          placeholder="your_handle"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
        />
        <Btn ghost small title="Save" disabled={busy || v.length < 3 || v === current} onPress={() => run("Saving handle", () => setHandle(session, v))} />
      </View>
    </Card>
  );
}

// ----------------------------------------------------------------- leaders and profiles

function Board({ stats, onCaller }: { stats: Map<Address, CallerStats>; onCaller: (a: Address) => void }) {
  const all = [...stats.values()];
  const ranked = all
    .filter((x) => x.verified && x.scored > 0)
    .sort((a, b) => b.avgReturnBps * Math.sqrt(b.scored) - a.avgReturnBps * Math.sqrt(a.scored));
  const unranked = all.filter((x) => !x.verified || x.scored === 0);
  return (
    <View style={{ gap: 10 }}>
      <Card style={{ gap: 6 }}>
        <Text style={s.h2}>Leaders</Text>
        <Text style={s.muted}>
          Verified callers only, ranked by average return of committed calls. Follower count and reviews are not inputs.
        </Text>
      </Card>
      {!ranked.length && <Empty text="No scored calls from verified callers yet." />}
      {ranked.map((x, i) => (
        <Pressable key={x.address} style={s.leader} onPress={() => onCaller(x.address)}>
          <Text style={{ color: C.accent, fontWeight: "800", width: 24 }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.who}>{nameOf(x.address)}</Text>
            <Text style={s.small}>
              {x.scored} {x.scored === 1 ? "call" : "calls"} · {Math.round((x.wins / x.scored) * 100)}% hit
            </Text>
          </View>
          <Text style={{ color: x.avgReturnBps >= 0 ? C.up : C.down, fontWeight: "800" }}>{pct(x.avgReturnBps)}</Text>
        </Pressable>
      ))}
      {!!unranked.length && <Text style={s.section}>NOT RANKED</Text>}
      {unranked.map((x) => (
        <Pressable key={x.address} style={[s.leader, { opacity: 0.6 }]} onPress={() => onCaller(x.address)}>
          <Text style={{ color: C.muted, width: 24 }}>–</Text>
          <Text style={[s.who, { flex: 1 }]}>{nameOf(x.address)}</Text>
          <Text style={s.small}>{x.verified ? "no scored calls yet" : "unverified"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function CallerProfile({ address, stats }: { address: Address; stats: Map<Address, CallerStats> }) {
  const st = [...stats.values()].find((x) => x.address.toLowerCase() === address.toLowerCase());
  return (
    <Card style={{ gap: 10, marginBottom: 10 }}>
      <View style={s.row}>
        <View>
          <Text style={s.h2}>{nameOf(address)}</Text>
          <Text style={s.small}>{short(address)}</Text>
        </View>
        <Badge st={st} />
      </View>
      {st && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Stat value={st.scored ? pct(st.avgReturnBps) : "—"} label="avg return" color={st.avgReturnBps >= 0 ? C.up : C.down} />
          <Stat value={st.scored ? `${Math.round((st.wins / st.scored) * 100)}%` : "—"} label="hit rate" />
          <Stat value={String(st.posted)} label="calls posted" />
        </View>
      )}
      <NansenChip caller={address} all />
      <PerplBadge caller={address} side={0} profile />
      <Text style={s.muted}>Every call this address ever posted is below, losers included. Calls cannot be deleted.</Text>
      <Btn
        ghost
        title="Share profile"
        onPress={() => shareLink(`${nameOf(address)}: full, undeletable trading record on Upside.`, `caller/${address}`)}
      />
    </Card>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={{ color: color ?? C.ink, fontSize: 18, fontWeight: "800" }}>{value}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
}

/** Nansen label chip(s) for a caller: their Smart Money label, or all labels on the profile. */
function NansenChip({ caller, all }: { caller: Address; all?: boolean }) {
  const n = NANSEN.get(caller.toLowerCase());
  if (!n || !n.labels.length) return null;
  const shown = all ? n.labels.slice(0, 6) : [n.labels.find((l) => /smart|fund|trader/i.test(l)) ?? n.labels[0]];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {shown.map((l) => (
        <View key={l} style={[s.badge, { borderColor: "rgba(139,123,255,0.5)" }]}>
          <Text style={[s.badgeText, { color: C.accent }]}>Nansen · {l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Whether the caller holds the same trade on Perpl right now, read from Perpl's Exchange contract. */
function PerplBadge({ caller, side, profile }: { caller: Address; side: number; profile?: boolean }) {
  if (!perplEnabled) return null;
  const key = caller.toLowerCase();
  if (!PERPL.has(key)) return null;
  const p = PERPL.get(key);
  if (!p) return profile ? <Text style={s.muted}>No MON position on Perpl right now</Text> : null;
  const sameWay = (p.side === "long") === (side === 0);
  const size = p.size >= 1000 ? `${(p.size / 1000).toFixed(1)}k` : p.size.toFixed(0);
  return (
    <Pressable onPress={() => Linking.openURL(perplUrl)} style={[s.perpl, sameWay ? s.perplAligned : s.perplAgainst]}>
      <Text style={{ color: sameWay ? C.ink : C.warn, fontSize: 12.5 }}>
        {sameWay ? "Skin in the game: " : "Warning: "}
        {p.side} {size} MON on Perpl from {p.entry.toFixed(4)}
        <Text style={{ color: p.pnlPct >= 0 ? C.up : C.down }}>
          {" "}({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%)
        </Text>
        {!sameWay && !profile ? " · opposite of this call" : ""}
      </Text>
    </Pressable>
  );
}

// ----------------------------------------------------------------- styles

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: 460 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  brand: { color: C.ink, fontWeight: "800", fontSize: 16 },
  ticker: { marginLeft: "auto", color: C.muted, fontSize: 13 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: C.ink, fontSize: 12 },
  content: { padding: 16, paddingBottom: 120, gap: 10 },
  h1: { color: C.ink, fontSize: 34, fontWeight: "800", marginTop: 6 },
  h2: { color: C.ink, fontSize: 19, fontWeight: "700" },
  lede: { color: C.ink, fontSize: 18, marginVertical: 10 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 19 },
  small: { color: C.muted, fontSize: 12 },
  label: { color: C.muted, fontSize: 12, letterSpacing: 0.5 },
  section: { color: C.muted, fontSize: 12, letterSpacing: 1, marginTop: 10 },
  who: { color: C.ink, fontWeight: "700", fontSize: 15 },
  link: { color: C.accent, fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  thesis: { backgroundColor: C.panel2, borderRadius: 10, padding: 10, gap: 2 },
  badge: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  primary: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, alignItems: "center" },
  primaryText: { color: C.bg, fontWeight: "800", fontSize: 15 },
  ghost: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" },
  ghostText: { color: C.ink, fontWeight: "700" },
  pill: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  pillOn: { borderColor: C.accent },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 16 },
  notice: { color: C.warn, backgroundColor: "rgba(255,200,87,0.12)", borderRadius: 10, padding: 10, fontSize: 13 },
  feebox: { color: C.ink, backgroundColor: "rgba(139,123,255,0.12)", borderRadius: 10, padding: 10, fontSize: 13 },
  bigNum: { color: C.ink, fontSize: 26, fontWeight: "800" },
  meter: { height: 6, backgroundColor: C.panel2, borderRadius: 99, overflow: "hidden" },
  closedRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  leader: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12 },
  perpl: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  perplAligned: { borderColor: "rgba(61,220,151,0.4)", backgroundColor: "rgba(61,220,151,0.08)" },
  perplAgainst: { borderColor: "rgba(255,200,87,0.5)", backgroundColor: "rgba(255,200,87,0.10)" },
  stat: { flex: 1, backgroundColor: C.panel2, borderRadius: 10, padding: 10, gap: 2 },
  tabs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: "rgba(11,11,16,0.96)",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingBottom: Platform.OS === "ios" ? 26 : 8,
    paddingTop: 6,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { color: C.muted, fontWeight: "700" },
  toast: { position: "absolute", left: 16, right: 16, bottom: 84, backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  toastOk: { borderColor: "rgba(61,220,151,0.5)" },
  toastErr: { borderColor: "rgba(255,107,122,0.6)" },
  toastText: { color: C.ink, fontSize: 13 },
  toastLink: { color: C.accent, fontSize: 13, fontWeight: "700" },
});
