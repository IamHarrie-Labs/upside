import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
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
  withdrawCash,
  setHandle,
  toHandle,
  type Call,
  type CallerStats,
} from "./src/lib/upside";

// ----------------------------------------------------------------- theme

import { C } from "./src/theme";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const refreshVersion = useRef(0);
  const adoptSession = (next: Session | null) => {
    refreshVersion.current++;
    setLoading(true); setLoadError(""); setVault(null); setVs(null); setSession(next);
  };

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
      setTick((t) => t + 1);
      setLoading(false);
      setLoadError("");
    } catch (error) { if (version === refreshVersion.current) throw error; }
  }, [session]);

  useEffect(() => {
    if (!browsing && !session) return;
    const read = () => refresh().catch(() => { setLoading(false); setLoadError("The onchain record could not refresh. Check your connection and retry."); });
    queueMicrotask(read);
    const t = setInterval(read, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh, browsing, session]);

  const run: Runner = async (label, fn) => {
    setBusy(true);
    setToast({ kind: "info", text: label });
    try {
      const hash = await fn();
      setToast({ kind: "ok", text: `${label}: done`, hash: hash || undefined });
      await refresh().catch(() => setLoadError("Transaction confirmed. Retry to refresh the latest record."));
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
        <Onboard onSession={(s) => (adoptSession(s), setBrowsing(false))} onBrowse={() => setBrowsing(true)} />
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Image source={require("./assets/brand-mark.png")} style={{ width: 24, height: 24 }} /><Text style={s.brand}>Upside</Text></View>
        <Text style={s.ticker}>
          {BASE_SYMBOL}/{QUOTE_SYMBOL} <Text style={{ color: C.ink, fontWeight: "700" }}>{mid ? humanPrice(mid).toFixed(4) : "—"}</Text>
          {!mid && <Text style={{ color: C.warn }}> stale</Text>}
        </Text>
        <Pressable
          style={s.chip}
          disabled={busy}
          onPress={() => (session ? (session.end(), adoptSession(null), setBrowsing(false)) : signIn())}
        >
          <Text style={s.chipText}>{session ? `${session.label.split(" ")[0]} · ${short(session.account.address)}` : "Sign in"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{deployment.demo ? "PREVIEW / TEST TOKENS ONLY" : "MONAD / ONCHAIN RECORD"}</Text>
        {route.name === "tabs" && <View style={{ gap: 8, marginVertical: 15 }}><Text style={[s.label, { color: C.accent }]}>{({feed:"01 / FIND YOUR CONVICTION",post:"02 / MAKE IT A COMMITMENT",portfolio:"03 / STAY IN CONTROL",board:"04 / EVIDENCE OVER ATTENTION"})[tab]}</Text><Text style={[s.h1, { fontSize: 34, letterSpacing: -1.2 }]}>{({feed:"The call sheet.",post:"Put it on record.",portfolio:"Your vault. Your upside.",board:"A following is earned."})[tab]}</Text></View>}
        {loading ? <View style={{ padding: 35, gap: 15 }}><ActivityIndicator color={C.accent}/><Text style={s.muted}>Reading the onchain record…</Text></View> : loadError ? <Card style={{ gap: 15 }}><Text accessibilityRole="alert" style={s.notice}>{loadError}</Text><Btn ghost title="Retry connection" onPress={() => refresh().catch(() => {})}/></Card> : body}
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${WEB_URL}/#/guide`)} style={{ paddingVertical: 16 }}><Text style={s.link}>Read the Upside field guide ↗</Text></Pressable>
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
            ["post", "Create"],
            ["portfolio", "Vault"],
            ["board", "Record"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <Pressable key={t} style={s.tabBtn} onPress={() => (setTab(t), goHome())}>
            <Text style={[s.tabText, tab === t && route.name === "tabs" && { color: C.accent }]}>{label}</Text>
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
      <StatusBar style="dark" />
      <View style={s.column}>{children}</View>
    </View>
  );
}

function Btn(props: { title: string; onPress: () => void; disabled?: boolean; ghost?: boolean; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
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
    <View style={[s.badge, st.verified && { borderColor: "rgba(53,99,72,0.4)" }]}>
      <Text style={[s.badgeText, { color: st.verified ? C.up : C.muted }]}>{st.verified ? (deployment.demo ? "Test verified" : "Verified") : "Unverified · earns $0"}</Text>
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
      <Image source={require("./assets/brand-mark.png")} style={{ width: 45, height: 45 }} accessibilityLabel="Upside"/>
      <Text style={[s.label, { color: C.accent, fontStyle: "italic", fontSize: 17, marginTop: 12 }]}>Good judgment deserves good company.</Text>
      <Text style={[s.h1, { fontSize: 42, letterSpacing: -1.8 }]}>Good calls.
        {"\n"}Shared upside.</Text>
      <Text style={s.lede}>Trading calls you only pay for when you profit.</Text>
      <Image source={require("./assets/community-strip.png")} style={{ width: "100%", height: 165, marginVertical: 8 }} resizeMode="cover" accessible={false} />
      {[
        "Every call is committed on Monad before the move. No deleting losers.",
        "Callers earn a share of your net gains. Still down with them? They get nothing.",
        "Inspect committed calls and scored outcomes before you follow.",
      ].map((t) => (
        <Text key={t} style={[s.muted, { marginBottom: 6 }]}>
          •  {t}
        </Text>
      ))}

      <Card style={{ marginTop: 14, gap: 10 }}>
        <Text style={s.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. femi"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
        />
        <Text style={s.small}>Choose your onchain handle from your vault after funding.</Text>
        <Btn
          title="Create account with a passkey"
          disabled={busy}
          onPress={() =>
            start(async () => {
              const sess = await createPasskeyAccount(name || "Upside user");
              await devFundGas(sess.account.address);

              return sess;
            })
          }
        />
        <Btn ghost title="Sign in with your passkey" disabled={busy} onPress={() => start(signInWithPasskey)} />
        {returning && <Text style={s.small}>A passkey was previously used on this device.</Text>}
        {busy && <ActivityIndicator color={C.accent} />}
        <Text style={s.small}>No seed phrase. Your passkey derives your Monad account on this device (Mera).</Text>
        {!!err && <Text style={{ color: C.down, fontSize: 13 }}>{err}</Text>}
      </Card>

      {IS_LOCAL && (
        <Card style={{ marginTop: 12, gap: 8, borderStyle: "dashed" }}>
          <Text style={s.label}>LOCAL DEMO ACCOUNTS</Text>
          {DEV_ACCOUNTS.map((a, i) => (
            <Btn key={a.label} ghost title={a.label} disabled={busy} onPress={() => onSession(devSession(i))} />
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
  const [filter, setFilter] = useState<"all" | "live" | "scored">("all");
  const [query, setQuery] = useState("");
  const shown = calls.filter(c => (filter === "all" || (filter === "scored" ? c.scored : !c.scored && c.expiry > now)) &&
    `${nameOf(c.caller)} ${c.caller} ${c.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (!calls.length) return <Empty text="No calls here yet." />;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "live", "scored"] as const).map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[s.pill, filter === f && s.pillOn]}><Text style={{ color: filter === f ? C.accent : C.ink }}>{({ all: "All calls", live: "Live", scored: "Scored" })[f]}</Text></Pressable>)}
      </View>
      <TextInput accessibilityLabel="Search calls" style={s.input} value={query} onChangeText={setQuery} placeholder="Search handle, address or call number" placeholderTextColor={C.muted} autoCapitalize="none" />
      {!shown.length && <View style={{ gap: 8 }}><Empty text="No calls match these filters."/><Btn ghost title="Reset filters" onPress={() => { setFilter("all"); setQuery(""); }}/></View>}
      <View style={s.amountRow}>
        <Text style={[s.muted, { flex: 1 }]}>Follow size</Text>
        {["20", "50", "100"].map((v) => (
          <Pressable key={v} onPress={() => setAmount(v)} style={[s.pill, amount === v && s.pillOn]}>
            <Text style={{ color: amount === v ? C.accent : C.ink, fontWeight: "600" }}>${v}</Text>
          </Pressable>
        ))}
      </View>
      {shown.map((c) => {
        const st = stats.get(c.caller);
        const active = !c.scored && c.expiry > now;
        const live = mid && !c.scored ? Number(((mid - c.entryMid) * 10000n) / c.entryMid) * (c.side === 0 ? 1 : -1) : null;
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
                <Text style={{ color: c.side === 0 ? C.up : C.down, fontWeight: "800", fontSize: 12 }}>{c.side === 0 ? "LONG " : "SHORT "}</Text>
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
                  `${nameOf(c.caller)} called ${c.side === 0 ? "LONG" : "SHORT"} ${BASE_SYMBOL} at ${humanPrice(c.entryMid).toFixed(4)}, target ${humanPrice(c.targetMid).toFixed(4)}. Committed onchain; you only pay if you profit.`,
                  `call/${c.id}`,
                )
              }
            >
              Share
            </Text>
            {active && c.side !== 0 && <Text style={s.small}>Short calls are viewable; spot follows support long calls only.</Text>}
            {active && c.side === 0 && !session && <Btn title="Sign in to follow" onPress={props.signIn} />}
            {active && c.side === 0 && session && !mine && (
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
  const validation = !target.trim() || !Number.isFinite(Number(target)) || Number(target) <= 0 ? "Enter a target greater than 0%."
    : !stop.trim() || !Number.isFinite(Number(stop)) || Number(stop) <= 0 || Number(stop) >= 100 ? "Enter a stop between 0% and 100%."
    : !fee.trim() || !Number.isFinite(Number(fee)) || Number(fee) < 0 || Number(fee) > 30 ? "Enter a fee from 0% to 30%." : "";

  return (
    <Card style={{ gap: 10 }}>
      <Text style={s.h2}>Post a call</Text>
      <Text style={s.muted}>Committed onchain now and scored against the market mid when scored after expiry. Losers count.</Text>
      {me && !me.verified && (
        <Text style={s.notice}>You can post but won't rank or earn fees without a current gate attestation.{deployment.demo ? " This preview uses test attestations." : " Production verification requires the configured verification service."}</Text>
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
      <Text style={s.small}>Targets and stops describe your thesis; they do not automatically close positions.</Text>
      {!!validation && <Text accessibilityRole="alert" style={{ color: C.down }}>{validation}</Text>}
      {!mid && <Text style={s.notice}>Waiting for a fresh price before you can commit this call.</Text>}
      <Btn
        title="Commit call onchain"
        disabled={busy || !mid || !!validation}
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
      <TextInput accessibilityLabel={props.label} style={s.input} value={props.value} onChangeText={props.onChange} keyboardType="decimal-pad" />
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
  const [editingLimit, setEditingLimit] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const validLimit = /^\d+(\.\d{1,6})?$/.test(limit) && Number(limit) > 0;
  const callById = useMemo(() => new Map(calls.map((c) => [c.id, c])), [calls]);

  if (!vault || !vs)
    return (
      <View style={{ gap: 10 }}>
        <HandleCard key={session.account.address + (HANDLES.get(session.account.address.toLowerCase()) ?? "")} session={session} busy={busy} run={run} />
        <Card style={{ gap: 10 }}>
          <Text style={s.h2}>Your vault</Text>
          <Text style={s.muted}>
            Follows run through your own vault on Monad. Only you can trade or withdraw. Callers are paid by the vault, and
            only from your net gains with them.
          </Text>
          <Field label={`Exposure limit (${QUOTE_SYMBOL})`} value={limit} onChange={setLimit} hint="The vault refuses any follow that would put more than this at risk." />
          <Btn
            title={`Create vault${deployment.demo ? " + 500 test AUSD" : ""}`}
            disabled={busy || !validLimit}
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
      <HandleCard key={session.account.address + (HANDLES.get(session.account.address.toLowerCase()) ?? "")} session={session} busy={busy} run={run} />
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
          <Btn ghost small title="Exposure limit" disabled={busy} onPress={() => { setLimit(fmtQuote(vs.maxExposure, 0)); setEditingLimit(!editingLimit); }} />
        </View>
        {editingLimit && <View style={{ gap: 10 }}><Field label="Exposure limit (AUSD)" value={limit} onChange={setLimit} hint="Must cover the original cost of open follows."/><Btn title="Save exposure limit" disabled={busy || !validLimit || (validLimit && parseQuote(limit) < vs.openCost)} onPress={() => run("Updating exposure limit", async () => { const hash = await setExposure(session, vault, parseQuote(limit)); setEditingLimit(false); return hash; })}/></View>}
      </Card>
      <Card style={{ gap: 12 }}><Text style={s.h2}>Fund or withdraw</Text><Text style={s.muted}>Send {QUOTE_SYMBOL} on this network to your vault. MON in your account pays gas.</Text><Text selectable style={s.small}>{vault}</Text><Field label="Withdraw available AUSD" value={withdrawAmount} onChange={setWithdrawAmount}/><Btn ghost title="Withdraw to my account" disabled={busy || !/^\d+(\.\d{1,6})?$/.test(withdrawAmount) || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > Number(fmtQuote(vs.cash,6))} onPress={() => run("Withdrawing available cash", async () => { const hash = await withdrawCash(session, vault, parseQuote(withdrawAmount)); setWithdrawAmount(""); return hash; })}/></Card>

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
                  ? `Estimated performance fee: $${fmtQuote(pv.fee)} above your previous peak. The protocol receives its configured share.`
                  : pv.stillDown
                    ? `Close now: you are below your previous peak with ${nameOf(p.caller)}, so there is no new performance fee.`
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
          accessibilityLabel="Public handle"
          maxLength={20}
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
          Verified callers only, ranked by average return multiplied by the square root of scored call count. Follower count and reviews are not inputs.
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
        <View key={l} style={[s.badge, { borderColor: "rgba(195,92,48,0.5)" }]}>
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
  column: { flex: 1, width: "100%", maxWidth: 520 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  brand: { color: C.ink, fontWeight: "800", fontSize: 16 },
  ticker: { marginLeft: "auto", color: C.muted, fontSize: 13 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: C.ink, fontSize: 12 },
  content: { padding: 16, paddingBottom: 120, gap: 10 },
  h1: { color: C.ink, fontSize: 34, fontWeight: "600", marginTop: 6 },
  h2: { color: C.ink, fontSize: 19, fontWeight: "700" },
  lede: { color: C.ink, fontSize: 18, marginVertical: 10 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 19 },
  small: { color: C.muted, fontSize: 12 },
  label: { color: C.muted, fontSize: 10, letterSpacing: 0.8 },
  section: { color: C.muted, fontSize: 12, letterSpacing: 1, marginTop: 10 },
  who: { color: C.ink, fontWeight: "700", fontSize: 15 },
  link: { color: C.accent, fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  thesis: { backgroundColor: C.panel2, borderRadius: 10, padding: 10, gap: 2 },
  badge: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  primary: { backgroundColor: C.ink, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 14, alignItems: "center" },
  primaryText: { color: C.panel, fontWeight: "700", fontSize: 14 },
  ghost: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" },
  ghostText: { color: C.ink, fontWeight: "700" },
  pill: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  pillOn: { borderColor: C.accent },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 16 },
  notice: { color: C.warn, backgroundColor: "rgba(255,200,87,0.12)", borderRadius: 10, padding: 10, fontSize: 13 },
  feebox: { color: C.ink, backgroundColor: "rgba(195,92,48,0.10)", borderRadius: 10, padding: 10, fontSize: 13 },
  bigNum: { color: C.ink, fontSize: 26, fontWeight: "800" },
  meter: { height: 6, backgroundColor: C.panel2, borderRadius: 99, overflow: "hidden" },
  closedRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  leader: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12 },
  perpl: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  perplAligned: { borderColor: "rgba(53,99,72,0.4)", backgroundColor: "rgba(53,99,72,0.08)" },
  perplAgainst: { borderColor: "rgba(130,88,27,0.4)", backgroundColor: "rgba(130,88,27,0.08)" },
  stat: { flex: 1, backgroundColor: C.panel2, borderRadius: 10, padding: 10, gap: 2 },
  tabs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: "rgba(255,250,243,0.97)",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingBottom: Platform.OS === "ios" ? 26 : 8,
    paddingTop: 6,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { color: C.muted, fontWeight: "600", fontSize: 12 },
  toast: { position: "absolute", left: 16, right: 16, bottom: 84, backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  toastOk: { borderColor: "rgba(61,220,151,0.5)" },
  toastErr: { borderColor: "rgba(255,107,122,0.6)" },
  toastText: { color: C.ink, fontSize: 13 },
  toastLink: { color: C.accent, fontSize: 13, fontWeight: "700" },
});
