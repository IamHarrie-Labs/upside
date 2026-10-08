// Upside keeper: keeps the order-book mid fresh onchain and scores calls as soon as their horizon passes.
//
//   PRICE_MODE=demo  random walk around DEMO_START_PRICE (testnet / local demos)
//   PRICE_MODE=kuru  mid from two tiny Kuru Flow quotes (mainnet; needs KURU_FLOW_URL reachable)
//
// Prices are pushed on demand, because every push costs gas (about 0.005 MON on testnet):
//   - every PUSH_MS (default 30s) while an app or the MetaMask plugin has pinged POST /poke in the last ACTIVE_MS (5 min);
//   - right before scoring a call whose horizon has passed;
//   - ALWAYS_ON=1 restores a push every PUSH_MS regardless (local demos).
// With nobody using Upside, the keeper sends nothing.
//
// MAX_DAILY_MON (default 1; unlimited on a local chain) caps gas for activity pushes per UTC day, since anyone can
// call /poke. Pushes needed to score expired calls are always sent: once capped, the price goes stale, so no new
// calls can be posted and that work is bounded by the calls already open.
//
// Demo prices move by elapsed time, not by number of pushes (DEMO_DAILY_VOL, default 8% a day), so calls that
// expire while nobody is watching still see a realistic move.
//
// Usage: KEEPER_KEY=0x... RPC_URL=... CHAIN_ID=... npm start
import { encodeAbiParameters, formatEther, formatUnits, keccak256, parseEther, parseUnits, type Address } from "viem";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { CallBookAbi, KeeperPriceSourceAbi, DemoTokenAbi } from "./abi.js";
import { account, deployment, publicClient, walletClient } from "./env.js";
import { kuruQuote } from "./kuru.js";
import { startApi } from "./proxy.js";
import { syncFlow } from "./flow.js";

const PRICE_MODE = process.env.PRICE_MODE ?? (deployment.demo ? "demo" : "kuru");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5_000); // how often to check; checks are free reads
const PUSH_MS = Number(process.env.PUSH_MS ?? 30_000);
const ACTIVE_MS = Number(process.env.ACTIVE_MS ?? 5 * 60_000);
const ALWAYS_ON = process.env.ALWAYS_ON === "1" || deployment.chainId === 31337;
const MAX_DAILY = process.env.MAX_DAILY_MON
  ? parseEther(process.env.MAX_DAILY_MON)
  : deployment.chainId === 31337
    ? null
    : parseEther("1");

const read = <T>(address: Address, abi: any, functionName: string, args: any[] = []) =>
  publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

const [baseDec, quoteDec] = await Promise.all([
  read<number>(deployment.base, DemoTokenAbi, "decimals"),
  read<number>(deployment.settlement, DemoTokenAbi, "decimals"),
]);

/** Human price (quote per 1 base) -> raw quote units per raw base unit, scaled 1e18. */
function toPriceX18(human: number): bigint {
  const quotePerBase = parseUnits(human.toFixed(8), quoteDec); // quote raw per 1 whole base
  return (quotePerBase * 10n ** 18n) / 10n ** BigInt(baseDec);
}

/**
 * Last pushed quote, read from storage so it works even when midPrice() reverts as stale.
 * KeeperPriceSource layout: _quotes is the mapping at slot 2; Quote packs priceX18 (low 192 bits) and updatedAt.
 */
async function lastQuote(): Promise<{ priceX18: bigint; updatedAt: number } | null> {
  const key = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }], [deployment.base, deployment.settlement]));
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [key, 2n]));
  const raw = BigInt((await publicClient.getStorageAt({ address: deployment.priceSource, slot })) ?? "0x0");
  const priceX18 = raw & ((1n << 192n) - 1n);
  return priceX18 ? { priceX18, updatedAt: Number(raw >> 192n) } : null;
}

