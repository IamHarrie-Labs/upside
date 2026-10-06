// GENERATED from app/src/lib/upside.ts by scripts/sync-mobile.mjs. Edit the source, then re-run the script.
// Reads and writes against the Upside contracts.
import { encodeFunctionData, formatUnits, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import {
  AttestedGateAbi,
  CallBookAbi,
  DemoRouterAbi,
  DemoTokenAbi,
  FollowVaultAbi,
  HandlesAbi,
  KeeperPriceSourceAbi,
  VaultFactoryAbi,
} from "../abi";
import { deployment as d, IS_LOCAL, KEEPER_API, publicClient } from "../env";
import type { Session } from "./account";

export const QUOTE_DECIMALS = 6; // AUSD
export const BASE_DECIMALS = 18; // WMON
export const QUOTE_SYMBOL = d.demo ? "AUSD" : "AUSD";
export const BASE_SYMBOL = d.demo ? "MON" : "MON";

export type Call = {
  id: number;
  caller: Address;
  side: number;
  feeBps: number;
  verifiedAtPost: boolean;
  scored: boolean;
  postedAt: number;
  expiry: number;
  entryMid: bigint;
  targetMid: bigint;
  stopMid: bigint;
  exitMid: bigint;
  returnBps: number;
  followers: number;
  followedVolume: bigint;
};

export type CallerStats = {
  address: Address;
  verified: boolean;
  posted: number;
  scored: number;
  wins: number;
  avgReturnBps: number;
};

export type Position = {
  id: number;
  callId: number;
  caller: Address;
  baseAmount: bigint;
  cost: bigint;
  open: boolean;
};

const ONE = 10n ** 18n;

/** priceX18 (raw quote per raw base, 1e18) -> human quote per whole base. */
export function humanPrice(priceX18: bigint): number {
  return Number(formatUnits((priceX18 * 10n ** BigInt(BASE_DECIMALS)) / ONE, QUOTE_DECIMALS));
}
export function toPriceX18(human: number): bigint {
  return (parseUnits(human.toFixed(6), QUOTE_DECIMALS) * ONE) / 10n ** BigInt(BASE_DECIMALS);
}
export const fmtQuote = (raw: bigint, digits = 2) => Number(formatUnits(raw, QUOTE_DECIMALS)).toFixed(digits);
export const fmtBase = (raw: bigint, digits = 3) => Number(formatUnits(raw, BASE_DECIMALS)).toFixed(digits);
export const parseQuote = (s: string) => parseUnits(s || "0", QUOTE_DECIMALS);

// ----------------------------------------------------------------- reads

/** Tells the keeper an app is open so it keeps the onchain price fresh (it pushes on demand to save gas). */
let lastPoke = 0;
export function pokeKeeper() {
  if (Date.now() - lastPoke < 60_000) return;
  lastPoke = Date.now();
  fetch(`${KEEPER_API}/poke`, { method: "POST" }).catch(() => {});
}

export async function getMid(): Promise<bigint | null> {
  pokeKeeper();
  try {
    return (await publicClient.readContract({
      address: d.priceSource,
      abi: KeeperPriceSourceAbi,
      functionName: "midPrice",
      args: [d.base, d.settlement],
    })) as bigint;
  } catch {
    return null; // stale: keeper not running
  }
}

export async function getCalls(): Promise<Call[]> {
  const count = Number(
    await publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "callCount" }),
  );
  const ids = Array.from({ length: count }, (_, i) => i);
  const raw = await Promise.all(
    ids.map((i) =>
      publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "getCall", args: [BigInt(i)] }),
    ),
  );
  const flow = await getFollowFlow();
  return raw
    .map((c: any, i) => ({
      id: i,
      caller: c.caller,
      side: Number(c.side),
      feeBps: Number(c.feeBps),
      verifiedAtPost: c.verifiedAtPost,
      scored: c.scored,
      postedAt: Number(c.postedAt),
      expiry: Number(c.expiry),
      entryMid: c.entryMid,
      targetMid: c.targetMid,
      stopMid: c.stopMid,
      exitMid: c.exitMid,
      returnBps: Number(c.returnBps),
      followers: flow.get(i)?.followers ?? 0,
      followedVolume: flow.get(i)?.volume ?? 0n,
    }))
    .reverse();
}

