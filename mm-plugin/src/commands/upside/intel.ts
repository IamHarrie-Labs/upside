import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { isAddress, type Address } from "viem";
import { deploymentFor, getCallerRecords, publicReader, type CallerRecord } from "../../core.js";
import { asCommandError, walletSigner } from "../../host.js";
import { maxPriceFrom, intelBudgetFrom } from "../../rules.js";
import { nansenSmartMoney, type Paid } from "../../x402.js";

const inputs = {
  address: { type: InputFieldType.Text, flag: "address", message: "Caller address", required: true, index: 0 },
  maxPrice: { type: InputFieldType.Text, flag: "max-price", message: "Most USD to pay for the lookup (default 0.10)", required: false, prompt: false },
  intelDailyBudget: {type:InputFieldType.Text,flag:"intel-daily-budget",message:"Daily USDC intelligence allowance (default 1)",required:false,prompt:false},
} satisfies InputSchema;

type Result = {
  address: Address;
  nansen: { smartMoney: boolean; label: string | null; recentTrades: number; recentVolumeUsd: number; walletsSeen: number };
  upside: CallerRecord | null;
  payment: Paid<unknown>["payment"];
};

export default class UpsideIntel extends PluginCommand<Result> {
  static override description =
    "Check a caller against Nansen Smart Money on Monad before following them. Pays Nansen $0.05 in USDC on Monad mainnet over x402, signed by your Agent Wallet.";
  static override examples = ["<%= config.bin %> upside intel 0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "<%= config.bin %> upside intel 0x… --max-price 0.05 --json"];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:intel";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      if (!isAddress(String(i.address))) throw new CommandError("INVALID_ADDRESS", `Not an address: ${i.address}`, "Pass a 0x address, e.g. one from mm upside calls.");
      const address = String(i.address).toLowerCase() as Address;
      // Payment and Nansen's Monad data are both on Monad mainnet.
      const signer = await walletSigner(this.ctx, io, this.pluginCommandId, 143);
      const { smartMoney, payment } = await nansenSmartMoney(signer, { maxUsd: maxPriceFrom(i), maxDailyUsd:intelBudgetFrom(i), log: (m) => io.emit(m) });
      const hit = smartMoney.get(address);
      let upside: CallerRecord | null = null;
      try {
        upside = (await getCallerRecords({ d: deploymentFor(143), read: publicReader(143) }, [address])).get(address) ?? null;
      } catch {
        upside = null; // Upside not deployed on mainnet yet
      }
      return {
        address,
        nansen: {
          smartMoney: !!hit,
          label: hit?.label ?? null,
          recentTrades: hit?.trades ?? 0,
          recentVolumeUsd: Math.round(hit?.volumeUsd ?? 0),
          walletsSeen: smartMoney.size,
        },
        upside,
        payment,
      };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    const n = r.nansen;
    return [
      n.smartMoney
        ? `Nansen: ${n.label} · ${n.recentTrades} recent Monad DEX trades, ~$${n.recentVolumeUsd}`
        : `Nansen: not among the ${n.walletsSeen} Smart Money wallets trading on Monad recently`,
      r.upside ? `Upside: ${r.upside.wins}/${r.upside.scored} wins, ${r.upside.verified ? "verified" : "unverified"}` : "",
      r.payment ? `Paid $${r.payment.amount} USDC on Monad via x402${r.payment.transaction ? ` (${r.payment.transaction})` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
