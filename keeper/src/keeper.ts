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
// Usage: KEEPER_KEY=0x... RPC_URL=... CHAIN_ID=... npm start
import { formatUnits, parseUnits, type Address } from "viem";
import { CallBookAbi, KeeperPriceSourceAbi, DemoTokenAbi } from "./abi.js";
import { account, deployment, publicClient, walletClient } from "./env.js";
import { kuruQuote } from "./kuru.js";
import { startApi } from "./proxy.js";

const PRICE_MODE = process.env.PRICE_MODE ?? (deployment.demo ? "demo" : "kuru");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5_000); // how often to check; checks are free reads
const PUSH_MS = Number(process.env.PUSH_MS ?? 30_000);
const ACTIVE_MS = Number(process.env.ACTIVE_MS ?? 5 * 60_000);
const ALWAYS_ON = process.env.ALWAYS_ON === "1" || deployment.chainId === 31337;

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

let demoPrice = Number(process.env.DEMO_START_PRICE ?? 2);
// Continue the walk from the price already onchain, so a keeper restart doesn't jump the price.
try {
  const onchain = await read<bigint>(deployment.priceSource, KeeperPriceSourceAbi, "midPrice", [deployment.base, deployment.settlement]);
  if (onchain > 0n) demoPrice = Number(formatUnits((onchain * 10n ** BigInt(baseDec)) / 10n ** 18n, quoteDec));
} catch {
  // stale or never pushed: start from DEMO_START_PRICE
}
function nextDemoPrice(): number {
  // gentle random walk with occasional jumps so calls resolve both ways
  const shock = (Math.random() - 0.5) * 0.01 + (Math.random() < 0.05 ? (Math.random() - 0.5) * 0.06 : 0);
  demoPrice = Math.max(0.2, demoPrice * (1 + shock));
  return demoPrice;
}

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

startApi({ onPoke: () => (lastPoke = Date.now()) });
console.log(
  `keeper ${account.address} · chain ${deployment.chainId} · price mode ${PRICE_MODE} · ` +
    (ALWAYS_ON ? `push every ${PUSH_MS / 1000}s` : `push every ${PUSH_MS / 1000}s while apps are open, else only to score`),
);
let lastPush = 0;
let lastPoke = Date.now(); // treat startup as activity, so the price is fresh right away
for (;;) {
  try {
    const due = await expiredCalls();
    const active = ALWAYS_ON || Date.now() - lastPoke < ACTIVE_MS;
    if (due.length || (active && Date.now() - lastPush >= PUSH_MS)) {
      const p = await pushPrice();
      lastPush = Date.now();
      const scored = due.length ? await scoreExpired(due) : [];
      console.log(
        `${new Date().toISOString()} mid ${p.toFixed(4)}${scored.length ? ` · scored calls ${scored.join(", ")}` : ""}`,
      );
    }
  } catch (e) {
    console.error("tick failed:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
