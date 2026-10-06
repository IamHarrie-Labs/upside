import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { getCallerRecords, getCalls, getMid, humanPrice, type Call, type CallerRecord } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, readOnlyHost } from "../../host.js";

const inputs = {
  ...chainInput,
  all: {
    type: InputFieldType.Boolean,
    flag: "all",
    message: "Include expired and scored calls",
    required: false,
    prompt: false,
  },
  limit: { type: InputFieldType.Text, flag: "limit", message: "How many recent calls to read (default 20)", required: false, prompt: false },
} satisfies InputSchema;

type Result = { chainId: number; mid: number | null; calls: (Call & { record: CallerRecord | null })[] };

export default class UpsideCalls extends PluginCommand<Result> {
  static override description =
    "List trading calls on Upside (Monad), with each caller's onchain record: verified or not, scored calls, win rate and average return.";
  static override examples = [
    "<%= config.bin %> upside calls",
    "<%= config.bin %> upside calls --chain-id 143 --all --json",
  ];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:calls";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const h = readOnlyHost(chainIdFrom(i.chainId));
      const [mid, calls] = await Promise.all([getMid(h), getCalls(h, { limit: Number(i.limit ?? 20) })]);
      const shown = i.all ? calls : calls.filter((c) => c.open);
      const recs = await getCallerRecords(h, shown.map((c) => c.caller));
      return {
        chainId: h.chainId,
        mid: mid ? humanPrice(mid) : null,
        calls: shown.map((c) => ({ ...c, record: recs.get(c.caller.toLowerCase() as any) ?? null })),
      };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    if (!r.calls.length) return "No open calls right now. Use --all to see past calls.";
    return r.calls
      .map((c) => {
        const rec = c.record;
        const who = `${c.caller.slice(0, 6)}…${c.caller.slice(-4)}${rec?.verified ? " ✓verified" : " (unverified)"}`;
        const track = rec?.scored ? `${rec.wins}/${rec.scored} wins, avg ${((rec.avgReturnBps ?? 0) / 100).toFixed(2)}%` : "no scored calls yet";
        const state = c.open
          ? `${Math.max(0, Math.round(c.secondsLeft / 60))}m left`
          : c.scored
            ? `scored ${((c.returnBps ?? 0) / 100).toFixed(2)}%`
            : "expired, awaiting score";
        return `#${c.id} ${c.side.toUpperCase()} MON @ ${c.entry} → target ${c.target}, stop ${c.stop} · fee ${c.feeBps / 100}% of profit · ${state}\n   ${who} · ${track}`;
      })
      .join("\n");
  }
}
