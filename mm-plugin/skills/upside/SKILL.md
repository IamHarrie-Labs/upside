---
name: upside
description: Follow verified traders' onchain calls on Monad with the user's MetaMask Agent Wallet, within limits the user sets, using the `mm upside` plugin commands. Use when the user asks to browse trading calls, check a caller's track record, copy or follow a call, run an autopilot that follows calls, or close Upside positions.
---

# Upside on MetaMask Agent Wallet

Upside is a feed of trading calls on Monad. Every call is committed onchain before the move and scored
against the market mid at expiry, losers included. Followers trade from their own vault, and a caller is
paid only from the follower's cumulative net profit above a high-water mark. Only callers with an active
Cleanverse A-Pass are "verified" and can earn fees.

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

Rule flags, shared by `follow` and `autopilot`:

- `--max-fee-pct` (default 20): refuse calls whose profit share is higher.
- `--min-scored` (3): minimum scored calls for the caller.
- `--min-win-rate` (50): minimum win rate, in percent.
- `--min-avg-return-pct` (0): minimum average return per scored call.
- `--max-age-min` (15): only follow calls posted within this many minutes, so the entry is close to the caller's.
- `--callers`: comma-separated allowlist of caller addresses.
- `--allow-unverified`: include callers without an A-Pass. Off by default.

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
   confirm them. The vault's `--max-exposure` cap is enforced by the contract and is the hard ceiling,
   whatever the agent does. Suggest a cap no larger than the user is willing to lose.
6. **Report outcomes faithfully**, with transaction links from the output. If a transaction is denied by
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

## Example

User: "Put 10 AUSD behind the best verified caller on testnet, nothing above a 15% fee."

1. `mm upside calls --json` → choose open calls from verified callers with `feeBps` ≤ 1500.
2. `mm upside caller 0x… --json` → "Ada: 7 wins from 9 scored calls, average +2.1%, verified."
3. `mm upside follow 12 --amount 10 --max-fee-pct 15 --dry-run --json` → passes.
4. Confirm with the user, then run the same command without `--dry-run`.
