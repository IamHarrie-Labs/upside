import { createPublicClient, defineChain, http, type Address } from "viem";

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
  handles?: Address;
};

const files = import.meta.glob<Deployment>("../../contracts/deployments/*.json", { eager: true, import: "default" });

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
const RPC_URL =
  import.meta.env.VITE_RPC_URL ??
  (CHAIN_ID === 10143 ? "https://testnet-rpc.monad.xyz" : CHAIN_ID === 143 ? "https://rpc.monad.xyz" : "http://127.0.0.1:8547");

const found = Object.entries(files).find(([path]) => path.endsWith(`/${CHAIN_ID}.json`));
if (!found) throw new Error(`No deployment for chain ${CHAIN_ID}. Run the deploy script first.`);
export const deployment = found[1];

export const IS_LOCAL = CHAIN_ID === 31337;
export const EXPLORER =
  CHAIN_ID === 143 ? "https://monadvision.com" : CHAIN_ID === 10143 ? "https://testnet.monadvision.com" : "";

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 143 ? "Monad" : CHAIN_ID === 10143 ? "Monad Testnet" : "Local Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  // Multicall3 (standard address) is deployed on Monad mainnet and testnet, not on a bare Anvil node.
  ...(CHAIN_ID === 143 || CHAIN_ID === 10143
    ? { contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address } } }
    : {}),
});

// Public Monad RPCs allow ~15 requests/s per IP: off the local chain, a refresh's contract reads are bundled
// into Multicall3 calls instead of one request each.
export const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
  pollingInterval: 500,
  batch: { multicall: CHAIN_ID === 143 || CHAIN_ID === 10143 },
});
/** How often the screens re-read chain state. */
export const REFRESH_MS = CHAIN_ID === 31337 ? 2000 : 5000;

/** Keeper API: Kuru Flow quotes (mainnet) and Perpl market context. */
export const KEEPER_API: string = import.meta.env.VITE_KEEPER_API ?? import.meta.env.VITE_KURU_PROXY ?? "http://localhost:8788";

/** Which Perpl exchange to read caller positions from. Defaults to the one on the same chain; off for local demos. */
export const PERPL_NETWORK: "mainnet" | "testnet" | "off" =
  import.meta.env.VITE_PERPL_NETWORK ?? (CHAIN_ID === 143 ? "mainnet" : CHAIN_ID === 10143 ? "testnet" : "off");
