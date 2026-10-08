# Upside: product, engineering and hackathon review

Reviewed 8 October 2026, after applying the user-selected Cabin identity.

## Verdict

Upside has a clear product proposition and a coherent visual identity. Its strongest asset is the working relationship between public calls, follower-controlled execution and loss-aware compensation. The fee mechanism is more persuasive than a social feed with token rewards. Cabin connects the interface to its aircraft illustration without adding another directional arrow.

It is a credible hackathon prototype. It is not yet a production trading service. The next work should make execution, accounting boundaries and integration evidence more trustworthy. Another feature or landing-page animation will contribute less than a reliable first trade and a clear settlement receipt.

These grades are an independent review rubric, not official Metropolis scores, measured user satisfaction or probabilities of winning.

| Perspective | Grade | Reason |
|---|---:|---|
| Visual design | 8/10 | Consistent Grotesk hierarchy, restrained palette, distinctive scene and coherent web/native identity. Dense trading cards and borrowed scene assets limit the finish. |
| Product usability | 7/10 | Browsing, records and vault controls are understandable. Funding, account continuity, trade confirmation and settlement discovery require more guidance. |
| Blockchain prototype engineering | 6/10 | Meaningful contract protections and reproducible transactions; substantial oracle, exit availability, accounting and administration assumptions remain. |
| Mainnet release readiness | 3/10 | No independent audit, physical-phone proof or complete hosted money-flow verification in this review. Important safety properties remain unresolved. |
| Hackathon submission strength | 7/10 | Clear problem, visible onchain logic and a memorable demo. Evidence quality and differentiation need tightening. |

I would continue building Upside. I would not expand it into a launchpad, prediction market or general agent platform before this submission.

## What was verified

- Cabin replaced the shared web mark. Favicon, PWA, Apple touch, Expo, Android adaptive and monochrome assets were regenerated. Native components consume the updated image assets. The three concept options remain archived in `brand/logo-options/`.
- Web production build and lint passed. Expo TypeScript and native-source lint passed.
- The current UI passed 51 fixture-based web states and 20 Expo-web states, without runtime errors or transaction writes. Fixtures establish rendering and state handling; they do not prove live execution.
- Targeted landing checks passed for actual Grotesk loading, five sections, pinned heading and release, keyboard FAQ, motion pause, reduced motion and widths 320–1440px.
- Foundry passed 21 tests. Three new tests demonstrate delayed scoring, stale-price exit blocking and fees while an unrealized loss remains open. Passing these tests confirms current limitations; it does not fix them.
- Previously recorded local browser transactions demonstrate posting, following 50 test AUSD, closing for 60, a 2 AUSD total performance fee, withdrawing 5 and scoring. The caller received 1.8 and the protocol 0.2. Separate loss and partial-recovery rounds paid no new fee. That evidence uses Anvil and controlled prices.
- Read-only requests to `https://upside-monad.vercel.app/` and `https://keeper.38.49.210.22.sslip.io/flow` returned HTTP 200. No hosted trade, paid intelligence request, new deployment or real-money transaction was executed in this review. The logo changes are local repository changes, not a new hosted release.
- Source was reviewed across vaults, scoring, configuration, attestations, keeper APIs, feed reads, mobile configuration, the agent plugin and its identity/payment flows. Existing integration claims are identified separately below.

## UI and UX assessment

| Dimension | Grade | Assessment |
|---|---:|---|
| First-use experience | 6/10 | Browsing without an account is useful. A passkey account, MON gas and settlement assets are three separate concepts; the journey still asks the user to connect them. |
| Core trading experience | 7/10 | Call → author → follow → vault is a reasonable structure. The follow button submits directly and can also create/fund a demo vault, hiding several meaningful actions behind one label. |
| Information architecture | 8/10 | Four workspace destinations, dedicated author/detail pages and a readable guide. Public-handle editing occupies prime space above the vault's cash and exposure. |
| Error recovery | 7/10 | Loading, RPC errors, stale prices and retry states exist. Stale-price recovery and insufficient-gas recovery need a more explicit operational path. |
| Visual design | 8/10 | Cabin, Space Grotesk and shared tokens work together. The aircraft remains memorable. Card metadata is dense, and small supporting text needs real-phone scrutiny. |
| Performance | 5/10 | The main JavaScript chunk is about 703KB minified/218KB gzipped. The feed reads all calls repeatedly, despite batching on hosted chains. No slow-network benchmark was performed. |
| Accessibility | 7/10 | Targeted contrast, skip navigation, names, keyboard disclosures and motion checks exist. No full screen-reader, zoom or physical-device accessibility review was performed. |
| Feature completeness | 6/10 | The local loop is demonstrable. Signed mobile builds, real-device passkeys, active production verification and complete settlement browsing remain gaps. |

