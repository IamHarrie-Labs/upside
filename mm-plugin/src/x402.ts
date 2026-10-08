// x402 (HTTP 402 Payment Required) paid requests, signed by the Agent Wallet.
//
// The x402 "exact" EVM scheme pays with an EIP-3009 transferWithAuthorization: the payer signs EIP-712 typed data
// and the seller's facilitator settles it onchain. Here the signature comes from MetaMask's wallet executor
// (kind "typed-data"), so the payment is policy-checked like any other wallet action and the key never leaves
// MetaMask. A price cap is enforced before anything is signed.
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { saveLedger, withLedgerLock } from "./ledger.js";
import { UpsideError } from "./core.js";

export type TypedData = { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
export type TypedDataSigner = { address: Address; signTypedData(td: TypedData): Promise<Hex> };

export type Paid<T> = {
  data: T;
  payment: { network: string; asset: string; amount: string; payTo: string; settled: boolean; transaction?: string } | null;
};

const NETWORK = "eip155:143"; // Monad mainnet: USDC 0x754704Bc059F8C67012fEd69BC8A327a5aafb603
const USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
export function validatePaymentOffer(offer: any, maxUsd: number) {
  if (!Number.isFinite(maxUsd) || maxUsd < 0) throw new UpsideError("INVALID_CAP", "Payment cap must be finite and non-negative.");
  if (offer.network !== NETWORK || offer.scheme !== "exact" || String(offer.asset).toLowerCase() !== USDC) throw new UpsideError("X402_ASSET_REFUSED", "Only exact USDC payments on Monad mainnet are allowed.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(offer.payTo) || !/^\d+$/.test(String(offer.amount))) throw new UpsideError("X402_INVALID_OFFER", "Invalid payment recipient or amount.");
  if (!Number.isSafeInteger(offer.maxTimeoutSeconds) || offer.maxTimeoutSeconds <= 0 || offer.maxTimeoutSeconds > 300) throw new UpsideError("X402_INVALID_OFFER", "Payment authorization timeout must be 1–300 seconds.");
  const amount = BigInt(offer.amount);
  if (amount > parseUnits(maxUsd.toFixed(6), 6)) throw new UpsideError("PRICE_TOO_HIGH", `Payment exceeds your $${maxUsd} cap.`);
  return amount;
}

/**
 * fetch() that pays x402 challenges with USDC on Monad, up to `maxUsd` per request.
 * Throws PRICE_TOO_HIGH without signing when the seller asks for more.
 */
export async function paidFetch<T = unknown>(
  url: string,
  init: RequestInit,
  signer: TypedDataSigner,
  opts: { maxUsd: number; log?: (m: string) => void; beforeAuthorize?: (amount: bigint) => void },
): Promise<Paid<T>> {
  const request = { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) };
  const first = await fetch(url, request);
  if (first.status !== 402) return { data: await body<T>(first, url), payment: null };

  const client = new x402Client();
  registerExactEvmScheme(client, { signer, networks: [NETWORK] });
  const http = new x402HTTPClient(client);
  const required = http.getPaymentRequiredResponse((n) => first.headers.get(n), await first.clone().json().catch(() => undefined));

  const offer = required.accepts.find((a: any) => a.network === NETWORK);
  if (!offer)
    throw new UpsideError(
      "X402_NO_MONAD",
      `${new URL(url).host} doesn't accept payment on Monad (offers: ${required.accepts.map((a: any) => a.network).join(", ")}).`,
      "Pay this service another way.",
    );
  const usd = Number(formatUnits(BigInt((offer as any).amount), 6)); // USDC has 6 decimals
  const authorizedAmount = validatePaymentOffer(offer, opts.maxUsd);
  opts.beforeAuthorize?.(authorizedAmount);
  opts.log?.(`→ x402: paying $${usd} USDC on Monad to ${new URL(url).host}`);

  const payload = await http.createPaymentPayload({ ...required, accepts: [offer] });
  const paid = await fetch(url, { ...request, headers: { ...headersOf(init), ...http.encodePaymentSignatureHeader(payload) } });
  if (paid.status === 402) {
    const again: any = await paid.json().catch(() => ({}));
    throw new UpsideError("X402_REJECTED", `Payment rejected: ${again.error ?? again.message ?? "402"}`, "Check the wallet holds USDC on Monad mainnet.");
  }
  let settle: any = null;
  try {
    settle = http.getPaymentSettleResponse((n) => paid.headers.get(n));
  } catch {
    settle = null;
  }
  return {
    data: await body<T>(paid, url),
    payment: {
      network: NETWORK,
      asset: (offer as any).asset,
      amount: usd.toFixed(2),
      payTo: (offer as any).payTo,
      settled: !!settle?.success,
      transaction: settle?.transaction,
    },
  };
}

function headersOf(init: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init.headers ?? {}).entries());
}

