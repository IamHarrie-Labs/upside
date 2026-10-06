import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { isAddress, type Address } from "viem";
import { getCallerRecords, getCalls, type Call, type CallerRecord } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, readOnlyHost } from "../../host.js";

const inputs = {
  address: { type: InputFieldType.Text, flag: "address", message: "Caller address", required: true, index: 0 },
  ...chainInput,
} satisfies InputSchema;

type Result = { record: CallerRecord; recentCalls: Call[] };

export default class UpsideCaller extends PluginCommand<Result> {
  static override description =
    "Show a caller's onchain track record on Upside: every call is committed before the move and scored against the market mid, losers included.";
  static override examples = ["<%= config.bin %> upside caller 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --json"];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:caller";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      if (!isAddress(String(i.address))) throw new CommandError("INVALID_ADDRESS", `Not an address: ${i.address}`, "Pass a 0x address, e.g. one from mm upside calls.");
      const address = String(i.address).toLowerCase() as Address;
      const h = readOnlyHost(chainIdFrom(i.chainId));
      const [recs, calls] = await Promise.all([getCallerRecords(h, [address]), getCalls(h, { limit: 200 })]);
      return { record: recs.get(address)!, recentCalls: calls.filter((c) => c.caller.toLowerCase() === address).slice(0, 10) };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    const x = r.record;
    const head = `${x.address} · ${x.verified ? "verified (Cleanverse A-Pass)" : "unverified: earns no fees"} · ${x.posted} posted, ${x.scored} scored, ${x.wins} wins${
      x.scored ? `, avg ${((x.avgReturnBps ?? 0) / 100).toFixed(2)}%` : ""
    }`;
    const lines = r.recentCalls.map(
      (c) => `  #${c.id} ${c.side} @ ${c.entry} → ${c.scored ? `${((c.returnBps ?? 0) / 100).toFixed(2)}%` : c.open ? "open" : "awaiting score"}`,
    );
    return [head, ...lines].join("\n");
  }
}