### U1 — Add a trade review before signing (high priority)

`app/src/App.tsx` follows directly from the feed. First use may create a vault with a preset 500 AUSD limit and mint demo settlement tokens before following. This is convenient for a demo but obscures what the user authorizes.

Add one review sheet showing network, token amount, vault creation if needed, resulting original-cost exposure, venue, quoted output, slippage, caller fee and the realized-results rule. State that target/stop levels do not close automatically. Require explicit confirmation. A passkey prompt authenticates the account; it is not a substitute for showing the economic transaction.

Acceptance: a new follower can explain what will happen before signing; canceling sends no transaction; existing-vault and new-vault paths show different actions accurately.

### U2 — Make funding and account continuity a guided journey

Show separate checklist items for account MON and vault test AUSD. Explain why gas belongs in the account and trading funds in the vault. In the preview, keep test assets explicit instead of implying that dollar signs represent redeemable dollars. Choose the long-term passkey domain before inviting users to create funded accounts: derivation and authentication are tied to the original credential and relying party. Do not promise automatic recovery through a new domain or replacement passkey.

Acceptance: a fresh account reaches its first follow without leaving the user to infer which address receives which token; restoring the original credential returns to the same account on a second supported device.

### U3 — Make receipts and records more useful

Closed-position rows are considerably less informative than open positions. Give each settlement a drill-down: principal, actual proceeds, realized trading PnL, prior realized balance/high-water mark, chargeable gain, fee rate, caller payout, protocol share and transaction link. Keep gas separate. Put handle editing under account settings rather than ahead of the financial overview.

The call composer records levels but no substantial written rationale. A short thesis and invalidation reason would make the social product more useful than a repeated numeric call card. If added, commit a content hash and define storage availability; do not pretend mutable offchain text is immutable.

### U4 — Show which metric the user is reading

Use explicit labels: signal return, realized trading PnL and estimated open-position value. A caller's +10% signal score does not imply a follower gained 10%. Show sample size, outstanding calls and time horizon near rankings, not only in the guide. The existing average-return × square-root-count formula is a heuristic, not a statistically validated risk score.

Follower-independent scoring removes one source of manipulation, not identity farming, opposing calls across accounts or selective promotion. A gate attestation does not automatically prove one human. Do not present a one-call winning account as established expertise; use provisional rankings and explain the limited sample.

### U5 — Finish the original visual identity

Cabin scales well in the header, wordmark and app tile. The rest of the system is consistent. The remaining originality issue is the aircraft/trader footage: it is cropped from the supplied reference and documented as such. Replace it with an independently created scene, retaining the approved aircraft/cloud concept, before presenting the illustration as Upside's own work. Ownership/permission was not established by this review.

The generic Foundry README still points to the scaffold's `Counter.s.sol`, which is not the Upside deployment script. Replace that file with project-specific contract setup, deployment, authority and accounting documentation. It is a small issue, but a judge running the repository should meet the actual product rather than an untouched scaffold.

## Blockchain and agent findings

Severity describes practical impact. P1 means address before customer funds or a stronger product claim; P2 means address before growth or related integration claims. No broad audit certification or confirmed third-party theft exploit is claimed.

### B1 — P1: the price source is a privileged trust dependency

Evidence: `KeeperPriceSource.push`, `CallBook.setPriceSource`, `UpsideConfig.priceSource` and `FollowVault.follow/close`. Authorized keepers choose the reference price, and the owner can replace the source. `kuruMid` averages executable quotes of different trade sizes; it is not a direct orderbook mid or an independently secured oracle. The same reference affects rankings and fill checks.

Impact: a bad reference can mis-score calls, reject legitimate executions or weaken the slippage comparison. An allowlisted pair does not prove continuing market depth. The user controls their vault, but execution still depends on shared administration and services.

Fix: document the authority model prominently; separate administrator and low-balance keeper keys; validate independent sources and price deviations; constrain updates and pair eligibility. For production, use a reviewed price design with timestamps, bounded deviations and an explicit settlement policy. Administrative changes need suitable multisig/timelock design, with emergency response considered separately.

### B2 — P1: stale prices block exits while base tokens remain locked

