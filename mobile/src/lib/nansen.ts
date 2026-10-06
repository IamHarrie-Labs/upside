// GENERATED from app/src/lib/nansen.ts by scripts/sync-mobile.mjs. Edit the source, then re-run the script.
// Nansen labels for callers, fetched through the keeper API (which holds the Nansen key or pays per call
// with USDC on Monad via x402). Optional: if the keeper has Nansen switched off, nothing is shown.
import type { Address } from "viem";
import { KEEPER_API } from "../env";

export type NansenInfo = { labels: string[]; smartMoney: boolean; source: "labels" | "smart-money-trades" };

let cache: { at: number; key: string; value: Map<string, NansenInfo | null> } | null = null;

export async function getNansen(addresses: Address[]): Promise<Map<string, NansenInfo | null>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].sort();
  const key = unique.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < 60_000) return cache.value;
  const out = new Map<string, NansenInfo | null>();
  if (!unique.length) return out;
  try {
    const res = await fetch(`${KEEPER_API}/nansen?addresses=${key}`);
    const body = await res.json();
    if (body.mode === "off") return out;
    for (const [a, info] of Object.entries(body.data ?? {})) out.set(a, info as NansenInfo | null);
  } catch {
    return out; // keeper unreachable: labels are optional
  }
  cache = { at: Date.now(), key, value: out };
  return out;
}
