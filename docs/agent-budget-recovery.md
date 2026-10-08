# Agent budgets and recovery

The vault's original-cost exposure limit is enforced by its contract. Plugin daily spending and intelligence allowances are local safeguards. A separate client, manually edited file, different machine or copied trade credential can bypass local rules. ERC-8004 identity publishes an identity and mandate; it does not enforce that mandate.

## Trading ledger

Each wallet/chain has an atomic ledger in `UPSIDE_STATE_DIR` or `~/.upside/`. An exclusive `.lock` prevents simultaneous plugin passes from spending independently. Missing state triggers reconstruction of today's confirmed vault `Followed` events, including orders from another client. Catch-up is bounded and resumes across passes; no new order runs until it reaches the head. Corrupt or unsupported state is refused.

Before approving or broadcasting a follow, `pending` reserves the amount. Only a confirmed follow removes that reservation and saves the daily spend. An uncertain broadcast, rejected transaction, interrupted approval or crash stops later follows. This intentionally favors refusal over accidentally repeating an order. The current ledger does not automatically recover an interrupted authorization.

If recovery is needed, stop that wallet's pilot processes, confirm that none still owns the lock, inspect the vault's transactions and `Followed` events around the failure, and compare call ID, amount, sender and receipt status. Restore a trusted ledger backup or reconcile its reservation to confirmed chain activity. Only then remove a crashed process's stale lock or clear a proven unbroadcast/reverted pending item. Do not delete the ledger to “reset” a budget. Check the next dry run before enabling writes.

## Intelligence allowance

The plugin accepts only the exact scheme, Monad mainnet and the configured six-decimal USDC asset. It validates recipient, integer amount and short authorization lifetime before signing. `--max-price` caps each request; `--intel-daily-budget` caps daily reserved USDC, default $1. Recent Smart Money trade snapshots are cached for 30 minutes, including across restarts. They indicate recent trading activity, not complete address classification or verified skill.

Reservations are persisted before signing. Failed or unconfirmed settlement remains reserved because a signed authorization may still settle. Paid responses need successful settlement evidence. A dry-run follow/pilot signs nothing and does not buy intelligence; a required paid classification is reported as unavailable. Intelligence on another machine is a separate ledger and does not share this allowance automatically.

Keeper paid mode additionally requires `NANSEN_STATE` on durable storage. Defaults: $0.10 per request and $1 reserved USDC/day, configurable through `NANSEN_MAX_PRICE` and `NANSEN_DAILY_USDC`. Failed refreshes respect the refresh cooldown. Paid mode remains disabled until deliberately configured with a funded paying account; these changes did not purchase any Nansen data.

## Verified checks

`node scripts/qa/security-regressions.mts` covers wrong asset/network, excess price, malformed offers, explicit verification mode, corrupt state, concurrent locks, expired held calls outside the discovery window, spend reconstruction, pending refusal, cached lookup and dry-run payment refusal. These fixtures do not establish MetaMask Guard Mode behavior. The host demonstration must still show its approval/refusal path using the actual Agent Wallet.
