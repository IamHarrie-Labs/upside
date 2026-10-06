// Upside logic for the MetaMask Agent Wallet plugin, independent of the mm host so it can be tested on a
// local chain (scripts/local-test.ts). Commands in src/commands/upside/ are thin adapters over this file.
//
// Every write goes through Host.submit, which in mm is MetaMask's wallet executor: each transaction is
// checked against the user's Agent Wallet policy and can pause for human approval (Guard Mode).
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  AttestedGateAbi,
  CallBookAbi,
  DemoRouterAbi,
  DemoTokenAbi,
  FollowVaultAbi,
  KeeperPriceSourceAbi,
  VaultFactoryAbi,
} from "./abi.js";
import { deployments } from "./deployments.js";

export const QUOTE_DECIMALS = 6; // AUSD
export const BASE_DECIMALS = 18; // WMON
const ONE = 10n ** 18n;

export const PUBLIC_RPC: Record<number, string> = {
  143: "https://rpc.monad.xyz",
  10143: "https://testnet-rpc.monad.xyz",
};
export const EXPLORER: Record<number, string> = {
  143: "https://monadvision.com/tx/",
  10143: "https://testnet.monadvision.com/tx/",
};

export type Deployment = {
  chainId: number;
  demo: boolean;
  gate: Address;
  priceSource: Address;
  callBook: Address;
  config: Address;
  factory: Address;
  settlement: Address;
  base: Address;
  router: Address;
  handles?: Address;
  startBlock: number;
};

export type Tx = { to: Address; data: Hex; value?: bigint };

