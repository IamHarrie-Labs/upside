import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Address, Hex } from "viem";
import { checkCall, fmtQuote, follow, getCallerRecords, getCalls, getVault, getVaultState } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, keeperInput, walletHost } from "../../host.js";
import { amountFrom, maxPriceFrom, intelBudgetFrom, ruleInputs, rulesFrom } from "../../rules.js";
import { nansenSmartMoney } from "../../x402.js";

const inputs = {
  callId: { type: InputFieldType.Text, flag: "call", message: "Call id to follow (see mm upside calls)", required: true, index: 0 },
  amount: { type: InputFieldType.Text, flag: "amount", message: "AUSD to put behind this call", required: true, prompt: true },
  ...ruleInputs,
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Check the rules without sending anything", required: false, prompt: false },
  ...chainInput,
  ...keeperInput,
} satisfies InputSchema;

type Result = { callId: number; caller: Address; amount: string; positionId: number | null; hash?: Hex; dryRun: boolean };

export default class UpsideFollow extends PluginCommand<Result> {
  static override description =
    "Follow a call from your Upside vault. Refuses calls that break your rules (unverified caller, weak record, high fee). The caller is paid only from your net profit.";
  static override examples = [
    "<%= config.bin %> upside follow 12 --amount 10",
    "<%= config.bin %> upside follow 12 --amount 10 --min-scored 5 --min-win-rate 60 --max-fee-pct 15 --json",
  ];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:follow";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const amount = amountFrom(i.amount, "amount");
      const rules = rulesFrom(i, amount);
      const h = await walletHost(this.ctx, io, this.pluginCommandId, chainIdFrom(i.chainId), i.keeperApi as string | undefined);
      const id = Number(i.callId);
      const call = (await getCalls(h, { limit: 500 })).find((c) => c.id === id);
      if (!call) throw new CommandError("CALL_NOT_FOUND", `No call #${i.callId}.`, "List calls with mm upside calls.");
      const rec = (await getCallerRecords(h, [call.caller])).get(call.caller.toLowerCase() as Address);
      const reasons = checkCall(call, rec, rules);
      if (!reasons.length && rules.requireSmartMoney) {
        if (i.dryRun) throw new CommandError("PAID_CHECK_REQUIRED", "Dry run did not buy Nansen intelligence.", "Run upside intel first, or explicitly authorize a real follow with the Smart Money rule.");
        const { smartMoney } = await nansenSmartMoney(
          { address: h.account, signTypedData: h.signTypedData! },
          { maxUsd: maxPriceFrom(i), maxDailyUsd: intelBudgetFrom(i), log: (m) => io.emit(m) },
        );
        if (!smartMoney.has(call.caller.toLowerCase())) reasons.push("caller is not a Nansen Smart Money wallet on Monad");
      }
      const vault = await getVault(h, h.account);
      if (!vault) reasons.push("no vault yet: run mm upside deposit first");
      else {
        const s = await getVaultState(h, vault);
        if (s.cash < amount) reasons.push(`vault holds ${fmtQuote(s.cash)} AUSD; follow needs ${fmtQuote(amount)}`);
        if (s.openCost + amount > s.maxExposure) reasons.push(`vault exposure cap ${fmtQuote(s.maxExposure)} AUSD would be exceeded`);
      }
      if (reasons.length)
        throw new CommandError(
          "RULES_REFUSED",
          `Not following call #${id}: ${reasons.join("; ")}.`,
          "Relax a rule flag only if the user asked for it, or pick another call.",
        );
      if (i.dryRun) return { callId: id, caller: call.caller, amount: fmtQuote(amount), positionId: null, dryRun: true };
      const r = await follow(h, vault!, call, amount);
      return { callId: id, caller: call.caller, amount: fmtQuote(amount), positionId: r.positionId, hash: r.hash, dryRun: false };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    return r.dryRun
      ? `Call #${r.callId} passes your rules; ${r.amount} AUSD would be followed.`
      : `Followed call #${r.callId} with ${r.amount} AUSD${r.positionId !== null ? ` (position #${r.positionId})` : ""}.`;
  }
}
