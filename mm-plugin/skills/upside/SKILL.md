---
name: upside
description: Follow verified traders' onchain calls on Monad with the user's MetaMask Agent Wallet, within limits the user sets, using the `mm upside` plugin commands. Use when the user asks to browse trading calls, check a caller's track record, copy or follow a call, run an autopilot that follows calls, or close Upside positions.
---

# Upside on MetaMask Agent Wallet

Upside is a feed of trading calls on Monad. Every call is committed onchain before the move and scored
against the fresh mid when scored after expiry, losers included. Followers trade from their own vault.
Caller fees use new cumulative realized gains above a per-caller high-water mark after earlier closed
losses are recovered. Open losses, gas and previous fees are excluded; paid fees are not refunded.
The current gate attestation determines whether a caller earns. Testnet uses explicit demo attestations;
the intended Cleanverse A-Pass integration still requires authenticated verification.

The `mm upside` commands come from the `mm-plugin-upside` plugin. Always pass `--json` and read the
`ok`, `data` and `error.code` fields.

## Chains

- `--chain-id 10143`: Monad testnet. Default. The deposit command mints test AUSD here.
- `--chain-id 143`: Monad mainnet, real AUSD. Mainnet follows also need `--keeper-api <url>` (or
  `UPSIDE_KEEPER_API`) for Kuru Flow quotes.

Use testnet unless the user clearly asks for mainnet.

## Commands

| Command | Moves funds | What it does |
| --- | --- | --- |
| `mm upside calls [--all]` | no | Open calls, with each caller's record: verified, scored calls, wins, average return |
| `mm upside caller <address>` | no | One caller's record and recent calls |
| `mm upside vault` | no | The user's vault: cash, exposure cap, positions |
| `mm upside deposit --amount <AUSD> [--max-exposure <AUSD>]` | yes | Creates the vault on first use and funds it |
| `mm upside follow <callId> --amount <AUSD> [rules] [--dry-run]` | yes | Follows one call if it passes the rules |
| `mm upside close <positionId>` | yes | Sells the position back to AUSD in the vault |
| `mm upside autopilot [rules] [--per-call] [--daily-budget] [--watch] [--dry-run]` | yes | Follows qualifying calls and closes expired ones |
| `mm upside agent register --name <n> [--per-call] [--daily-budget] [rules]` | gas only | Registers the agent's ERC-8004 identity and publishes its mandate |
| `mm upside agent show <agentId>` | no | Reads an ERC-8004 agent: owner, agent wallet, registration, mandate |
| `mm upside intel <address> [--max-price]` | $0.05 USDC | Nansen Smart Money check on Monad, paid over x402 |

Rule flags, shared by `follow` and `autopilot`:

- `--max-fee-pct` (default 20): refuse calls whose profit share is higher.
- `--min-scored` (3): minimum scored calls for the caller.
- `--min-win-rate` (50): minimum win rate, in percent.
- `--min-avg-return-pct` (0): minimum average return per scored call.
- `--max-age-min` (15): only follow calls posted within this many minutes, so the entry is close to the caller's.
- `--callers`: comma-separated allowlist of caller addresses.
- `--allow-unverified`: include callers without an A-Pass. Off by default.
- `--smart-money-only`: require the caller in Nansen's recent Monad Smart Money trade snapshot. Fresh
  snapshots are cached for 30 minutes across restarts. A new refresh may cost $0.05 USDC on Monad mainnet,
  only when a call passes the other rules. A missing wallet is not proof it is never Smart Money.
- `--max-price` (0.10): most USD per x402 request; higher prices are refused before signing.
- `--intel-daily-budget` (1): daily USDC authorization allowance, separate from AUSD trading. Uncertain
  payments retain their reservation. Dry runs never purchase intelligence.

## How to act

1. **Look before moving money.** Run `mm upside calls --json` and, for any caller you would follow,
   `mm upside caller <address> --json`. Summarise the record for the user in plain words: wins out of
   scored calls, average return, verified or not.
2. **Ask before the first transaction.** Before `deposit`, `follow`, `close` or a non-dry-run `autopilot`,
   state the amount, the call or position, and the caller's record. Wait for a clear yes. The user's
   Agent Wallet policy may also ask them to approve on their device (Guard Mode). Tell them when to expect that.
3. **Prefer `--dry-run` first** for `follow` and `autopilot`. Show the user which calls would be followed
   or skipped and why.
4. **Never loosen a rule on your own.** If a command returns `RULES_REFUSED`, report the reasons. Change a
   rule flag (for example `--allow-unverified` or a lower `--min-scored`) only when the user asks for it.
5. **Autopilot needs explicit limits from the user.** Ask for `--per-call` and `--daily-budget` and
   confirm them. The vault's `--max-exposure` cap limits the original cost of open positions onchain;
   it is not a guaranteed maximum loss. Daily trading and intelligence allowances are local policies.
   Missing ledger state is reconciled from chain events. Corrupt or unresolved state stops new trades;
   follow the recovery guide rather than resetting a budget.
6. **Identity before autonomy.** Before a long-running `autopilot --watch`, offer to register the agent with
   `mm upside agent register`, using the same limits the user agreed to, so its mandate is public. Its
   transactions are then labelled with the agent id.
7. **Paid lookups cost real money.** `intel` and `--smart-money-only` pay USDC on Monad mainnet. Say so
   before the first paid request, and never raise `--max-price` unless the user asks.
8. **Report outcomes faithfully**, with transaction links from the output. If a transaction is denied by
   policy or expires waiting for approval (`TX_DENIED`, `TX_EXPIRED`), say so and stop. Don't retry in a loop.

## Errors

| Code | Meaning | What to do |
| --- | --- | --- |
| `RULES_REFUSED` | The call breaks a rule; the message lists every reason | Report it; pick another call |
| `STALE_PRICE` | No fresh onchain price | Wait a minute and retry once |
| `UPSIDE_NOT_DEPLOYED` | Wrong chain | Use 10143 or 143 |
| `NO_KEEPER_API` | Mainnet swap without a quote source | Ask the user for the keeper URL |
| `INSUFFICIENT_AUSD` | Wallet lacks AUSD for a mainnet deposit | Tell the user; don't bridge or swap unless asked |
| `AUTH_FAILED` | Not signed in to Agent Wallet | Ask the user to run `mm login` |
| `PRICE_TOO_HIGH` | An x402 seller asks more than `--max-price` | Report the price; raise only if the user agrees |
| `X402_REJECTED` | Payment not accepted (usually no USDC on Monad mainnet) | Tell the user to fund the wallet with a little USDC |
| `AGENT_WALLET_CANNOT_RECEIVE_NFT` | The wallet's code rejects the ERC-8004 identity NFT | Register from another account |

## Example

User: "Put 10 AUSD behind the best verified caller on testnet, nothing above a 15% fee."

1. `mm upside calls --json` → choose open calls from verified callers with `feeBps` ≤ 1500.
2. `mm upside caller 0x… --json` → "Ada: 7 wins from 9 scored calls, average +2.1%, verified."
3. `mm upside follow 12 --amount 10 --max-fee-pct 15 --dry-run --json` → passes.
4. Confirm with the user, then run the same command without `--dry-run`.