/** What the core needs from its environment: a chain reader, the acting wallet, and a policy-gated submitter. */
export type Host = {
  chainId: number;
  d: Deployment;
  read: PublicClient;
  account: Address;
  /** Submits one transaction and waits for it. `summary` is the human-readable intent shown in approvals. */
  submit(tx: Tx, summary: string): Promise<{ hash?: Hex; status: string }>;
  keeperApi?: string;
  log?: (msg: string) => void;
  /** EIP-712 signing (x402 payments). In mm this is the wallet executor's typed-data request. */
  signTypedData?: (td: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => Promise<Hex>;
  /** ERC-8004 agent id acting for this wallet, if registered; shown in transaction intents. */
  agentId?: number | null;
};

export class UpsideError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

// ----------------------------------------------------------------- environment

/**
 * Deployment for a chain. Published chains ship with the plugin; UPSIDE_DEPLOYMENT=<path to json> overrides it
 * (used for local development against Anvil together with UPSIDE_RPC_URL).
 */
export function deploymentFor(chainId: number): Deployment {
  const override = process.env.UPSIDE_DEPLOYMENT;
  if (override) {
    const d = JSON.parse(readFileSync(override, "utf8")) as Deployment;
    if (Number(d.chainId) !== chainId)
      throw new UpsideError("CHAIN_MISMATCH", `UPSIDE_DEPLOYMENT is for chain ${d.chainId}, not ${chainId}.`);
    return d;
  }
  const d = deployments[String(chainId)] as Deployment | undefined;
  if (!d)
    throw new UpsideError(
      "UPSIDE_NOT_DEPLOYED",
      `Upside isn't deployed on chain ${chainId} in this plugin version.`,
      `Use --chain-id 10143 (Monad testnet) or 143 (Monad mainnet).`,
    );
  return d;
}

/** A plain reader for public data. UPSIDE_RPC_URL overrides the chain's public RPC. */
export function publicReader(chainId: number): PublicClient {
  const url = process.env.UPSIDE_RPC_URL ?? PUBLIC_RPC[chainId];
  if (!url) throw new UpsideError("NO_RPC", `No RPC for chain ${chainId}. Set UPSIDE_RPC_URL.`);
  return createPublicClient({ transport: http(url) }) as PublicClient;
}

// ----------------------------------------------------------------- formatting

export const fmtQuote = (raw: bigint, digits = 2) => Number(formatUnits(raw, QUOTE_DECIMALS)).toFixed(digits);
export const fmtBase = (raw: bigint, digits = 4) => Number(formatUnits(raw, BASE_DECIMALS)).toFixed(digits);
export const parseQuote = (s: string) => parseUnits(s, QUOTE_DECIMALS);
/** priceX18 (raw quote per raw base, 1e18) -> quote per whole base. */
export const humanPrice = (x18: bigint) =>
  Number(formatUnits((x18 * 10n ** BigInt(BASE_DECIMALS)) / ONE, QUOTE_DECIMALS));

// ----------------------------------------------------------------- reads

export type Call = {
  id: number;
  caller: Address;
  side: "long" | "short";
  feeBps: number;
  verifiedAtPost: boolean;
  scored: boolean;
  postedAt: number;
  expiry: number;
  open: boolean;
  /** Seconds since posting and until expiry, by chain time. */
  ageSec: number;
  secondsLeft: number;
  entry: number;
  target: number;
  stop: number;
  exit: number | null;
  returnBps: number | null;
};

export type CallerRecord = {
  address: Address;
  verified: boolean;
  posted: number;
  scored: number;
  wins: number;
  winRate: number | null;
  avgReturnBps: number | null;
};

/** The keeper API for a chain: --keeper-api / UPSIDE_KEEPER_API, else the hosted default for that chain. */
export const DEFAULT_KEEPER_API: Record<number, string> = {};

async function readMid(h: Pick<Host, "read" | "d">): Promise<bigint | null> {
  try {
    return (await h.read.readContract({
      address: h.d.priceSource,
      abi: KeeperPriceSourceAbi,
      functionName: "midPrice",
      args: [h.d.base, h.d.settlement],
    })) as bigint;
  } catch {
    return null; // stale: no fresh keeper price
  }
}

/**
 * Onchain mid. The keeper pushes prices on demand to save gas, so this pings it (POST /poke) and, if the price
 * is stale, waits up to ~20s for the next push.
 */
export async function getMid(h: Pick<Host, "read" | "d"> & { keeperApi?: string; chainId?: number }): Promise<bigint | null> {
  const api = h.keeperApi ?? (h.chainId !== undefined ? DEFAULT_KEEPER_API[h.chainId] : undefined);
  const poke = () => (api ? fetch(`${api}/poke`, { method: "POST" }).catch(() => {}) : Promise.resolve());
  await poke();
  let mid = await readMid(h);
  for (let i = 0; !mid && api && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    mid = await readMid(h);
  }
  return mid;
}

export async function getCalls(h: Pick<Host, "read" | "d">, opts: { limit?: number } = {}): Promise<Call[]> {
  const count = Number(await h.read.readContract({ address: h.d.callBook, abi: CallBookAbi, functionName: "callCount" }));
  const limit = Math.min(count, opts.limit ?? 50);
  const ids = Array.from({ length: limit }, (_, i) => count - 1 - i);
  const now = Number((await h.read.getBlock()).timestamp); // chain time decides expiry, not the local clock
  return Promise.all(
    ids.map(async (id) => {
      const c: any = await h.read.readContract({
        address: h.d.callBook,
        abi: CallBookAbi,
        functionName: "getCall",
        args: [BigInt(id)],
      });
      return {
        id,
        caller: c.caller,
        side: Number(c.side) === 0 ? "long" : "short",
        feeBps: Number(c.feeBps),
        verifiedAtPost: c.verifiedAtPost,
        scored: c.scored,
        postedAt: Number(c.postedAt),
        expiry: Number(c.expiry),
        open: !c.scored && Number(c.expiry) > now,
        ageSec: now - Number(c.postedAt),
        secondsLeft: Number(c.expiry) - now,
        entry: humanPrice(c.entryMid),
        target: humanPrice(c.targetMid),
        stop: humanPrice(c.stopMid),
        exit: c.scored ? humanPrice(c.exitMid) : null,
        returnBps: c.scored ? Number(c.returnBps) : null,
      } satisfies Call;
    }),
  );
}

export async function getCallerRecords(h: Pick<Host, "read" | "d">, addresses: Address[]) {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase() as Address))];
  const rows = await Promise.all(
    unique.map(async (address) => {
      const [rec, verified] = await Promise.all([
        h.read.readContract({ address: h.d.callBook, abi: CallBookAbi, functionName: "records", args: [address] }),
        h.read.readContract({ address: h.d.gate, abi: AttestedGateAbi, functionName: "isVerified", args: [address] }),
      ]);
      const [sum, posted, scored, wins] = rec as readonly [bigint, number, number, number];
      const s = Number(scored);
      return {
        address,
        verified: verified as boolean,
        posted: Number(posted),
        scored: s,
        wins: Number(wins),
        winRate: s ? Number(wins) / s : null,
        avgReturnBps: s ? Math.round(Number(sum) / s) : null,
      } satisfies CallerRecord;
    }),
  );
  return new Map(rows.map((r) => [r.address, r]));
}

