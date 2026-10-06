import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import type { Hex } from "viem";
import { close, fmtQuote, getVault, getVaultState } from "../../core.js";
import { asCommandError, chainIdFrom, chainInput, keeperInput, walletHost } from "../../host.js";

const inputs = {
  positionId: { type: InputFieldType.Text, flag: "position", message: "Position id to close (see mm upside vault)", required: true, index: 0 },
  ...chainInput,
  ...keeperInput,
} satisfies InputSchema;

type Result = { positionId: number; estimatedProceeds: string; cash: string; hash?: Hex };

export default class UpsideClose extends PluginCommand<Result> {
  static override description =
    "Close a position: sell its MON back to AUSD in your vault. If you are up overall with this caller, they get their share of the gain above your high-water mark.";
  static override examples = ["<%= config.bin %> upside close 3", "<%= config.bin %> upside close 3 --json"];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "upside:close";

  async execute(io: CommandIO): Promise<Result> {
    try {
      const i = await io.resolveInputs(inputs);
      const h = await walletHost(this.ctx, io, this.pluginCommandId, chainIdFrom(i.chainId), i.keeperApi as string | undefined);
      const vault = await getVault(h, h.account);
      if (!vault) throw new CommandError("NO_VAULT", "No Upside vault for this wallet.", "Run mm upside deposit first.");
      const p = (await getVaultState(h, vault)).positions.find((x) => x.id === Number(i.positionId));
      if (!p) throw new CommandError("POSITION_NOT_FOUND", `No position #${i.positionId} in your vault.`, "List positions with mm upside vault.");
      if (!p.open) throw new CommandError("POSITION_CLOSED", `Position #${p.id} is already closed.`, "See open positions with mm upside vault.");
      const r = await close(h, vault, p);
      const s = await getVaultState(h, vault);
      return { positionId: p.id, estimatedProceeds: fmtQuote(r.estimatedProceeds), cash: fmtQuote(s.cash), hash: r.hash };
    } catch (e) {
      asCommandError(e);
    }
  }

  override successHint(r: Result): string {
    return `Closed position #${r.positionId}. Vault cash is now ${r.cash} AUSD.`;
  }
}
