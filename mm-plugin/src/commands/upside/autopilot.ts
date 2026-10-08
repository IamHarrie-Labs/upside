import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { autopilotPass, fmtQuote, type PilotAction } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, keeperInput, walletHost } from "../../host.js";
import { amountFrom, maxPriceFrom, intelBudgetFrom, ruleInputs, rulesFrom } from "../../rules.js";
import { nansenSmartMoney } from "../../x402.js";

const inputs = {
  perCall: { type: InputFieldType.Text, flag: "per-call", message: "AUSD per followed call (default 10)", required: false, prompt: false },
  dailyBudget: {
    type: InputFieldType.Text,
    flag: "daily-budget",
    message: "Most AUSD to put into new follows per day (default 50)",
    required: false,
    prompt: false,
  },
  ...ruleInputs,
  keepExpired: {
    type: InputFieldType.Boolean,
    flag: "keep-expired",
    message: "Leave positions open after their call expires",
    required: false,
    prompt: false,
  },
  watch: { type: InputFieldType.Boolean, flag: "watch", message: "Keep running and check again every --interval seconds", required: false, prompt: false },
  interval: { type: InputFieldType.Text, flag: "interval", message: "Seconds between passes with --watch (default 30)", required: false, prompt: false },
  dryRun: { type: InputFieldType.Boolean, flag: "dry-run", message: "Report what would happen without sending anything", required: false, prompt: false },
  ...chainInput,
  ...keeperInput,
} satisfies InputSchema;

type Result = { passes: number; followed: number; closed: number; skipped: number; actions: PilotAction[] };

export default class UpsideAutopilot extends PluginCommand<Result> {
  static override description =
    "Let an agent follow verified callers within your limits: per-call size, daily budget, minimum record, maximum fee. Closes positions when their call expires. Every transaction still passes your Agent Wallet policy.";
  static override examples = [
    "<%= config.bin %> upside autopilot --dry-run",
    "<%= config.bin %> upside autopilot --per-call 10 --daily-budget 50 --min-scored 5 --min-win-rate 60",
    "<%= config.bin %> upside autopilot --watch --interval 30 --json",
  ];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:autopilot";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const perCall = amountFrom(i.perCall, "per-call", "10");
      const dailyBudget = amountFrom(i.dailyBudget, "daily-budget", "50");
      const rules = rulesFrom(i, perCall);
      const h = await walletHost(this.ctx, io, this.pluginCommandId, chainIdFrom(i.chainId), i.keeperApi as string | undefined);
      const intervalMs = Math.max(5, Number(i.interval ?? 30)) * 1000;
      const maxUsd = maxPriceFrom(i);
      // Paid per pass with USDC on Monad via x402, signed by the Agent Wallet; skipped when no call needs it.
      const smartMoney = rules.requireSmartMoney
        ? async () =>
            (await nansenSmartMoney({ address: h.account, signTypedData: h.signTypedData! }, { maxUsd, maxDailyUsd:intelBudgetFrom(i), log: (m) => io.emit(m) }))
              .smartMoney
        : undefined;
      const all: PilotAction[] = [];
      let passes = 0;
      io.emit(
        `Autopilot for ${h.account}${h.agentId != null ? ` (ERC-8004 agent #${h.agentId})` : ""} on chain ${h.chainId}: ${fmtQuote(perCall)} AUSD per call, ${fmtQuote(dailyBudget)} AUSD/day, ` +
          `${rules.verifiedOnly ? "verified callers only" : "any caller"}, at least ${rules.minScored} scored calls and ${rules.minWinRate * 100}% wins, ` +
          `fee at most ${rules.maxFeeBps / 100}%${rules.requireSmartMoney ? ", Nansen Smart Money only" : ""}${i.dryRun ? " (dry run)" : ""}`,
      );
      do {
        const acts = await autopilotPass(h, { rules, dailyBudget, closeExpired: i.keepExpired !== true, dryRun: i.dryRun === true, smartMoney });
        passes++;
        for (const a of acts) {
          all.push(a);
          if (a.kind === "followed") io.emit(`followed call #${a.callId} (${a.caller}) with ${a.amount} AUSD`);
          else if (a.kind === "closed") io.emit(`closed position #${a.positionId} (call #${a.callId} expired)`);
          else if (a.kind === "skipped") io.emit(`skipped call #${a.callId}: ${a.reasons.join("; ")}`);
          else io.emit(a.reason);
        }
        if (acts.some((a) => a.kind === "stopped") || !i.watch) break;
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, intervalMs);
          io.signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
        });
      } while (!io.signal.aborted);
      // With --watch a call stays "skipped" on every pass; count each call once.
      const skipped = new Set(all.flatMap((a) => (a.kind === "skipped" ? [a.callId] : [])));
      return {
        passes,
        followed: all.filter((a) => a.kind === "followed").length,
        closed: all.filter((a) => a.kind === "closed").length,
        skipped: skipped.size,
        actions: all,
      };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    return `Autopilot: ${r.followed} followed, ${r.closed} closed, ${r.skipped} skipped over ${r.passes} pass${r.passes === 1 ? "" : "es"}.`;
  }
}