export async function getVault(h: Pick<Host, "read" | "d">, owner: Address): Promise<Address | null> {
  const v = (await h.read.readContract({
    address: h.d.factory,
    abi: VaultFactoryAbi,
    functionName: "vaultOf",
    args: [owner],
  })) as Address;
  return v === zeroAddress ? null : v;
}

export type Position = { id: number; callId: number; caller: Address; baseAmount: bigint; cost: bigint; open: boolean };

export async function getVaultState(h: Pick<Host, "read" | "d">, vault: Address) {
  const read = (functionName: string, args: any[] = []) =>
    h.read.readContract({ address: vault, abi: FollowVaultAbi, functionName, args } as any);
  const [count, maxExposure, openCost, cash] = await Promise.all([
    read("positionCount"),
    read("maxExposure"),
    read("openCost"),
    h.read.readContract({ address: h.d.settlement, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
  ]);
  const positions: Position[] = await Promise.all(
    Array.from({ length: Number(count) }, async (_, i) => {
      const p: any = await read("getPosition", [BigInt(i)]);
      return { id: i, callId: Number(p.callId), caller: p.caller, baseAmount: p.baseAmount, cost: p.cost, open: p.open };
    }),
  );
  return {
    vault,
    maxExposure: maxExposure as bigint,
    openCost: openCost as bigint,
    cash: cash as bigint,
    positions,
  };
}

// ----------------------------------------------------------------- follow rules

/** Limits an agent must stay within. The vault's onchain maxExposure is the hard cap behind all of these. */
export type Rules = {
  perCall: bigint; // AUSD per follow
  maxFeeBps: number; // refuse calls whose profit share is higher
  minScored: number; // caller needs at least this many scored calls
  minWinRate: number; // 0..1, over scored calls
  minAvgReturnBps: number; // average scored return
  verifiedOnly: boolean; // caller holds an active Cleanverse A-Pass (AttestedGate)
  minTimeLeftSec: number; // skip calls about to expire
  maxAgeSec: number; // skip calls posted too long ago: a late follower gets a worse entry than the caller
  callers?: Address[]; // optional allowlist
  requireSmartMoney?: boolean; // caller must be a Nansen Smart Money wallet active on Monad (paid lookup, x402)
};

export const DEFAULT_RULES: Rules = {
  perCall: parseQuote("10"),
  maxFeeBps: 2000,
  minScored: 3,
  minWinRate: 0.5,
  minAvgReturnBps: 0,
  verifiedOnly: true,
  minTimeLeftSec: 60,
  maxAgeSec: 15 * 60,
};

/** Reasons a call fails the rules; empty when it may be followed. */
export function checkCall(call: Call, rec: CallerRecord | undefined, rules: Rules): string[] {
  const why: string[] = [];
  if (!call.open) why.push("call is no longer open");
  else if (call.secondsLeft < rules.minTimeLeftSec) why.push(`expires in under ${rules.minTimeLeftSec}s`);
  if (call.ageSec > rules.maxAgeSec) why.push(`posted ${Math.round(call.ageSec / 60)} min ago; you follow calls up to ${Math.round(rules.maxAgeSec / 60)} min old`);
  if (call.side !== "long") why.push("only long calls are supported by vaults");
  if (call.feeBps > rules.maxFeeBps) why.push(`profit share ${call.feeBps / 100}% is above your ${rules.maxFeeBps / 100}% limit`);
  if (rules.callers?.length && !rules.callers.some((c) => c.toLowerCase() === call.caller.toLowerCase()))
    why.push("caller is not on your allowlist");
  if (!rec) return [...why, "caller record unavailable"];
  if (rules.verifiedOnly && !rec.verified) why.push("caller is not verified (no active Cleanverse A-Pass)");
  if (rec.scored < rules.minScored) why.push(`caller has ${rec.scored} scored calls; you require ${rules.minScored}`);
  if (rec.scored && (rec.winRate ?? 0) < rules.minWinRate)
    why.push(`caller wins ${Math.round((rec.winRate ?? 0) * 100)}%; you require ${Math.round(rules.minWinRate * 100)}%`);
  if (rec.scored && (rec.avgReturnBps ?? 0) < rules.minAvgReturnBps)
    why.push(`caller averages ${(rec.avgReturnBps ?? 0) / 100}%; you require ${rules.minAvgReturnBps / 100}%`);
  return why;
}

// ----------------------------------------------------------------- swap routing

async function buildSwap(h: Host, vault: Address, sellBase: boolean, amountIn: bigint): Promise<{ router: Address; data: Hex }> {
  if (h.d.demo) {
    return {
      router: h.d.router,
      data: encodeFunctionData({
        abi: DemoRouterAbi,
        functionName: "swap",
        args: [h.d.base, h.d.settlement, amountIn, sellBase, vault],
      }),
    };
  }
  if (!h.keeperApi)
    throw new UpsideError("NO_KEEPER_API", "Mainnet swaps need the Upside keeper API for Kuru Flow quotes.", "Pass --keeper-api <url> or set UPSIDE_KEEPER_API.");
  const res = await fetch(`${h.keeperApi}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userAddress: vault,
      tokenIn: sellBase ? h.d.base : h.d.settlement,
      tokenOut: sellBase ? h.d.settlement : h.d.base,
      amount: amountIn.toString(),
    }),
  });
  const q: any = await res.json();
  if (!res.ok || q.status !== "success") throw new UpsideError("QUOTE_FAILED", `Kuru Flow quote failed: ${q.message ?? res.status}`);
  if (BigInt(q.transaction.value || "0") !== 0n) throw new UpsideError("QUOTE_FAILED", "Unexpected native value in swap");
  const raw: string = q.transaction.calldata; // Kuru Flow returns calldata without 0x
  return { router: q.transaction.to, data: (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex };
}

// ----------------------------------------------------------------- writes

async function send(h: Host, tx: Tx, summary: string) {
  if (h.agentId != null) summary = `[ERC-8004 agent #${h.agentId}] ${summary}`;
  h.log?.(`→ ${summary}`);
  const r = await h.submit(tx, summary);
  if (r.status !== "confirmed" && r.status !== "success")
    throw new UpsideError("TX_NOT_CONFIRMED", `${summary}: transaction ${r.status}${r.hash ? ` (${r.hash})` : ""}`);
  return r.hash;
}

/** The wallet's vault, created on first use with `maxExposure` as its onchain cap on open cost. */
export async function ensureVault(h: Host, maxExposure: bigint): Promise<{ vault: Address; created: boolean }> {
  const existing = await getVault(h, h.account);
  if (existing) return { vault: existing, created: false };
  await send(
    h,
    { to: h.d.factory, data: encodeFunctionData({ abi: VaultFactoryAbi, functionName: "createVault", args: [maxExposure] }) },
    `Create Upside vault with a ${fmtQuote(maxExposure)} AUSD exposure cap`,
  );
  const vault = await getVault(h, h.account);
  if (!vault) throw new UpsideError("VAULT_MISSING", "Vault creation confirmed but no vault found for this wallet.");
  return { vault, created: true };
}

export async function setExposure(h: Host, vault: Address, maxExposure: bigint) {
  return send(
    h,
    { to: vault, data: encodeFunctionData({ abi: FollowVaultAbi, functionName: "setMaxExposure", args: [maxExposure] }) },
    `Set vault exposure cap to ${fmtQuote(maxExposure)} AUSD`,
  );
}

/** Moves AUSD from the wallet into its vault (testnet demo deployments mint test AUSD instead). */
export async function deposit(h: Host, vault: Address, amount: bigint) {
  if (h.d.demo) {
    return send(
      h,
      { to: h.d.settlement, data: encodeFunctionData({ abi: DemoTokenAbi, functionName: "faucet", args: [vault, amount] }) },
      `Mint ${fmtQuote(amount)} test AUSD into the vault (testnet faucet)`,
    );
  }
  const bal = (await h.read.readContract({ address: h.d.settlement, abi: erc20Abi, functionName: "balanceOf", args: [h.account] })) as bigint;
  if (bal < amount) throw new UpsideError("INSUFFICIENT_AUSD", `Wallet holds ${fmtQuote(bal)} AUSD; deposit needs ${fmtQuote(amount)}.`);
  return send(
    h,
    { to: h.d.settlement, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [vault, amount] }) },
    `Deposit ${fmtQuote(amount)} AUSD into the Upside vault`,
  );
}

export async function follow(h: Host, vault: Address, call: Call, amountIn: bigint, slippageBps = 200) {
  const mid = await getMid(h);
  if (!mid) throw new UpsideError("STALE_PRICE", "No fresh price onchain; the keeper may be down. Try again shortly.");
  const { router, data } = await buildSwap(h, vault, false, amountIn);
  const minOut = (((amountIn * ONE) / mid) * BigInt(10_000 - slippageBps)) / 10_000n;
  const hash = await send(
    h,
    {
      to: vault,
      data: encodeFunctionData({
        abi: FollowVaultAbi,
        functionName: "follow",
        args: [BigInt(call.id), amountIn, router, data, minOut],
      }),
    },
    `Follow Upside call #${call.id}: buy MON with ${fmtQuote(amountIn)} AUSD (caller earns ${call.feeBps / 100}% of net profit only)`,
  );
  const positionId = hash ? await positionFromReceipt(h, hash) : null;
  return { hash, positionId };
}

async function positionFromReceipt(h: Host, hash: Hex): Promise<number | null> {
  try {
    const receipt = await h.read.getTransactionReceipt({ hash });
    const ev = parseEventLogs({ abi: FollowVaultAbi, logs: receipt.logs, eventName: "Followed" })[0] as any;
    return ev ? Number(ev.args.positionId) : null;
  } catch {
    return null;
  }
}

export async function close(h: Host, vault: Address, p: Position, slippageBps = 200) {
  const mid = await getMid(h);
  if (!mid) throw new UpsideError("STALE_PRICE", "No fresh price onchain; the keeper may be down. Try again shortly.");
  const { router, data } = await buildSwap(h, vault, true, p.baseAmount);
  const fair = (p.baseAmount * mid) / ONE;
  const minOut = (fair * BigInt(10_000 - slippageBps)) / 10_000n;
  const hash = await send(
    h,
    { to: vault, data: encodeFunctionData({ abi: FollowVaultAbi, functionName: "close", args: [BigInt(p.id), router, data, minOut] }) },
    `Close Upside position #${p.id} (${fmtBase(p.baseAmount)} MON, cost ${fmtQuote(p.cost)} AUSD)`,
  );
  return { hash, estimatedProceeds: fair };
}

// ----------------------------------------------------------------- autopilot

/** Local memory so an autopilot never follows the same call twice or overspends its daily budget. */
type PilotState = { followed: number[]; spent: Record<string, string> };

function statePath(h: Pick<Host, "chainId" | "account">) {
  const dir = process.env.UPSIDE_STATE_DIR ?? join(homedir(), ".upside");
  mkdirSync(dir, { recursive: true });
  return join(dir, `autopilot-${h.chainId}-${h.account.toLowerCase()}.json`);
}
function loadState(h: Pick<Host, "chainId" | "account">): PilotState {
  try {
    return JSON.parse(readFileSync(statePath(h), "utf8"));
  } catch {
    return { followed: [], spent: {} };
  }
}
function saveState(h: Pick<Host, "chainId" | "account">, s: PilotState) {
  writeFileSync(statePath(h), JSON.stringify(s, null, 2));
}

export type PilotAction =
  | { kind: "followed"; callId: number; caller: Address; amount: string; positionId: number | null; hash?: Hex }
  | { kind: "closed"; positionId: number; callId: number; hash?: Hex }
  | { kind: "skipped"; callId: number; caller: Address; reasons: string[] }
  | { kind: "stopped"; reason: string };

/**
 * One autopilot pass: close positions whose call has expired (if asked), then follow open calls that pass the
 * rules, within the daily budget and the vault's onchain exposure cap.
 */
export async function autopilotPass(
  h: Host,
  opts: {
    rules: Rules;
    dailyBudget: bigint;
    closeExpired: boolean;
    dryRun: boolean;
    /** Nansen Smart Money lookup, called at most once per pass and only if a call passes every other rule. */
    smartMoney?: () => Promise<Map<string, { label: string }>>;
  },
): Promise<PilotAction[]> {
  const actions: PilotAction[] = [];
  const state = loadState(h);
  const day = new Date().toISOString().slice(0, 10);
  let spent = BigInt(state.spent[day] ?? "0");

  const vault = await getVault(h, h.account);
  if (!vault) return [{ kind: "stopped", reason: "No Upside vault yet. Run `mm upside deposit` first." }];
  let vs = await getVaultState(h, vault);
  const calls = await getCalls(h, { limit: 50 });
  const byId = new Map(calls.map((c) => [c.id, c]));

  if (opts.closeExpired) {
    for (const p of vs.positions.filter((p) => p.open)) {
      const c = byId.get(p.callId);
      if (c && !c.open) {
        if (opts.dryRun) actions.push({ kind: "closed", positionId: p.id, callId: p.callId });
        else {
          const r = await close(h, vault, p);
          actions.push({ kind: "closed", positionId: p.id, callId: p.callId, hash: r.hash });
        }
      }
    }
    if (!opts.dryRun) vs = await getVaultState(h, vault);
  }

  const followedHere = new Set([...state.followed, ...vs.positions.map((p) => p.callId)]);
  const candidates = calls.filter((c) => c.open && !followedHere.has(c.id)).reverse(); // oldest first
  const records = await getCallerRecords(h, candidates.map((c) => c.caller));
  let openCost = vs.openCost;
  let cash = vs.cash;
  let smart: Map<string, { label: string }> | null | undefined; // undefined: not fetched yet; null: lookup failed

  for (const c of candidates) {
    const reasons = checkCall(c, records.get(c.caller.toLowerCase() as Address), opts.rules);
    const amt = opts.rules.perCall;
    if (spent + amt > opts.dailyBudget) reasons.push(`daily budget reached (${fmtQuote(spent)} of ${fmtQuote(opts.dailyBudget)} AUSD)`);
    if (openCost + amt > vs.maxExposure) reasons.push(`vault exposure cap ${fmtQuote(vs.maxExposure)} AUSD would be exceeded`);
    if (cash < amt) reasons.push(`vault holds ${fmtQuote(cash)} AUSD; follow needs ${fmtQuote(amt)}`);
    if (!reasons.length && opts.rules.requireSmartMoney) {
      if (smart === undefined) {
        try {
          smart = opts.smartMoney ? await opts.smartMoney() : null;
        } catch (e) {
          h.log?.(`Nansen lookup failed: ${(e as Error).message}`);
          smart = null;
        }
      }
      if (smart === null) reasons.push("Nansen Smart Money check unavailable");
      else if (!smart.has(c.caller.toLowerCase())) reasons.push("caller is not a Nansen Smart Money wallet on Monad");
    }
    if (reasons.length) {
      actions.push({ kind: "skipped", callId: c.id, caller: c.caller, reasons });
      continue;
    }
    if (opts.dryRun) {
      actions.push({ kind: "followed", callId: c.id, caller: c.caller, amount: fmtQuote(amt), positionId: null });
    } else {
      const r = await follow(h, vault, c, amt);
      actions.push({ kind: "followed", callId: c.id, caller: c.caller, amount: fmtQuote(amt), positionId: r.positionId, hash: r.hash });
      state.followed.push(c.id);
      state.spent[day] = (spent + amt).toString();
      saveState(h, state);
    }
    spent += amt;
    openCost += amt;
    cash -= amt;
  }
  return actions;
}
