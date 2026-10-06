// ERC-8004 identity for an Upside follow agent. Registration publishes the agent's mandate (its follow rules,
// budget and vault) in the agent URI, so anyone can compare what the agent does with what it declared.
// Official registries: https://github.com/erc-8004/erc-8004-contracts (same ABI on every chain).
import { encodeFunctionData, parseEventLogs, type Address, type PublicClient } from "viem";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { UpsideError, type Host } from "./core.js";

export const IDENTITY_REGISTRY: Record<number, Address> = {
  143: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  10143: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

export const IdentityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

/** Registry for a chain; ERC8004_IDENTITY overrides it (local forks, other deployments). */
export function identityRegistry(chainId: number): Address {
  const a = (process.env.ERC8004_IDENTITY as Address | undefined) ?? IDENTITY_REGISTRY[chainId];
  if (!a) throw new UpsideError("NO_ERC8004", `No ERC-8004 identity registry known for chain ${chainId}.`, "Use --chain-id 10143 or 143.");
  return a;
}

export type Mandate = {
  perCall: string;
  dailyBudget: string;
  maxFeePct: number;
  minScored: number;
  minWinRatePct: number;
  minAvgReturnPct: number;
  maxAgeMin: number;
  verifiedOnly: boolean;
  callers?: string[];
};

/** ERC-8004 registration file (registration-v1) with Upside's mandate as an extension field. */
export function registrationFile(args: {
  name: string;
  description?: string;
  chainId: number;
  owner: Address;
  vault: Address | null;
  mandate: Mandate;
  agentId?: number;
}) {
  const reg = identityRegistry(args.chainId);
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: args.name,
    description:
      args.description ??
      `Upside follow agent on Monad. Follows verified traders' onchain calls from vault ${args.vault ?? "(not created yet)"} ` +
        `within the mandate below, through a MetaMask Agent Wallet: ${args.mandate.perCall} AUSD per call, at most ${args.mandate.dailyBudget} AUSD a day.`,
    services: [
      { name: "MetaMask Agent Wallet plugin", endpoint: "npm:mm-plugin-upside", version: "0.1.0" },
      ...(args.vault ? [{ name: "Upside vault", endpoint: `eip155:${args.chainId}:${args.vault}` }] : []),
    ],
    x402Support: false,
    active: true,
    registrations: args.agentId !== undefined ? [{ agentId: args.agentId, agentRegistry: `eip155:${args.chainId}:${reg}` }] : [],
    supportedTrust: ["reputation"],
    upside: { version: 1, chainId: args.chainId, wallet: args.owner, vault: args.vault, mandate: args.mandate },
  };
}

export const toDataUri = (json: unknown) =>
  `data:application/json;base64,${Buffer.from(JSON.stringify(json), "utf8").toString("base64")}`;

