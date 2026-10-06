// GENERATED from app/src/lib/perpl.ts by scripts/sync-mobile.mjs. Edit the source, then re-run the script.
// "Skin in the game": does the caller hold a MON position on Perpl right now?
// Market metadata (exchange address, MON market id, decimals, mark) comes from Perpl's public API
// (GET /api/v1/pub/context, via the keeper because it has no CORS headers). Positions are read from Perpl's
// Exchange contract, so anyone can verify them onchain.
import { createPublicClient, http, type Address } from "viem";
import { KEEPER_API, PERPL_NETWORK } from "../env";

const RPC = { mainnet: "https://rpc.monad.xyz", testnet: "https://testnet-rpc.monad.xyz" } as const;

const exchangeAbi = [
  {
    type: "function",
    name: "getAccountByAddr",
    stateMutability: "view",
    inputs: [{ name: "accountAddress", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "balanceCNS", type: "uint256" },
          { name: "lockedBalanceCNS", type: "uint256" },
          { name: "frozen", type: "uint8" },
          { name: "accountAddr", type: "address" },
          {
            name: "positions",
            type: "tuple",
            components: [
              { name: "bank1", type: "uint256" },
              { name: "bank2", type: "uint256" },
              { name: "bank3", type: "uint256" },
              { name: "bank4", type: "uint256" },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [
      { name: "perpId", type: "uint256" },
      { name: "accountId", type: "uint256" },
    ],
    outputs: [
      {
        name: "positionInfo",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "nextNodeId", type: "uint256" },
          { name: "prevNodeId", type: "uint256" },
          { name: "positionType", type: "uint8" },
          { name: "depositCNS", type: "uint256" },
          { name: "pricePNS", type: "uint256" },
          { name: "lotLNS", type: "uint256" },
          { name: "entryBlock", type: "uint256" },
          { name: "pnlCNS", type: "int256" },
          { name: "deltaPnlCNS", type: "int256" },
          { name: "premiumPnlCNS", type: "int256" },
        ],
      },
      { name: "markPricePNS", type: "uint256" },
      { name: "markPriceValid", type: "bool" },
    ],
  },
] as const;

export type PerplPosition = {
  side: "long" | "short";
  size: number; // MON
  entry: number; // AUSD per MON
  mark: number;
  pnlPct: number; // unlevered move since entry, in the position's direction
};

type Market = { exchange: Address; perpId: bigint; priceDec: number; sizeDec: number };

let market: { at: number; value: Market | null } | null = null;
const cache = new Map<string, { at: number; value: PerplPosition | null }>();

const client =
  PERPL_NETWORK === "off" ? null : createPublicClient({ transport: http(RPC[PERPL_NETWORK]), batch: { multicall: false } });

export const perplEnabled = PERPL_NETWORK !== "off";
export const perplUrl = PERPL_NETWORK === "testnet" ? "https://testnet.perpl.xyz" : "https://app.perpl.xyz";

async function getMarket(): Promise<Market | null> {
  if (market && Date.now() - market.at < 60_000) return market.value;
  const res = await fetch(`${KEEPER_API}/perpl/context?net=${PERPL_NETWORK}`);
  if (!res.ok) throw new Error(`Perpl context ${res.status}`);
  const ctx = await res.json();
  const m = (ctx.markets ?? []).find((x: any) => String(x.name).toUpperCase() === "MON" && x.config?.is_open !== false);
  const value: Market | null =
    m && ctx.instances?.[0]?.address
      ? {
          exchange: ctx.instances[0].address,
          perpId: BigInt(m.perpetual_id ?? m.id),
          priceDec: Number(m.config.price_decimals),
          sizeDec: Number(m.config.size_decimals),
        }
      : null;
  market = { at: Date.now(), value };
  return value;
}

async function positionOf(m: Market, address: Address): Promise<PerplPosition | null> {
  let accountId: bigint;
  try {
    const acc = await client!.readContract({
      address: m.exchange,
      abi: exchangeAbi,
      functionName: "getAccountByAddr",
      args: [address],
    });
    accountId = acc.accountId;
  } catch {
    return null; // reverts when the address has no Perpl account
  }
  const [pos, markPNS] = await client!.readContract({
    address: m.exchange,
    abi: exchangeAbi,
    functionName: "getPosition",
    args: [m.perpId, accountId],
  });
  if (pos.lotLNS === 0n) return null;
  const entry = Number(pos.pricePNS) / 10 ** m.priceDec;
  const mark = Number(markPNS) / 10 ** m.priceDec;
  const side = pos.positionType === 0 ? "long" : "short";
  const move = entry ? (mark - entry) / entry : 0;
  return {
    side,
    size: Number(pos.lotLNS) / 10 ** m.sizeDec,
    entry,
    mark,
    pnlPct: (side === "long" ? move : -move) * 100,
  };
}

/** MON positions on Perpl for each address (null = none). Cached for 15 seconds per address. */
export async function getPerplPositions(addresses: Address[]): Promise<Map<string, PerplPosition | null>> {
  const out = new Map<string, PerplPosition | null>();
  if (!client) return out;
  let m: Market | null;
  try {
    m = await getMarket();
  } catch {
    return out; // keeper API unreachable: the badge is optional
  }
  if (!m) return out;
  await Promise.all(
    [...new Set(addresses.map((a) => a.toLowerCase()))].map(async (a) => {
      const hit = cache.get(a);
      if (hit && Date.now() - hit.at < 15_000) return out.set(a, hit.value);
      try {
        const value = await positionOf(m!, a as Address);
        cache.set(a, { at: Date.now(), value });
        out.set(a, value);
      } catch {
        // leave unknown
      }
    }),
  );
  return out;
}