async function body<T>(res: Response, url: string): Promise<T> {
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new UpsideError("REQUEST_FAILED", `${new URL(url).host} ${res.status}: ${json.message ?? json.error ?? "request failed"}`);
  return json as T;
}

// ----------------------------------------------------------------- Nansen via x402

export type SmartMoney = Map<string, { label: string; trades: number; volumeUsd: number }>;

/**
 * Nansen Smart Money wallets trading on Monad ($0.05 per request, paid with x402). One request covers every
 * caller, so autopilot pays once per pass at most.
 */
export async function nansenSmartMoney(signer: TypedDataSigner, opts: { maxUsd: number; maxDailyUsd?: number; log?: (m: string) => void }) {
  const path = join(process.env.UPSIDE_STATE_DIR ?? join(homedir(), ".upside"), `intelligence-143-${signer.address.toLowerCase()}.json`);
  return withLedgerLock(path, async () => {
  const day = new Date().toISOString().slice(0,10);
  const cap = opts.maxDailyUsd ?? 1;
  if (!Number.isFinite(cap) || cap < 0) throw new UpsideError("INVALID_CAP", "Daily intelligence cap must be finite and non-negative.");
  let state: any = { day, reserved: "0" };
  if (existsSync(path)) {
    try { state = JSON.parse(readFileSync(path,"utf8")); } catch { throw new UpsideError("INTEL_STATE_INVALID", "Unreadable intelligence budget; refusing to reset it."); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !/^\d+$/.test(state.reserved) || (state.cachedAt !== undefined && (!Number.isFinite(state.cachedAt) || !Array.isArray(state.entries)))) throw new UpsideError("INTEL_STATE_INVALID", "Malformed intelligence budget; no payment signed.");
  }
  if (state.day !== day) state = { ...state, day, reserved: "0" };
  if (state.cachedAt && Date.now()-state.cachedAt < 30*60_000 && state.cachedAt <= Date.now()) {
    opts.log?.("Nansen: cached snapshot of recent Smart Money trades; no new payment.");
    return {smartMoney:new Map(state.entries) as SmartMoney,payment:null,cached:true};
  }
  const r = await paidFetch<{ data?: any[] }>(
    "https://api.nansen.ai/api/v1/smart-money/dex-trades",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chains: ["monad"], pagination: { page: 1, per_page: 1000 } }),
    },
    signer,
    {...opts,beforeAuthorize:(amount) => {
      if (BigInt(state.reserved) + amount > parseUnits(cap.toFixed(6),6)) throw new UpsideError("INTEL_BUDGET_REACHED", `Daily USDC intelligence cap $${cap} reached; no payment signed.`);
      state.reserved = (BigInt(state.reserved)+amount).toString();
      // Reserve before signing, including uncertain/failed settlement; never auto-refund an authorization.
      saveLedger(path,state);
    }},
  );
  if (r.payment && !r.payment.settled) throw new UpsideError("X402_UNCONFIRMED", "Provider did not confirm payment settlement. Budget remains reserved.");
  if (!Array.isArray(r.data.data)) throw new UpsideError("NANSEN_BAD_RESPONSE", "Nansen returned no trade dataset; classification unavailable.");
  const map: SmartMoney = new Map();
  for (const t of r.data.data ?? []) {
    const a = String(t.trader_address ?? "").toLowerCase();
    if (!a) continue;
    const cur = map.get(a) ?? { label: t.trader_address_label || "Smart Money", trades: 0, volumeUsd: 0 };
    cur.trades++;
    cur.volumeUsd += Number(t.trade_value_usd ?? 0);
    map.set(a, cur);
  }
  state.cachedAt = Date.now(); state.entries = [...map.entries()]; saveLedger(path,state);
  return { smartMoney: map, payment: r.payment, cached:false };
  });
}
