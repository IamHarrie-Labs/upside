import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type Deployment = {
  chainId: number;
  demo: boolean;
  startBlock: number;
  gate: Address;
  priceSource: Address;
  callBook: Address;
  config: Address;
  factory: Address;
  settlement: Address;
  base: Address;
  router: Address;
};

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8547";
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const key = process.env.KEEPER_KEY as Hex | undefined;
if (!key) {
  console.error("Set KEEPER_KEY to the keeper/attester private key (never commit it).");
  process.exit(1);
}

export const deployment: Deployment = JSON.parse(
  readFileSync(new URL(`../../contracts/deployments/${chainId}.json`, import.meta.url), "utf8"),
);

export const chain = defineChain({
  id: chainId,
  name: chainId === 143 ? "Monad" : chainId === 10143 ? "Monad Testnet" : "Local",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

export const account = privateKeyToAccount(key);
// Public Monad RPCs rate-limit per IP (testnet: 15 requests/s) and answer with JSON-RPC error -32011, which viem
// doesn't treat as retryable. Retry those (and HTTP 429) with backoff here.
export const rateLimitedFetch: typeof fetch = async (input, init) => {
  for (let i = 0; ; i++) {
    const res = await fetch(input, init);
    if (i >= 7) return res;
    const limited = res.status === 429 || (res.ok && (await res.clone().text()).includes('"code":-32011'));
    if (!limited) return res;
    await new Promise((r) => setTimeout(r, 250 * 2 ** i + Math.random() * 250));
  }
};
export const rpcTransport = () => http(rpcUrl, { fetchFn: rateLimitedFetch, retryCount: 3 });
const transport = rpcTransport();
export const publicClient = createPublicClient({ chain, transport });
export const walletClient = createWalletClient({ chain, transport, account });