Evidence: `FollowVault.close` reads `midPrice`; stale values revert. `withdraw` prevents removing base backing open positions. New test: `test_reviewStalePriceBlocksCloseAndKeepsBaseLocked`.

Impact: a keeper outage or exhausted activity budget can temporarily prevent the owner from closing or withdrawing the open position. This is a real exit-availability constraint even though the owner alone can initiate actions.

Fix: design and test a fallback reference or an emergency settlement/exit procedure that preserves the fee rules. Simply removing slippage checks or unlocking base tokens would create a separate fee-enforcement problem. The interface should distinguish unavailable exits from disabled entries and explain the recovery state.

### B3 — P1: expiry does not fix the score's measurement time

Evidence: `CallBook.scoreCall` accepts any time after expiry and reads the current reference. New test: `test_reviewLateScoringUsesPriceAtExecution` records +10% at expiry but +40% when scored a day later.

Impact: latency changes the outcome. Anyone can call scoring, but doing so still depends on the available price. Missed keeper cycles can give unrelated horizons the same later observation. This weakens comparisons between callers.

Fix: bind scoring to a defined observation for the expiry window, with a maximum delay and an explicit unavailable-data outcome. Historical rounds or immutable keeper observations require a suitable proof/trust design. Until then, say “price when scored after expiry,” not “price at expiry.”

### B4 — P1: realized-only fees can be charged while the combined position result is negative

Evidence: `_settleFee` updates `netPnl` only when closing. New test: `test_reviewOpenLossDoesNotOffsetClosedWinnerFee` closes a +50 AUSD winner and charges a 10 AUSD total fee while another position has a 100 AUSD unrealized loss.

Impact: “you only pay when you profit” can be read as a portfolio guarantee that the contract does not provide. It uses cumulative realized trading PnL per caller, before performance fees and gas. Earlier fees are not refunded after subsequent losses. Positions can be closed in different orders; fees use the closing call's rate even when that rate differs across the relationship.

Fix for the preview: disclose the realized-only boundary at follow and settlement, not just in the guide. Product decision for a stronger guarantee: use a defined crystallization period or a reviewed whole-relationship valuation model. Include concurrent positions, changing fee rates, rounding and gas/performance-fee boundaries in the accounting specification. Do not implement portfolio valuation casually; it expands oracle and liquidity assumptions.

### B5 — P1: the agent's daily budget is local, not a vault-level invariant

Evidence: `mm-plugin/src/core.ts` loads JSON spend state, returns empty state on read failure, writes after a confirmed follow and has no inter-process lock. The onchain limit restricts open original cost; it does not restrict daily turnover. ERC-8004 registration metadata describes a mandate but is not read as an enforcement policy by every run.

Impact: deleting/corrupting the file, running two processes or following through another client can defeat the advertised local daily counter. Onchain positions help prevent duplicate calls on later passes, but do not make daily spend accounting durable or race-free. MetaMask policy may add protections; actual custom-call and typed-data policy enforcement needs a real signed demonstration.

Fix: use a transaction-safe local lock and reconcile spend from confirmed events. For a hard guarantee, implement a reviewed onchain daily/session policy or prove that an appropriate Agent Wallet policy enforces the exact intended debit. Label local rules, wallet policies and contract invariants separately.

### B6 — P1: paid intelligence needs its own budget and asset checks

Evidence: the plugin's watched autopilot performs a Nansen lookup at most once per pass, with a per-request cap but no cross-pass cache or daily intelligence allowance. `paidFetch` chooses by network, assumes six decimals and does not explicitly require the documented USDC asset. The keeper's paid client also has no explicit per-request price ceiling.

Impact: if eligible candidates repeatedly fail the Smart Money filter, no AUSD is spent but a lookup can recur every default 30 seconds. At the documented $0.05/request, continuous successful paid lookups would be $6/hour or $144/day; that is an upper scenario, not observed expenditure. The AUSD trading budget does not cap USDC intelligence costs. Network-only offer selection is insufficient for the application's promise to pay a specific asset.

Fix: cache per time window, cap intelligence spend independently, pin the supported asset/scheme and validate offer amount/time fields before signing. Handle missing/failed settlement explicitly. Add mock-server tests for wrong asset, unexpected recipient policy, inflated price, repeated passes and failed settlement. Do not claim a completed x402 payment based on an insufficient-funds rejection. The [official x402 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) defines asset, amount and recipient terms and excludes client budget management from the protocol itself.

