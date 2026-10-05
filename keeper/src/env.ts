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
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
export const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account });
