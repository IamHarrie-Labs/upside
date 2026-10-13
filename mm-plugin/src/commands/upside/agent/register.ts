import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Address, Hex } from "viem";
import { getVault } from "../../../core.js";
import { registerAgent, registrationFile, updateAgentUri } from "../../../erc8004.js";
import { asCommandError, chainIdFrom, chainInput, walletHost } from "../../../host.js";
import { amountFrom, mandateOf, ruleInputs, rulesFrom } from "../../../rules.js";

const inputs = {
  name: { type: InputFieldType.Text, flag: "name", message: "Agent name, e.g. \"Sarah follower\"", required: true, prompt: true },
  description: { type: InputFieldType.Text, flag: "description", message: "Optional description (one is generated from the mandate)", required: false, prompt: false },
  perCall: { type: InputFieldType.Text, flag: "per-call", message: "Mandate: AUSD per followed call (default 10)", required: false, prompt: false },
  dailyBudget: { type: InputFieldType.Text, flag: "daily-budget", message: "Mandate: most AUSD in new follows per day (default 50)", required: false, prompt: false },
  ...ruleInputs,
  ...chainInput,
} satisfies InputSchema;

type Result = { agentId: number; registry: string; owner: Address; vault: Address | null; hashes: Hex[]; registration: unknown };

export default class UpsideAgentRegister extends PluginCommand<Result> {
  static override description =
    "Register this wallet's Upside follow agent as an ERC-8004 identity on Monad, publishing its mandate (rules, per-call size, daily budget, vault) in the agent URI so anyone can check it.";
  static override examples = [
    '<%= config.bin %> upside agent register --name "Sarah follower" --per-call 10 --daily-budget 50 --min-scored 5',
  ];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:agent:register";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const perCall = amountFrom(i.perCall, "per-call", "10");
      const dailyBudget = amountFrom(i.dailyBudget, "daily-budget", "50");
      const mandate = mandateOf(rulesFrom(i, perCall), dailyBudget);
      const h = await walletHost(this.ctx, io, this.pluginCommandId, chainIdFrom(i.chainId), undefined, { requireDeployment: false });
      h.agentId = null; // registering a new identity, not acting as an existing one
      const vault = h.d ? await getVault(h, h.account) : null; // no Upside deployment on this chain yet
      const base = { name: String(i.name), description: i.description ? String(i.description) : undefined, chainId: h.chainId, owner: h.account, vault, mandate };

      const reg = await registerAgent(h, registrationFile(base));
      // ERC-8004 registration files list their own registrations; the id is only known after minting.
      const full = registrationFile({ ...base, agentId: reg.agentId });
      const hx = await updateAgentUri(h, reg.agentId, full);
      return {
        agentId: reg.agentId,
        registry: `eip155:${h.chainId}:${reg.registry}`,
        owner: h.account,
        vault,
        hashes: [reg.hash, ...(hx ? [hx] : [])],
        registration: full,
      };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    return `Registered ERC-8004 agent #${r.agentId} (${r.registry}). Autopilot now labels its transactions with this id. Check it with: mm upside agent show ${r.agentId}`;
  }
}
