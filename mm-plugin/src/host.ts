// Builds the core's Host from the mm plugin context: reads through MetaMask's authenticated RPC client when the
// command has wallet-read (falling back to Monad's public RPC), and writes through MetaMask's wallet executor.
import { CommandError, type CommandIO, InputFieldType, type PluginCommandContext } from "@metamask/agent-wallet/plugin";
import { isAddress, type Address, type Hex, type PublicClient } from "viem";
import { deploymentFor, EXPLORER, publicReader, UpsideError, type Host } from "./core.js";
import { savedAgentId } from "./erc8004.js";

export const chainInput = {
  chainId: {
    type: InputFieldType.Text,
    flag: "chain-id",
    message: "Monad chain: 10143 (testnet) or 143 (mainnet)",
    required: false,
    prompt: false,
  },
} as const;

export const keeperInput = {
  keeperApi: {
    type: InputFieldType.Text,
    flag: "keeper-api",
    message: "Upside keeper API URL (mainnet: Kuru Flow quotes). Defaults to UPSIDE_KEEPER_API",
    required: false,
    prompt: false,
  },
} as const;

export function chainIdFrom(v: unknown): number {
  const id = Number(v ?? process.env.UPSIDE_CHAIN_ID ?? 10143);
  const local = process.env.UPSIDE_RPC_URL && process.env.UPSIDE_DEPLOYMENT; // development against Anvil
  if (id !== 143 && id !== 10143 && !local)
    throw new CommandError("UNSUPPORTED_CHAIN", `Upside runs on Monad. Got --chain-id ${v}.`, "Use --chain-id 10143 (testnet) or 143 (mainnet).");
  return id;
}

/** Converts core errors into mm's error envelope so agents get a stable code and a hint. */
export function asCommandError(e: unknown): never {
  if (e instanceof CommandError) throw e;
  if (e instanceof UpsideError) throw new CommandError(e.code, e.message, e.hint || "Run with --verbose for details.");
  const msg = e instanceof Error ? e.message : String(e);
  const revert = /reverted with the following reason:\s*([\s\S]*?)(\n|$)|error\s+([A-Z][A-Za-z]+)\(\)/.exec(msg);
  throw new CommandError("UPSIDE_FAILED", revert ? `Reverted: ${revert[1] ?? revert[3]}` : msg.split("\n")[0], "Run with --verbose for details.");
}

/** Reader for commands that don't touch the wallet (no capabilities needed). */
export function readOnlyHost(chainId: number) {
  return { chainId, d: deploymentFor(chainId), read: publicReader(chainId) };
}

/**
 * The selected Agent Wallet address. Plugins can't reach the session, so this reads the local wallet state
 * snapshot (wallet-read): the selected wallet, else the first EVM wallet. UPSIDE_ACCOUNT overrides it.
 */
export function selectedAddress(ctx: PluginCommandContext): Address {
  const override = process.env.UPSIDE_ACCOUNT;
  if (override && isAddress(override)) return override;
  const st: any = ctx.walletStateManager.read();
  const sel = st?.selectedWallet;
  const pools: any[] = [
    ...(sel?.mode === "byok" ? (st.byokWallets ?? []) : (st.remoteWallets ?? [])),
    ...(st.remoteWallets ?? []),
    ...(st.byokWallets ?? []),
  ];
  const evm = pools.filter((w) => typeof w?.address === "string" && isAddress(w.address));
  const ref = sel?.ref ?? {};
  const match =
    evm.find((w) => (ref.id && w.id === ref.id) || (ref.address && w.address.toLowerCase() === String(ref.address).toLowerCase())) ??
    evm[0];
  if (!match)
    throw new CommandError("NO_WALLET", "No EVM wallet is selected in MetaMask Agent Wallet.", "Run `mm init` or `mm wallet select`.");
  return match.address as Address;
}

async function hostReader(ctx: PluginCommandContext, chainId: number): Promise<PublicClient> {
  if (process.env.UPSIDE_RPC_URL) return publicReader(chainId);
  try {
    const client = ctx.publicClient(chainId) as PublicClient;
    await client.getBlockNumber();
    return client;
  } catch {
    return publicReader(chainId);
  }
}

