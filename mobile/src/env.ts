import { Platform } from "react-native";
import { createPublicClient, defineChain, http, type Address } from "viem";
import { deployments } from "./deployments";

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

// EXPO_PUBLIC_* values are inlined at build time (see eas.json profiles).
export const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 31337);

// The Android emulator reaches the host machine at 10.0.2.2.
const HOST = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
const RPC_URL =
  process.env.EXPO_PUBLIC_RPC_URL ??
  (CHAIN_ID === 10143 ? "https://testnet-rpc.monad.xyz" : CHAIN_ID === 143 ? "https://rpc.monad.xyz" : `http://${HOST}:8547`);

const found = deployments[String(CHAIN_ID)];
if (!found) throw new Error(`No deployment for chain ${CHAIN_ID}. Deploy, then run node scripts/sync-mobile.mjs`);
export const deployment: Deployment = found;

export const IS_LOCAL = CHAIN_ID === 31337;
export const EXPLORER =
  CHAIN_ID === 143 ? "https://monadvision.com" : CHAIN_ID === 10143 ? "https://testnet.monadvision.com" : "";

/** Domain the passkey belongs to. Must serve the iOS/Android association files (see mobile/README.md). */
export const RP_ID: string = process.env.EXPO_PUBLIC_RP_ID ?? (Platform.OS === "web" ? globalThis.location?.hostname ?? "localhost" : "");

/** Keeper API: Kuru Flow quotes (mainnet) and Perpl market context. */
export const KEEPER_API: string = process.env.EXPO_PUBLIC_KEEPER_API ?? `http://${HOST}:8788`;

/** Which Perpl exchange to read caller positions from. Defaults to the one on the same chain; off for local demos. */
export const PERPL_NETWORK: "mainnet" | "testnet" | "off" = ((process.env.EXPO_PUBLIC_PERPL_NETWORK as any) ??
  (CHAIN_ID === 143 ? "mainnet" : CHAIN_ID === 10143 ? "testnet" : "off"));

/** Public web app URL, used in share links so anyone can open a call without the app. */
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173";

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
