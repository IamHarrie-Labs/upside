import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Address } from "viem";
import { publicReader } from "../../../core.js";
import { getAgent } from "../../../erc8004.js";
import { asCommandError, chainIdFrom, chainInput } from "../../../host.js";

const inputs = {
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agent id", required: true, index: 0 },
  ...chainInput,
} satisfies InputSchema;

type Result = { agentId: number; registry: string; owner: Address; agentWallet: Address; uri: string; registration: any };

export default class UpsideAgentShow extends PluginCommand<Result> {
  static override description =
    "Show an ERC-8004 agent on Monad: owner, agent wallet and its decoded registration, including an Upside agent's declared mandate.";
  static override examples = ["<%= config.bin %> upside agent show 42", "<%= config.bin %> upside agent show 42 --chain-id 143 --json"];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:agent:show";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const id = Number(i.agentId);
      if (!Number.isInteger(id) || id < 0) throw new CommandError("INVALID_INPUT", `Not an agent id: ${i.agentId}`, "Pass a whole number, e.g. 42.");
      const chainId = chainIdFrom(i.chainId);
      const a = await getAgent(publicReader(chainId), chainId, id);
      return { ...a, uri: a.uri.length > 200 ? `${a.uri.slice(0, 200)}…` : a.uri, registration: a.registration };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    const reg = r.registration ?? {};
    const m = reg.upside?.mandate;
    return [
      `Agent #${r.agentId} "${reg.name ?? "?"}" · owner ${r.owner} · agent wallet ${r.agentWallet}`,
      reg.description ?? "",
      m
        ? `Mandate: ${m.perCall} AUSD per call, ${m.dailyBudget} AUSD/day, fee ≤${m.maxFeePct}%, ≥${m.minScored} scored calls, ≥${m.minWinRatePct}% wins, ${m.verifiedOnly ? "verified callers only" : "any caller"}${m.nansenSmartMoneyOnly ? ", Nansen Smart Money only" : ""}`
        : "No Upside mandate in this registration.",
      reg.upside?.vault ? `Vault: ${reg.upside.vault}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
