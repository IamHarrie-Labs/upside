# mm-plugin-upside

A [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/) plugin that lets an AI agent follow traders' calls on [Upside](../README.md) (Monad) within limits you set.

Copy trading usually means handing an agent your keys and hoping. Here an agent follows a call only when four layers allow it:

1. **The caller's record is onchain.** Every call is committed before the move and scored against the market mid, losers included, so the agent's rules read a record nobody can edit.
2. **Your rules:** the caller is verified (active Cleanverse A-Pass); has enough scored calls and a high enough win rate; the profit share is under your maximum; the call is fresh; and the follow fits your per-call size and daily budget.
3. **Your vault's exposure cap** is enforced by the `FollowVault` contract, whatever the agent does.
4. **Your Agent Wallet policy:** MetaMask checks every transaction and can ask you to approve it (Guard Mode).

The caller is paid from cumulative realized gains above a per-caller high-water mark. Earlier realized losses are recovered first. Open losses, gas and previous fees are excluded; already paid fees are not refunded.

Two more pieces make the agent accountable and better informed:

- **ERC-8004 identity.** `mm upside agent register` gives the agent an identity in the official ERC-8004 IdentityRegistry on Monad. Its registration file publishes the agent's mandate: per-call size, daily budget, rules and vault. Anyone can read it with `mm upside agent show <id>` and compare it with what the agent does onchain. Autopilot then labels every transaction intent with the agent id.
- **x402 payments.** `mm upside intel <caller>` and the `--smart-money-only` rule check callers against Nansen's Smart Money wallets on Monad. Nansen charges $0.05 per request, paid with USDC on Monad over x402. The EIP-712 payment authorization is signed by your Agent Wallet, so it passes your policy like any other action, and a price cap (`--max-price`, default $0.10) is checked before signing.

## Commands

```
mm upside calls                          open calls and each caller's record
mm upside caller <address>               one caller's record
mm upside vault                          your vault, cap and positions
mm upside deposit --amount 50            create and fund your vault (testnet: mints test AUSD)
mm upside follow <callId> --amount 10    follow one call, if it passes your rules
mm upside close <positionId>             sell back to AUSD
mm upside autopilot --per-call 10 --daily-budget 50 [--watch] [--dry-run] [--smart-money-only]
mm upside agent register --name "Sarah follower" --per-call 10 --daily-budget 50    ERC-8004 identity + mandate
mm upside agent show <agentId>           owner, agent wallet, decoded registration and mandate
mm upside intel <address>                Nansen Smart Money check, paid $0.05 USDC on Monad via x402
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
| `--smart-money-only` | off (Nansen lookup via x402; once per autopilot pass, only when a call passes every other rule) |
| `--max-price` | $0.10 per x402 request |
| `--intel-daily-budget` | $1 USDC per UTC day for Nansen authorizations |

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
- **ERC-8004** (`src/erc8004.ts`) uses the official ABI:
  - `register(string agentURI)` with a base64 `data:application/json` registration (registration-v1, plus an `upside` mandate field). The agent id comes from the `Registered` event.
  - `setAgentURI` then adds the agent's own `registrations` entry.
  - `agent show` reads `ownerOf`, `tokenURI` (decoded) and `getAgentWallet`.
  - Registries: mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, testnet `0x8004A818BFB912233c491871b3d84c89A494BD9e`.
  - The registry mints with `_safeMint`, so `register` simulates first. It refuses, with a clear error, a wallet whose contract code (e.g. an EIP-7702 delegation) won't accept ERC-721s.
- **x402** (`src/x402.ts`) uses `x402HTTPClient` from `@x402/core` and `registerExactEvmScheme` from `@x402/evm`:
  - The signer's `signTypedData` is the wallet executor's `{ kind: "typed-data" }` request, with a readable intent such as "x402 payment: 0.05 USDC to 0x9305...".
  - Only `eip155:143` (USDC on Monad) offers are accepted.
  - The settlement result is reported back.
- Errors are `CommandError`s with stable codes (`RULES_REFUSED`, `STALE_PRICE`, `TX_DENIED`, …) and a hint.

All trading logic lives in `src/core.ts`; the commands are thin adapters. The autopilot stores atomic, locked daily reservations in `~/.upside/`, reconstructs confirmed spending from chain events, and stops on corruption or unresolved submission. Daily budgets are local policy, separate from the onchain original-cost exposure cap. Another client holding the credential can bypass local policy. See [ledger recovery](../docs/agent-budget-recovery.md).

Nansen authorization requires exact USDC on Monad, a valid recipient, bounded lifetime and the price/daily caps. Thirty-minute results are cached across restarts. An uncertain or failed authorization retains its reservation. Dry runs never purchase intelligence. This snapshot describes recent Nansen Smart Money trades, not a complete or permanent wallet classification. Actual funded payment and Agent Wallet host approval remain unverified.

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

```bash
anvil --fork-url https://testnet-rpc.monad.xyz --chain-id 10143 --port 8549
npx tsx scripts/identity-x402-test.ts
```

This registers an agent in the real ERC-8004 registry on a fork of Monad testnet, then reads it back:
- the id comes from the `Registered` event;
- owner and agent wallet are correct;
- the registration and its mandate round-trip;
- a wallet with code is refused before anything is sent.

It then makes a real x402 request to Nansen with an empty throwaway key:
- the price cap refuses before signing;
- exactly one USDC authorization is signed;
- Nansen's facilitator rejects it only for insufficient funds.

Verified so far:
- The plugin installs into `mm` 7.0.0, and `mm upside calls`, `mm upside caller` and `mm upside agent show` run there against live chain data. `agent show 2014 --chain-id 10143` decodes a real agent on the Monad testnet registry.
- Wallet commands correctly require `mm login`.
- Signing through a real Agent Wallet needs your own sign-in.
