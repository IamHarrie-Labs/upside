# mm-plugin-upside

A [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/) plugin that lets an AI agent follow traders' calls on [Upside](../README.md) (Monad) within limits you set.

Copy trading usually means handing an agent your keys and hoping. Here an agent follows a call only when four layers allow it:

1. **The caller's record is onchain.** Every call is committed before the move and scored against the market mid, losers included, so the agent's rules read a record nobody can edit.
2. **Your rules:** the caller is verified (active Cleanverse A-Pass); has enough scored calls and a high enough win rate; the profit share is under your maximum; the call is fresh; and the follow fits your per-call size and daily budget.
3. **Your vault's exposure cap** is enforced by the `FollowVault` contract, whatever the agent does.
4. **Your Agent Wallet policy:** MetaMask checks every transaction and can ask you to approve it (Guard Mode).

The caller is paid only from your cumulative net profit above a high-water mark, so a follower who is down pays nothing.

## Commands

```
mm upside calls                          open calls and each caller's record
mm upside caller <address>               one caller's record
mm upside vault                          your vault, cap and positions
mm upside deposit --amount 50            create and fund your vault (testnet: mints test AUSD)
mm upside follow <callId> --amount 10    follow one call, if it passes your rules
mm upside close <positionId>             sell back to AUSD
mm upside autopilot --per-call 10 --daily-budget 50 [--watch] [--dry-run]
```

Rule flags for `follow` and `autopilot`:

| Flag | Default |
| --- | --- |
| `--max-fee-pct` | 20 |
| `--min-scored` | 3 |
| `--min-win-rate` | 50 |
| `--min-avg-return-pct` | 0 |
| `--max-age-min` | 15 |
| `--callers` | no allowlist |
| `--allow-unverified` | off |

All commands take `--chain-id 10143` (testnet, default) or `143` (mainnet) and `--json`. On mainnet, swaps go through Kuru Flow. Quotes come from the Upside keeper, set with `--keeper-api` or `UPSIDE_KEEPER_API`.

`skills/upside/SKILL.md` teaches an agent when to use each command and when to ask you first.

## Install

Requires Node 22+ and the Agent Wallet CLI (`npm i -g @metamask/agent-wallet`, then `mm login` and `mm init`).

```bash
cd mm-plugin && npm install && npm run build && npm pack
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true    # local packages only
mm plugins install file:/full/path/to/mm-plugin-upside-0.1.0.tgz --accept-permissions
mm upside calls
```

Install from the packed `.tgz`. A `file:` directory install links the folder, and the plugin then can't resolve `@metamask/agent-wallet`. On Windows, use a path without spaces. Once the package is published to npm: `mm plugins install mm-plugin-upside`.

The consent screen shows that the commands are split by capability:
- `calls` and `caller` need none.
- `vault` needs `wallet-read`.
- `deposit`, `follow`, `close` and `autopilot` need `wallet-read` and `wallet-submit`.

All commands target only Monad (143, 10143).

## How it uses the plugin API

- Commands extend `PluginCommand` and declare inputs once with `schemaToFlags` / `schemaToArgs`.
- Writes go through `ctx.walletExecutor(io, "<command id>")`: `{ kind: "transaction", chainId, transaction, intent: { action: "custom", summary } }`. The summary is what you see when approving, e.g. "Follow Upside call #12: buy MON with 10.00 AUSD (caller earns 15% of net profit only)". The plugin then waits for the receipt and reports the explorer link.
- Reads use `ctx.publicClient(chainId)` when the command has `wallet-read`, and Monad's public RPC otherwise.
- The acting address comes from `ctx.walletStateManager` (the selected EVM wallet).
- Errors are `CommandError`s with stable codes (`RULES_REFUSED`, `STALE_PRICE`, `TX_DENIED`, …) and a hint.

All logic lives in `src/core.ts`; the commands are thin adapters. The autopilot remembers followed calls and daily spend in `~/.upside/`.

## Test

```bash
npm run test:local
```

This runs the core end to end on a local Anvil chain, with a local signer in place of MetaMask's executor. It needs `anvil --port 8547`, `bash scripts/setup-local.sh` and the keeper running. It checks that the agent:
- follows the verified caller and skips the unverified Sybil farm;
- skips a fee above the limit;
- stays within the vault cap;
- never follows the same call twice;
- sends nothing on a dry run;
- closes positions when their call expires.

Verified so far:
- The plugin installs into `mm` 7.0.0, and `mm upside calls` and `mm upside caller` run there against live chain data.
- Wallet commands correctly require `mm login`.
- Signing through a real Agent Wallet needs your own sign-in.
