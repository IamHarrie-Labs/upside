import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Address, Hex } from "viem";
import { deposit, ensureVault, fmtQuote, getVaultState, setExposure } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, walletHost } from "../../host.js";
import { amountFrom } from "../../rules.js";

const inputs = {
  amount: { type: InputFieldType.Text, flag: "amount", message: "AUSD to move into your vault", required: true, prompt: true },
  maxExposure: {
    type: InputFieldType.Text,
    flag: "max-exposure",
    message: "Onchain cap on the vault's total open cost in AUSD (default 100 for a new vault)",
    required: false,
    prompt: false,
  },
  ...chainInput,
} satisfies InputSchema;

type Result = { vault: Address; created: boolean; cash: string; maxExposure: string; hashes: Hex[] };

export default class UpsideDeposit extends PluginCommand<Result> {
  static override description =
    "Create your Upside vault if needed and fund it with AUSD. The vault's exposure cap is enforced by the contract, whatever an agent does.";
  static override examples = [
    "<%= config.bin %> upside deposit --amount 50",
    "<%= config.bin %> upside deposit --amount 50 --max-exposure 200 --chain-id 143",
  ];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:deposit";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const amount = amountFrom(i.amount, "amount");
      const cap = i.maxExposure ? amountFrom(i.maxExposure, "max-exposure") : undefined;
      const h = await walletHost(this.ctx, io, this.pluginCommandId, chainIdFrom(i.chainId));
      const hashes: Hex[] = [];
      const { vault, created } = await ensureVault(h, cap ?? amountFrom(undefined, "max-exposure", "100"));
      if (!created && cap !== undefined) {
        const hx = await setExposure(h, vault, cap);
        if (hx) hashes.push(hx);
      }
      const hx = await deposit(h, vault, amount);
      if (hx) hashes.push(hx);
      const s = await getVaultState(h, vault);
      return { vault, created, cash: fmtQuote(s.cash), maxExposure: fmtQuote(s.maxExposure), hashes };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    return `${r.created ? "Created" : "Funded"} vault ${r.vault}: ${r.cash} AUSD cash, ${r.maxExposure} AUSD exposure cap.`;
  }
}