### B7 — P1: mock verification is not restricted to a demo chain in code

Evidence: `keeper/src/attest.ts` defaults to `mock`; every mode other than the exact string `api` enters the mock branch. The branch does not check chain or `deployment.demo`, despite its local-demo comment.

Impact: an authorized attester can unintentionally create a test attestation on a non-demo deployment. This is not an unauthenticated contract exploit: it requires attester signing authority. It is a production configuration hazard and makes “verified” a deployment-specific claim.

Fix: require an explicit accepted mode, fail closed on typos, and refuse mock on chain 143 or any non-demo deployment. In the preview use “test attestation.” Validate the actual A-Pass API, expiry units and response schema before presenting Cleanverse verification as working.

### B8 — P2: autopilot can overlook older open positions

Evidence: `autopilotPass` fetches only the latest 50 calls, then looks up each open position's call in that map before closing expired calls.

Impact: once a held call falls outside the latest 50, its expiry may no longer trigger an automatic close. This is separate from an oracle outage.

Fix: fetch each held call by ID, or query a dedicated held-position/expiry dataset. Add a test with more than 50 subsequent calls and an older open position.

### B9 — P2: follower counts currently count follow events

Evidence: `keeper/src/flow.ts` increments `followers` for every `Followed` event; the local feed aggregation does the same. Multiple positions from one vault increment the number repeatedly. The contracts permit that, even if autopilot avoids duplicate calls.

Impact: “followers” can misrepresent participation and invite volume/social-proof inflation. It does not change the signal score; it still affects how users interpret the card.

Fix: rename the current metric “follows” or count distinct vaults per call with a persisted relation. Do not call distinct wallets distinct humans. Test repeat follows and indexer/keeper parity.

### B10 — P2: feed/indexer availability and state recovery need hardening

Evidence: `getCalls` reads all calls on every refresh. The keeper scans sequentially from its unscored cursor and aggregates log counts to the chain head without an explicit reorg rewind. Envio handlers exist, but the application uses direct contract reads/keeper totals; `ExposureSet` is not handled to update the indexed vault limit.

Impact: RPC volume grows with history; partial indexing and stale limits can give inconsistent views. Multicall reduces network requests but does not bound total historical data or execution work.

Fix: paginate, use a deployed event indexer with freshness indicators, handle exposure changes and distinct participation correctly, and define restart/reorg behavior. Verify the hosted Envio instance before claiming production indexing.

### B11 — P2: public keeper endpoints need operational limits

Evidence: `/poke` is public, `/quote` accumulates a request body without a size limit, and `/nansen` accepts arbitrary valid addresses. The checked Caddy configuration has no request-rate rule. CORS is not caller authentication. Activity gas has a daily cap, but scoring intentionally bypasses it.

Impact: callers can consume service capacity or spend the bounded activity budget; a backlog of due calls and persistent scoring failures can still cost gas. API-key intelligence requests can consume quota for arbitrary addresses.

Fix: request-size/time limits, per-route rate limits, documented scoring retry/backlog controls, alerts and separate balances. Scope paid intelligence to known callers or a separately authorized quota. Ensure spending state survives restarts, as the deployment script already attempts.

## Hackathon judge assessment

The strongest pitch is: **“Trading calls with a public record, and fees on new realized gains after earlier realized losses are recovered.”** Demonstrate the fee arithmetic; do not lead with a sponsor list.

| Review criterion | Grade | What would raise it |
|---|---:|---|
| Problem clarity | 9/10 | Show one genuine signal buyer and creator describing their current pain. |
| Distinctiveness | 6/10 | The combination is interesting; social trading and high-water-mark fees are not new by themselves. Explain why individual committed calls and follower-owned settlement are useful together. |
| Technical execution | 7/10 | Show the actual chain transactions and reproducible fee cases; disclose synthetic demo fills. |
| User experience | 8/10 | One smooth fresh-account → follow → receipt flow on a real phone. |
| Monad fit | 7/10 | Show native composability and measured practical responsiveness, rather than claiming exclusivity or unmeasured speed. |
| Integration depth | 6/10 | Replace written/configured paths and partial tests with working sponsor-specific evidence. |
| Demand evidence | 3/10 | No interview, retained-user or willingness-to-pay evidence was supplied or collected in this review. |

The difference between “shortlist-worthy” and “winner-ready” is now proof: reliable public execution, a complete receipt, honest fee boundaries, and a concrete user. Scores are judgment, not a prediction of the judges' decision.

