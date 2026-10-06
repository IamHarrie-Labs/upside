import { type CommandIO, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Address } from "viem";
import { deploymentFor, fmtBase, fmtQuote, getMid, getVault, getVaultState, publicReader } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, selectedAddress } from "../../host.js";

const inputs = { ...chainInput } satisfies InputSchema;

type Result = {
  owner: Address;
  vault: Address | null;
  cash?: string;
  maxExposure?: string;
  openCost?: string;
  positions?: { id: number; callId: number; caller: Address; mon: string; cost: string; value: string | null; open: boolean }[];
};

export default class UpsideVault extends PluginCommand<Result> {
  static override description = "Show your Upside vault: AUSD cash, the onchain exposure cap, and open and closed positions.";
  static override examples = ["<%= config.bin %> upside vault", "<%= config.bin %> upside vault --chain-id 143 --json"];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:vault";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const chainId = chainIdFrom(i.chainId);
      const h = { chainId, d: deploymentFor(chainId), read: publicReader(chainId) };
      const owner = selectedAddress(this.ctx);
      const vault = await getVault(h, owner);
      if (!vault) return { owner, vault: null };
      const [s, mid] = await Promise.all([getVaultState(h, vault), getMid(h)]);
      return {
        owner,
        vault,
        cash: fmtQuote(s.cash),
        maxExposure: fmtQuote(s.maxExposure),
        openCost: fmtQuote(s.openCost),
        positions: s.positions.map((p) => ({
          id: p.id,
          callId: p.callId,
          caller: p.caller,
          mon: fmtBase(p.baseAmount),
          cost: fmtQuote(p.cost),
          value: p.open && mid ? fmtQuote((p.baseAmount * mid) / 10n ** 18n) : null,
          open: p.open,
        })),
      };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    if (!r.vault) return `No Upside vault for ${r.owner} yet. Create and fund one with: mm upside deposit --amount 50`;
    const open = r.positions!.filter((p) => p.open);
    return [
      `Vault ${r.vault} · cash ${r.cash} AUSD · open ${r.openCost}/${r.maxExposure} AUSD cap`,
      ...open.map((p) => `  position #${p.id} on call #${p.callId}: ${p.mon} MON, cost ${p.cost}, now ${p.value ?? "?"} AUSD`),
      open.length ? "" : "  no open positions",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