/** Full host for wallet commands: MetaMask's executor signs and submits, policy-gated, possibly with human approval. */
export async function walletHost(
  ctx: PluginCommandContext,
  io: CommandIO,
  commandId: string,
  chainId: number,
  keeperApi?: string,
  opts: { requireDeployment?: boolean } = {},
): Promise<Host> {
  // Identity-only commands (agent register) can run where Upside isn't deployed, e.g. Monad mainnet.
  let d: Host["d"];
  try {
    d = deploymentFor(chainId);
  } catch (e) {
    if (opts.requireDeployment !== false) throw e;
    d = null as unknown as Host["d"];
  }
  const read = await hostReader(ctx, chainId);
  const account = selectedAddress(ctx);
  const executor: any = await ctx.walletExecutor(io, commandId, { emitStepNotices: true });
  return {
    chainId,
    d,
    read,
    account,
    agentId: savedAgentId({ chainId, account }),
    signTypedData: typedDataSigner(executor, io, chainId),
    keeperApi: keeperApi ?? process.env.UPSIDE_KEEPER_API,
    log: (m) => io.emit(m),
    async submit(tx, summary) {
      const r = await executor(
        {
          kind: "transaction",
          chainId,
          transaction: { to: tx.to, data: tx.data, value: tx.value ?? 0n },
          intent: { action: "custom", summary },
        },
        { signal: io.signal, waitForReceipt: true },
      );
      const hash: Hex | undefined = r?.kind === "transaction" ? r.hash : undefined;
      if (!hash) {
        // DENIED / EXPIRED (approval not given in time) / FAILED, with no transaction sent.
        const status = String(r?.status ?? "unknown").toLowerCase();
        throw new UpsideError(
          `TX_${status.toUpperCase()}`,
          `${summary}: ${r?.failureDescription ?? status}`,
          status === "denied" ? "Your Agent Wallet policy or approver rejected this transaction." : "Check mm wallet requests list.",
        );
      }
      if (EXPLORER[chainId]) io.emit(`  ${EXPLORER[chainId]}${hash}`);
      // Executor job states end at BROADCASTED or CONFIRMED depending on mode; the receipt is the truth.
      const receipt = await read.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status === "success" ? "confirmed" : "reverted" };
    },
  };
}

/** EIP-712 signing through MetaMask's wallet executor (policy-checked, may ask for approval). */
function typedDataSigner(executor: any, io: CommandIO, defaultChainId: number) {
  return async (td: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }): Promise<Hex> => {
    // The domain's chainId names the chain the signature is for (x402 payments: Monad mainnet).
    const sigChain = Number((td.domain as any).chainId ?? defaultChainId);
    const r = await executor(
      { kind: "typed-data", chainId: sigChain, typedData: jsonSafe(td), intent: { action: "custom", summary: describeTypedData(td) } },
      { signal: io.signal },
    );
    const sig: Hex | undefined = r?.kind === "signature" ? r.signature : undefined;
    if (!sig) {
      const status = String(r?.status ?? "unknown").toLowerCase();
      throw new UpsideError(`SIGN_${status.toUpperCase()}`, `Signature ${status}: ${r?.failureDescription ?? ""}`.trim(), "Your Agent Wallet policy or approver rejected the payment.");
    }
    return sig;
  };
}

/** Just the wallet address and a typed-data signer, for commands that pay (x402) but don't touch Upside contracts. */
export async function walletSigner(ctx: PluginCommandContext, io: CommandIO, commandId: string, chainId: number) {
  const executor: any = await ctx.walletExecutor(io, commandId);
  return { address: selectedAddress(ctx), signTypedData: typedDataSigner(executor, io, chainId) };
}

/** bigint -> decimal string, so typed data survives JSON transport to the signer. */
function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
}

/** Plain-words summary for the approval prompt, e.g. "x402 payment: 0.05 USDC to 0xabc…". */
function describeTypedData(td: { domain: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) {
  const m = td.message as any;
  if (/TransferWithAuthorization/i.test(td.primaryType) && m?.value !== undefined)
    return `x402 payment: ${(Number(m.value) / 1e6).toFixed(2)} ${td.domain.name ?? "USDC"} to ${m.to}`;
  return `Sign ${td.primaryType} for ${td.domain.name ?? "an app"}`;
}