const FOLLOWED = {
  type: "event",
  name: "Followed",
  inputs: [
    { name: "positionId", type: "uint256", indexed: true },
    { name: "callId", type: "uint256", indexed: true },
    { name: "caller", type: "address", indexed: true },
    { name: "amountIn", type: "uint256", indexed: false },
    { name: "baseOut", type: "uint256", indexed: false },
  ],
} as const;

/** Follower count and volume per call, from Followed events of every vault. The indexer serves this at scale. */
async function getFollowFlow(): Promise<Map<number, { followers: number; volume: bigint }>> {
  const out = new Map<number, { followers: number; volume: bigint }>();
  try {
    const logs = await publicClient.getLogs({ event: FOLLOWED, fromBlock: BigInt(d.startBlock), toBlock: "latest" });
    for (const l of logs) {
      const id = Number(l.args.callId);
      const cur = out.get(id) ?? { followers: 0, volume: 0n };
      out.set(id, { followers: cur.followers + 1, volume: cur.volume + (l.args.amountIn ?? 0n) });
    }
  } catch {
    // RPC log range limits: counts are optional
  }
  return out;
}

export async function getCallerStats(addresses: Address[]): Promise<Map<Address, CallerStats>> {
  const unique = [...new Set(addresses)];
  const rows = await Promise.all(
    unique.map(async (a) => {
      const [rec, verified] = await Promise.all([
        publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "records", args: [a] }),
        publicClient.readContract({ address: d.gate, abi: AttestedGateAbi, functionName: "isVerified", args: [a] }),
      ]);
      const [sum, posted, scored, wins] = rec as readonly [bigint, number, number, number];
      return {
        address: a,
        verified: verified as boolean,
        posted: Number(posted),
        scored: Number(scored),
        wins: Number(wins),
        avgReturnBps: Number(scored) ? Number(sum) / Number(scored) : 0,
      } satisfies CallerStats;
    }),
  );
  return new Map(rows.map((r) => [r.address, r]));
}

export async function getVault(owner: Address): Promise<Address | null> {
  const v = (await publicClient.readContract({
    address: d.factory,
    abi: VaultFactoryAbi,
    functionName: "vaultOf",
    args: [owner],
  })) as Address;
  return v === zeroAddress ? null : v;
}

export async function getVaultState(vault: Address) {
  const read = (functionName: string, args: any[] = []) =>
    publicClient.readContract({ address: vault, abi: FollowVaultAbi, functionName, args } as any);
  const [count, maxExposure, openCost, cash] = await Promise.all([
    read("positionCount"),
    read("maxExposure"),
    read("openCost"),
    publicClient.readContract({ address: d.settlement, abi: DemoTokenAbi, functionName: "balanceOf", args: [vault] }),
  ]);
  const positions: Position[] = await Promise.all(
    Array.from({ length: Number(count) }, async (_, i) => {
      const p: any = await read("getPosition", [BigInt(i)]);
      return {
        id: i,
        callId: Number(p.callId),
        caller: p.caller,
        baseAmount: p.baseAmount,
        cost: p.cost,
        open: p.open,
      };
    }),
  );
  const callers = [...new Set(positions.map((p) => p.caller))];
  const pnl = new Map<Address, { net: bigint; hwm: bigint }>();
  await Promise.all(
    callers.map(async (c) => {
      const [net, hwm] = await Promise.all([read("netPnl", [c]), read("highWater", [c])]);
      pnl.set(c, { net: net as bigint, hwm: hwm as bigint });
    }),
  );
  return {
    positions: positions.reverse(),
    maxExposure: maxExposure as bigint,
    openCost: openCost as bigint,
    cash: cash as bigint,
    pnl,
  };
}

/** Caller fee if this position were closed at `mid` now, under the vault's high-water-mark rule. */
export function previewFee(p: Position, mid: bigint, feeBps: number, net: bigint, hwm: bigint, verified: boolean) {
  const proceeds = (p.baseAmount * mid) / ONE;
  const pnl = proceeds - p.cost;
  const after = net + pnl;
  const gain = after > hwm ? after - hwm : 0n;
  const fee = verified ? (gain * BigInt(feeBps)) / 10_000n : 0n;
  return { proceeds, pnl, fee, stillDown: after <= hwm };
}

// ----------------------------------------------------------------- swap routing

