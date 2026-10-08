# Keeper, scoring and exits — decision, 8 October 2026

Status: retain the current fail-closed contracts for the test-token hackathon preview. No mainnet launch or emergency fund-release mechanism is approved by this decision.

## Current behavior

The configured keeper posts a reference price. Testnet uses a generated demo price; the mainnet implementation estimates a mid from small executable Kuru Flow buy/sell quotes. Neither is a decentralized oracle or an exact expiry-time historical price. `scoreCall` uses the fresh price available when the scoring transaction executes after expiry. The score is a signal evaluation, separate from a follower's realized result.

An unavailable or stale price prevents new calls, follows **and closes**. Base tokens associated with open positions remain locked. Available settlement cash can still be withdrawn. The owner can change the price source, gate, permitted routers, protocol fee and treasury. Follower ownership prevents callers from withdrawing, but does not remove these administrator and service dependencies.

We retain these boundaries because loosening the price guard or withdrawing locked base without settlement could change the accounting, bypass caller fees, or let compromised routing drain positions. A rushed emergency exit would be a new economic and security mechanism. It requires separate design, tests, migration and review.

## Operations during judging

Use one keeper writer, persistent `/data` storage, a funded testnet account and the published `/poke` status. Activity price pushes run every 30 seconds while an app is active; they stop at the configured daily gas allowance. Scoring-related pushes and scoring are allowed beyond the activity allowance, so that number is **not a hard total gas-spend cap**. Monitor balance and gas state before rehearsal. The keeper refuses unreadable spend state and exits if updated spend cannot be persisted.

On stale price: tell the user trading is unavailable, inspect RPC access, keeper logs and wallet balance, then restore the existing keeper. Do not change the price or transfer locked tokens merely to make a demonstration succeed. On gas cap: explain that fresh trading resumes after the allowance resets or the operator deliberately changes it. On a routing outage: cancel preparation and retain the vault position.

## Indexing and evidence

The keeper scans public logs in 100-block chunks. Global backfill can lag substantially; the interface says “Activity indexing” rather than showing a misleading zero. Receipts use the full known settlement history or a bounded vault lookup. That lookup verifies the factory's owner→vault mapping and requires one settlement for every closed position. It refuses partial history. Each request scans at most 2,000 blocks, resumes backward on the next request, and checks the snapshot block hash before resuming. A changing closed-position count resets the lookup. Up to 50 positions are supported; larger histories require the full indexer. The current keeper serves at most eight concurrent lookups and 256 in-memory backfills, with a five-minute idle expiry; restarting loses this temporary progress. The Envio implementation remains a separate unproven deployment.

## Next production design

Before real funds: select a verifiable, timestamped reference feed and explicit outage policy; define expiry evaluation with a historical observation window and maximum scoring delay; decide whether emergency in-kind exit charges a fee or suspends scoring; constrain administrator changes with delay and notification; independently review vault settlement and oracle replacement. Publish a migration plan rather than silently changing existing users' economics.

## Evidence

`test_reviewLateScoringUsesPriceAtExecution`, `test_reviewStalePriceBlocksCloseAndKeepsBaseLocked` and `test_reviewOpenLossDoesNotOffsetClosedWinnerFee` reproduce the important preview limitations. They remain passing tests, not claims that the limitations disappeared.

Monad newly funded EOAs need a delay after the funding receipt before they can send transactions. The transaction helper spaces dependent public-network actions by 1.5 seconds; the testnet smoke harness uses two seconds. [Monad asynchronous execution documentation](https://docs.monad.xyz/monad-arch/consensus/asynchronous-execution).