// Demo price: a random walk calibrated in time, so its volatility doesn't depend on how often the keeper pushes.
// Daily volatility DEMO_DAILY_VOL (default 8%) plus occasional jumps (about 2 a day of up to ±1.5%), so short
// calls resolve both ways and long ones see realistic moves. Bounded to [DEMO_MIN, DEMO_MAX].
const DAILY_VOL = Number(process.env.DEMO_DAILY_VOL ?? 0.08);
const JUMPS_PER_DAY = Number(process.env.DEMO_JUMPS_PER_DAY ?? 2);
const DEMO_MIN = Number(process.env.DEMO_MIN ?? 0.5);
const DEMO_MAX = Number(process.env.DEMO_MAX ?? 5);
let demoPrice = Number(process.env.DEMO_START_PRICE ?? 2);
let lastStepAt = Date.now();
// Continue from the price already onchain, and walk through the time since it was pushed.
const prev = await lastQuote().catch(() => null);
if (prev) {
  demoPrice = Number(formatUnits((prev.priceX18 * 10n ** BigInt(baseDec)) / 10n ** 18n, quoteDec));
  lastStepAt = prev.updatedAt * 1000;
}
if (process.env.DEMO_RESET_PRICE) demoPrice = Number(process.env.DEMO_RESET_PRICE); // one-off re-anchor

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

function nextDemoPrice(): number {
  const days = Math.min(Math.max(Date.now() - lastStepAt, 1_000) / 86_400_000, 30);
  let logReturn = DAILY_VOL * Math.sqrt(days) * gauss();
  // Poisson number of jumps over the elapsed time
  let k = 0;
  for (let l = Math.exp(-JUMPS_PER_DAY * days), p = Math.random(); p > l && k < 50; k++) p *= Math.random();
  for (let i = 0; i < k; i++) logReturn += (Math.random() - 0.5) * 0.03;
  demoPrice = Math.min(DEMO_MAX, Math.max(DEMO_MIN, demoPrice * Math.exp(logReturn)));
  lastStepAt = Date.now();
  return demoPrice;
}

// Gas spent per UTC day, measured from the keeper's balance around each transaction (Monad bills the gas limit).
// Saved to SPEND_STATE (if set) so a restart doesn't reset the daily cap.
const SPEND_STATE = process.env.SPEND_STATE;
let spentDay = "";
let spentToday = 0n;
try {
  if (SPEND_STATE) ({ day: spentDay, wei: spentToday } = ((s) => ({ day: s.day as string, wei: BigInt(s.wei) }))(JSON.parse(readFileSync(SPEND_STATE, "utf8"))));
} catch (e:any) {
  if(e.code!=="ENOENT") throw new Error("Spend state is unreadable; restore it before restarting the keeper.");
}
async function metered<T>(fn: () => Promise<T>): Promise<T> {
  const before = await publicClient.getBalance({ address: account.address });
  try {
    return await fn();
  } finally {
    const after = await publicClient.getBalance({ address: account.address }).catch(() => before);
    const day = new Date().toISOString().slice(0, 10);
    if (day !== spentDay) (spentDay = day), (spentToday = 0n);
    if (before > after) spentToday += before - after;
    try {
      if (SPEND_STATE) {writeFileSync(`${SPEND_STATE}.tmp`, JSON.stringify({ day: spentDay, wei: spentToday.toString() }));renameSync(`${SPEND_STATE}.tmp`,SPEND_STATE);}
    } catch {
      console.error("Could not persist keeper spend state; stopping to preserve the daily allowance.");
      process.exit(1);
    }
  }
}
const capped = () => MAX_DAILY !== null && spentDay === new Date().toISOString().slice(0, 10) && spentToday >= MAX_DAILY;

