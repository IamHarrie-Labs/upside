// Nansen intelligence for callers, served to the apps by the keeper API.
//
// Two sources, chosen by environment:
//   NANSEN_API_KEY set   -> POST /api/v1/profiler/address/labels per caller (chain "monad"); full Nansen labels.
//   NANSEN_PAY=1         -> pay per call with USDC on Monad mainnet (x402, eip155:143, $0.05):
//                           POST /api/v1/smart-money/dex-trades on Monad, refreshed every NANSEN_REFRESH_MIN
//                           minutes, gives the set of Smart Money wallets trading on Monad and their labels.
//                           The paying wallet is NANSEN_PAY_KEY (defaults to KEEPER_KEY) and needs USDC on Monad.
// Labels endpoints are API-key only; Smart Money endpoints accept x402 (Nansen docs, verified 2026-10-06).
import {paidNansen} from "./payments.js";
import { deployment } from "./env.js";

const API = "https://api.nansen.ai";
const API_KEY = process.env.NANSEN_API_KEY;
const PAY = process.env.NANSEN_PAY === "1";
const REFRESH_MS = Number(process.env.NANSEN_REFRESH_MIN ?? 30) * 60_000;

export type NansenInfo = { labels: string[]; smartMoney: boolean; source: "labels" | "smart-money-trades" };
// Local development only (chain 31337): NANSEN_MOCK="0xaddr:Label|Label2,0xaddr2:Label" to preview the UI.
const MOCK = deployment.chainId === 31337 ? process.env.NANSEN_MOCK : undefined;
export const nansenMode: "labels" | "x402" | "mock" | "off" = API_KEY ? "labels" : PAY ? "x402" : MOCK ? "mock" : "off";

async function post(path: string, body: unknown) {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", ...(API_KEY ? { apikey: API_KEY } : {}) },
    body: JSON.stringify(body),
  };
  const res = await (nansenMode === "x402" ? paidNansen : fetch)(`${API}${path}`, {...init,signal:AbortSignal.timeout(30_000)});
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nansen ${res.status}: ${json.message ?? json.error ?? "request failed"}`);
  return json;
}

// --- API-key mode: labels per address, cached for 6 hours
const labelCache = new Map<string, { at: number; info: NansenInfo }>();

async function labelsFor(address: string): Promise<NansenInfo> {
  const hit = labelCache.get(address);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.info;
  const json = await post("/api/v1/profiler/address/labels", {
    address,
    chain: "monad",
    pagination: { page: 1, per_page: 50 },
  });
  const labels: string[] = (json.data ?? []).map((l: any) => l.label).filter(Boolean);
  const info: NansenInfo = {
    labels,
    smartMoney: (json.data ?? []).some((l: any) => /smart/i.test(`${l.category} ${l.label}`)),
    source: "labels",
  };
  labelCache.set(address, { at: Date.now(), info });
  return info;
}

// --- x402 mode: Smart Money wallets active on Monad, refreshed periodically
let smartMoney = new Map<string, string>(); // address -> Nansen label
let refreshedAt = 0;
let attemptedAt = 0;
let refreshing: Promise<void> | null = null;

async function refreshSmartMoney() {
  const json = await post("/api/v1/smart-money/dex-trades", {
    chains: ["monad"],
    pagination: { page: 1, per_page: 1000 },
  });
  const next = new Map<string, string>();
  for (const t of json.data ?? []) {
    if (t.trader_address) next.set(String(t.trader_address).toLowerCase(), t.trader_address_label || "Smart Money");
  }
  smartMoney = next;
  refreshedAt = Date.now();
  console.log(`Nansen: ${next.size} Smart Money wallets active on Monad (paid via x402 on Monad)`);
}

export async function nansenFor(addresses: string[]): Promise<Record<string, NansenInfo | null>> {
  const out: Record<string, NansenInfo | null> = {};
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, 50);
  if (nansenMode === "mock") {
    const table = new Map(
      MOCK!.split(",").map((e) => {
        const [a, l] = e.split(":");
        return [a.toLowerCase(), l.split("|")] as const;
      }),
    );
    for (const a of unique) {
      const labels = table.get(a);
      out[a] = labels ? { labels, smartMoney: labels.some((l) => /smart/i.test(l)), source: "labels" } : null;
    }
  } else if (nansenMode === "labels") {
    await Promise.all(
      unique.map(async (a) => {
        try {
          out[a] = await labelsFor(a);
        } catch {
          out[a] = null;
        }
      }),
    );
  } else if (nansenMode === "x402") {
    if (Date.now() - attemptedAt > REFRESH_MS) {
      attemptedAt=Date.now();
      refreshing ??= refreshSmartMoney()
        .catch((e) => console.error("Nansen refresh failed:", (e as Error).message))
        .finally(() => (refreshing = null));
      await refreshing;
    }
    for (const a of unique) {
      const label = Date.now()-refreshedAt<=REFRESH_MS ? smartMoney.get(a) : undefined;
      out[a] = label ? { labels: [label], smartMoney: true, source: "smart-money-trades" } : null;
    }
  }
  return out;
}