/** Decodes a data: URI (base64 or URL-encoded JSON); fetches http(s) and ipfs:// URIs. */
export async function readAgentUri(uri: string): Promise<unknown> {
  if (uri.startsWith("data:")) {
    const [head, body] = uri.split(",", 2);
    const text = head.endsWith(";base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
    return JSON.parse(text);
  }
  const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
  if (!/^https?:\/\//.test(url)) return null;
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

export async function registerAgent(h: Host, file: ReturnType<typeof registrationFile>) {
  const registry = identityRegistry(h.chainId);
  const data = encodeFunctionData({ abi: IdentityRegistryAbi, functionName: "register", args: [toDataUri(file)] });
  // The registry mints with _safeMint: a wallet address that carries contract code (e.g. an EIP-7702 delegation)
  // must accept ERC-721s. Simulate first so this fails with a clear message instead of a bare revert.
  try {
    await h.read.call({ account: h.account, to: registry, data });
  } catch (e) {
    const msg = String((e as any)?.details ?? (e as Error).message);
    const raw = String((e as any)?.cause?.data ?? (e as any)?.data ?? "") + msg;
    // Mainnet returns ERC721InvalidReceiver(address); testnet can revert with no data, so also check for code.
    const code = await h.read.getCode({ address: h.account }).catch(() => undefined);
    if (raw.includes("64a0ae92") || /ERC721InvalidReceiver/i.test(msg) || (code && code !== "0x"))
      throw new UpsideError(
        "AGENT_WALLET_CANNOT_RECEIVE_NFT",
        `${h.account} has contract code that doesn't accept ERC-721 tokens, so the ERC-8004 registry can't mint its identity to it.`,
        "Register from an account without code, or one whose code implements onERC721Received.",
      );
    throw new UpsideError("REGISTER_REVERTS", `ERC-8004 register would revert: ${msg.split("\n")[0]}`, "Check the wallet has MON for gas and the chain id is right.");
  }
  const r = await h.submit(
    { to: registry, data },
    `Register ERC-8004 agent identity "${file.name}" (mandate: ${file.upside.mandate.perCall} AUSD per call, ${file.upside.mandate.dailyBudget} AUSD/day)`,
  );
  if (r.status !== "confirmed" || !r.hash) throw new UpsideError("TX_NOT_CONFIRMED", `Agent registration ${r.status}.`);
  const receipt = await h.read.getTransactionReceipt({ hash: r.hash });
  const ev = parseEventLogs({ abi: IdentityRegistryAbi, logs: receipt.logs, eventName: "Registered" }).find(
    (l) => l.address.toLowerCase() === registry.toLowerCase(),
  );
  if (!ev) throw new UpsideError("NO_REGISTERED_EVENT", "Registration confirmed but no Registered event was found.");
  const agentId = Number(ev.args.agentId);
  saveAgentId(h, agentId);
  return { agentId, hash: r.hash, registry };
}

/** Rewrites the agent URI, e.g. to add its own agentId to `registrations` or after the mandate changes. */
export async function updateAgentUri(h: Host, agentId: number, file: ReturnType<typeof registrationFile>) {
  const r = await h.submit(
    {
      to: identityRegistry(h.chainId),
      data: encodeFunctionData({ abi: IdentityRegistryAbi, functionName: "setAgentURI", args: [BigInt(agentId), toDataUri(file)] }),
    },
    `Update ERC-8004 agent #${agentId} registration`,
  );
  if (r.status !== "confirmed") throw new UpsideError("TX_NOT_CONFIRMED", `Agent URI update ${r.status}.`);
  return r.hash;
}

export async function getAgent(read: PublicClient, chainId: number, agentId: number) {
  const registry = identityRegistry(chainId);
  const id = BigInt(agentId);
  let owner: Address;
  try {
    owner = (await read.readContract({ address: registry, abi: IdentityRegistryAbi, functionName: "ownerOf", args: [id] })) as Address;
  } catch {
    throw new UpsideError("AGENT_NOT_FOUND", `No ERC-8004 agent #${agentId} on chain ${chainId}.`, "Check the agent id and --chain-id.");
  }
  const [uri, agentWallet] = await Promise.all([
    read.readContract({ address: registry, abi: IdentityRegistryAbi, functionName: "tokenURI", args: [id] }) as Promise<string>,
    read.readContract({ address: registry, abi: IdentityRegistryAbi, functionName: "getAgentWallet", args: [id] }) as Promise<Address>,
  ]);
  let registration: unknown = null;
  try {
    registration = await readAgentUri(uri);
  } catch {
    registration = null;
  }
  return { agentId, registry: `eip155:${chainId}:${registry}`, owner, agentWallet, uri, registration };
}

// The agent id this wallet registered, so autopilot can sign its work as that agent.
function agentPath(h: Pick<Host, "chainId" | "account">) {
  const dir = process.env.UPSIDE_STATE_DIR ?? join(homedir(), ".upside");
  mkdirSync(dir, { recursive: true });
  return join(dir, `agent-${h.chainId}-${h.account.toLowerCase()}.json`);
}
export function savedAgentId(h: Pick<Host, "chainId" | "account">): number | null {
  try {
    return JSON.parse(readFileSync(agentPath(h), "utf8")).agentId ?? null;
  } catch {
    return null;
  }
}
function saveAgentId(h: Pick<Host, "chainId" | "account">, agentId: number) {
  writeFileSync(agentPath(h), JSON.stringify({ agentId, registry: identityRegistry(h.chainId) }, null, 2));
}