### Integration evidence and bounty strategy

| Integration | Evidence currently available | What to show before relying on it |
|---|---|---|
| AUSD / Agora | Parameterized real-token route; testnet uses a stand-in | Separate test AUSD from real AUSD and confirm the exact mobile bounty rules. |
| Kuru | Previously documented mainnet-fork round trip with live quote calldata | Save reproducible commands/output and route details. DemoRouter fills are not live Kuru execution. |
| Mera | Passkey derivation/signing implemented | Real supported phone, stable RP domain, association files, account restoration and signed transactions. |
| MetaMask | Plugin commands, rules and read access; local core tests documented | Actual Agent Wallet approve/refuse/follow/close demonstration. Local signer tests do not establish wallet policy behavior. |
| ERC-8004 | Identity registration/readback on a documented fork; live read access | Demonstrate ownership and metadata; distinguish identity from policy enforcement and reputation. Registration alone establishes neither skill nor safe behavior. [Standard](https://eips.ethereum.org/EIPS/eip-8004). |
| x402 / Nansen | Challenge/signature path reached insufficient-funds rejection; mock labels reviewed | Successful consented payment and settlement transaction, or authenticated live labels. A snapshot of recent Smart Money trades is not a complete address-classification database. |
| Perpl | Previously documented real long/short position reads | Show a current position with timestamp and limitations. Read-only context is not an Upside Perpl trade, nor proof of total trader exposure. |
| Envio | Schema/handlers/config written | Running indexer, query evidence and consistent data used by the product. |
| Cleanverse | Attestation contract and API path written | Credential-backed real A-Pass response, expiry and attestation. Demo attestation is not identity verification. |

Choose the primary track by the final product. Social/Attention & Culture is defensible as a marketplace for accountable creators; Onchain Finance & Trading is equally plausible if the final demo focuses on execution. AI infrastructure is a secondary story unless the agent workflow becomes the actual user-facing core. Check portal restrictions before claiming multiple track entries or stacked prizes.

The public [hackathon portal](https://hackathon.monad.xyz/) displays 1 September–13 October and a $250,000+ pool but requires sign-in for more detail. [Rise In](https://www.risein.com/monad/monad-metropolis-hackathon) lists four tracks; its deadline card says 12 October while its timeline says 13 October. Exact sponsor criteria, stacking and the definitive cutoff remain unverified here. Target 12 October and confirm the portal.

### Suggested three-minute demonstration

1. Explain the signal-group problem in one sentence. Show the caller's committed winning, losing and unresolved calls.
2. Follow one long call from a fresh account through a visible review; show the resulting vault position and transaction.
3. Demonstrate controlled loss/recovery examples: −20, +10, +30; only the new +20 above the realized high-water mark earns the configured fee. Label controlled prices and demo venue.
4. Show the complete settlement receipt and withdraw available test cash.
5. Demonstrate an agent refusing a high-fee/insufficient-record call, then following an allowed call. Show identity and optional paid intelligence only if the signed integration is working.

Avoid presenting simulated prices as real market performance, fork execution as a live trade, badge context as endorsement or sponsored components as automatic bounty eligibility.

## Prioritized next work

| Order | Work | Completion evidence |
|---|---|---|
| 1 | Trade review + precise realized-fee disclosure + complete receipt | New follower understands costs; canceled review sends nothing; receipt matches contract events. |
| 2 | Fail-closed verification mode; accurate follows metric; older-position expiry lookup | Focused regression tests and UI labels. Small, concrete correctness changes. |
| 3 | Intelligence cache/budget/asset controls and durable agent spend accounting | Repeated-pass, wrong-asset, state corruption and concurrency tests; real wallet policy proof. |
| 4 | Keeper/score/exit design decision | Document the trust model and failure behavior; do not rush an unaudited emergency fund-release path. |
| 5 | Stable domain + signed Android build + real-device round trip | Passkey account continuity, signing, funding, follow, close and withdrawal on a phone. |
| 6 | Hosted smoke flow + focused sponsor evidence | Explorer transactions, service status, truthful integration matrix. |
| 7 | Original aircraft artwork and short user validation | Independently created assets; 3–5 signal buyers/creators interviewed with specific feedback. |
| 8 | Submission, video and rehearsal | Reproducible demo, repository, deployed link, integration proof and fallback recording ready by 12 October. |

Defer new markets, new chains, elaborate reputation algorithms and prediction-market features. The strongest improvement now is to make the existing promise observable and precise.