/** Builds router calldata. Demo deployments use DemoRouter; mainnet uses Kuru Flow quotes for the vault. */
async function buildSwap(vault: Address, sellBase: boolean, amountIn: bigint): Promise<{ router: Address; data: Hex }> {
  if (d.demo) {
    return {
      router: d.router,
      data: encodeFunctionData({
        abi: DemoRouterAbi,
        functionName: "swap",
        args: [d.base, d.settlement, amountIn, sellBase, vault],
      }),
    };
  }
  // The keeper proxies Kuru Flow (JWT per user address, 1 request/second).
  const res = await fetch(`${KEEPER_API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userAddress: vault,
      tokenIn: sellBase ? d.base : d.settlement,
      tokenOut: sellBase ? d.settlement : d.base,
      amount: amountIn.toString(),
    }),
  });
  const q = await res.json();
  if (!res.ok || q.status !== "success") throw new Error(`Kuru Flow quote failed: ${q.message ?? res.status}`);
  if (BigInt(q.transaction.value || "0") !== 0n) throw new Error("Unexpected native value in swap");
  // Kuru Flow returns calldata without the 0x prefix.
  const raw: string = q.transaction.calldata;
  return { router: q.transaction.to, data: (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex };
}

// ----------------------------------------------------------------- handles

export async function getHandles(addresses: Address[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!d.handles) return out;
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const names = await Promise.all(
    unique.map((a) =>
      publicClient.readContract({ address: d.handles!, abi: HandlesAbi, functionName: "handleOf", args: [a as Address] }),
    ),
  );
  unique.forEach((a, i) => names[i] && out.set(a, names[i] as string));
  return out;
}

export const toHandle = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);

// ----------------------------------------------------------------- writes

async function send(s: Session, req: { address: Address; abi: any; functionName: string; args?: any[] }) {
  const hash = await s.wallet.writeContract({ ...req, account: s.account, chain: s.wallet.chain } as any);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  return hash;
}

/** Local chain only: give a new passkey account gas. */
export async function devFundGas(addr: Address) {
  if (!IS_LOCAL) return;
  await fetch(publicClient.chain!.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [addr, "0x56BC75E2D63100000"] }),
  });
}

export async function postCall(
  s: Session,
  args: { target: number; stop: number; feeBps: number; horizonSec: number },
) {
  return send(s, {
    address: d.callBook,
    abi: CallBookAbi,
    functionName: "postCall",
    args: [d.base, d.settlement, 0, toPriceX18(args.target), toPriceX18(args.stop), args.feeBps, args.horizonSec],
  });
}

export async function ensureVault(s: Session, maxExposure: bigint): Promise<Address> {
  const existing = await getVault(s.account.address);
  if (existing) return existing;
  await send(s, { address: d.factory, abi: VaultFactoryAbi, functionName: "createVault", args: [maxExposure] });
  return (await getVault(s.account.address))!;
}

/** Demo deployments only: mint test AUSD straight into the vault. */
export async function demoFaucet(s: Session, vault: Address, amount: bigint) {
  return send(s, { address: d.settlement, abi: DemoTokenAbi, functionName: "faucet", args: [vault, amount] });
}

export async function setExposure(s: Session, vault: Address, maxExposure: bigint) {
  return send(s, { address: vault, abi: FollowVaultAbi, functionName: "setMaxExposure", args: [maxExposure] });
}

export async function follow(s: Session, vault: Address, callId: number, amountIn: bigint, mid: bigint) {
  const { router, data } = await buildSwap(vault, false, amountIn);
  const fair = (amountIn * ONE) / mid;
  const minOut = (fair * 98n) / 100n; // 2% follower-side slippage limit
  return send(s, {
    address: vault,
    abi: FollowVaultAbi,
    functionName: "follow",
    args: [BigInt(callId), amountIn, router, data, minOut],
  });
}

export async function closePosition(s: Session, vault: Address, p: Position, mid: bigint) {
  const { router, data } = await buildSwap(vault, true, p.baseAmount);
  const minOut = (((p.baseAmount * mid) / ONE) * 98n) / 100n;
  return send(s, {
    address: vault,
    abi: FollowVaultAbi,
    functionName: "close",
    args: [BigInt(p.id), router, data, minOut],
  });
}

export async function withdrawCash(s: Session, vault: Address, amount: bigint) {
  return send(s, {
    address: vault,
    abi: FollowVaultAbi,
    functionName: "withdraw",
    args: [d.settlement, amount, s.account.address],
  });
}

export async function setHandle(s: Session, handle: string) {
  if (!d.handles) throw new Error("Handles contract not deployed");
  return send(s, { address: d.handles, abi: HandlesAbi, functionName: "setHandle", args: [handle] });
}