async function kuruMid(): Promise<number> {
  // Kuru Flow quotes are executable prices; the mid is the average of a small buy and a small sell.
  const oneQuote = parseUnits("10", quoteDec);
  const oneBase = parseUnits("100", baseDec);
  const buy = await kuruQuote(account.address, deployment.settlement, deployment.base, oneQuote);
  const sell = await kuruQuote(account.address, deployment.base, deployment.settlement, oneBase);
  const ask = 10 / Number(formatUnits(buy.output, baseDec));
  const bid = Number(formatUnits(sell.output, quoteDec)) / 100;
  return (ask + bid) / 2;
}

async function pushPrice() {
  const human = PRICE_MODE === "kuru" ? await kuruMid() : nextDemoPrice();
  const hash = await walletClient.writeContract({
    address: deployment.priceSource,
    abi: KeeperPriceSourceAbi,
    functionName: "push",
    args: [deployment.base, deployment.settlement, toPriceX18(human)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return human;
}

/** Ids of calls past their horizon and not yet scored. Scans from the first unscored call onward. */
let firstUnscored = 0n;
async function expiredCalls(): Promise<bigint[]> {
  const count = await read<bigint>(deployment.callBook, CallBookAbi, "callCount");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const due: bigint[] = [];
  let allScoredSoFar = true;
  for (let id = firstUnscored; id < count; id++) {
    const c = await read<any>(deployment.callBook, CallBookAbi, "getCall", [id]);
    if (c.scored) {
      if (allScoredSoFar) firstUnscored = id + 1n;
      continue;
    }
    allScoredSoFar = false;
    if (BigInt(c.expiry) <= now) due.push(id);
  }
  return due;
}

async function scoreExpired(due: bigint[]) {
  const scored: number[] = [];
  for (const id of due) {
    try {
      const hash = await walletClient.writeContract({
        address: deployment.callBook,
        abi: CallBookAbi,
        functionName: "scoreCall",
        args: [id],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      scored.push(Number(id));
    } catch (e) {
      // block time can lag wall-clock time slightly; retry next tick
    }
  }
  return scored;
}

startApi({
  onPoke: () => (lastPoke = Date.now()),
  status: () => ({ capped: capped(), spentTodayMon: formatEther(spentToday), maxDailyMon: MAX_DAILY === null ? null : formatEther(MAX_DAILY) }),
});
console.log(
  `keeper ${account.address} · chain ${deployment.chainId} · price mode ${PRICE_MODE} · ` +
    (ALWAYS_ON ? `push every ${PUSH_MS / 1000}s` : `push every ${PUSH_MS / 1000}s while apps are open, else only to score`) +
    (MAX_DAILY === null ? "" : ` · activity pushes capped at ${formatEther(MAX_DAILY)} MON/day`),
);
let cappedLogged = "";
let lastPush = 0;
let lastPoke = Date.now(); // treat startup as activity, so the price is fresh right away
for (;;) {
  void syncFlow(); // follower counts for GET /flow (free reads, 100-block chunks)
  try {
    const due = await expiredCalls();
    const active = ALWAYS_ON || Date.now() - lastPoke < ACTIVE_MS;
    const wantActivityPush = active && Date.now() - lastPush >= PUSH_MS;
    if (wantActivityPush && !due.length && capped()) {
      if (cappedLogged !== spentDay) {
        cappedLogged = spentDay;
        console.warn(`daily gas cap reached (${formatEther(spentToday)} MON): activity pushes paused until 00:00 UTC; scoring continues`);
      }
    } else if (due.length || wantActivityPush) {
      const p = await metered(pushPrice);
      lastPush = Date.now();
      const scored = due.length ? await metered(() => scoreExpired(due)) : [];
      console.log(
        `${new Date().toISOString()} mid ${p.toFixed(4)}${scored.length ? ` · scored calls ${scored.join(", ")}` : ""}` +
          (MAX_DAILY === null ? "" : ` · today ${Number(formatEther(spentToday)).toFixed(3)}/${formatEther(MAX_DAILY)} MON`),
      );
    }
  } catch (e) {
    console.error("tick failed:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
