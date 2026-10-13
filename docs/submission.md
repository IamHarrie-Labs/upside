# Upside — hackathon submission draft

## One sentence

Upside lets people follow public trading calls through their own vault and pays a caller from new realized gains above that follower's previous peak with them.

## Problem and product

Trading signals are easy to sell and difficult to evaluate. Subscribers can pay upfront while creators selectively promote winning calls. Upside commits calls before evaluation, keeps scored losses and unresolved calls visible, and connects a supported call to an actual follower position and settlement receipt.

A follower reads the record, chooses a long spot call and amount, reviews execution and fee boundaries, signs through their account, then decides when to close. Closed losses carry forward for that caller. The receipt shows principal, proceeds, relationship balance, eligible gains, caller payout and the protocol share. Calls are not edited or deleted. Scores use reference mid prices and are distinct from realized follower returns.

## Working build

Web preview: https://onlyupside.xyz (primary website; https://upside-monad.vercel.app/ remains available for existing passkey accounts)

Network: Monad testnet, 10143. Assets: test AUSD and demo base token; venue: DemoRouter; prices: keeper-generated demo prices. The hosted demonstration is a real chain execution with test assets, **not a live market trade**.

Verified hosted flow: call 11 → follower vault `0xD80a8c400e34739025d4c93B1080f732384E68BC` → follow → close → withdrawal. [Follow transaction](https://testnet.monadvision.com/tx/0xba660f9fc12533021c598dc10b49d2d743a1cb0e88394fe7618affb05b52f631), [close transaction](https://testnet.monadvision.com/tx/0x8db57557cfd52bc27bbd641714efc35e7310207b408600de3cf3a478fc648c94), [withdrawal](https://testnet.monadvision.com/tx/0x78e8f54ddd6a5c6955907cb6701dc15fa76848af759c4f73b3a633685640aec5). The result was a one-raw-unit loss, zero fee and 9.999999 test AUSD withdrawn. Full proof is in `docs/design/hosted-testnet-results.json`.

Local controlled-price UI tests verify a 50 AUSD follow returning 60, a 2 AUSD fee split into 1.8 caller / 0.2 protocol, and later loss/recovery trades with no new fee. Those amounts belong to a labelled local example, not the hosted market result. A fallback browser recording is saved in `docs/demo/round-trip-local.webm`.

## Technical work

Solidity call book, per-owner deterministic clone vaults, original-cost exposure caps, allowlisted routers, measured swap proceeds and loss-aware settlement. Web and Expo share trading helpers. A MetaMask Agent Wallet plugin supports call inspection, caller rules, follows, closes and bounded autopilot. ERC-8004 registration publishes identity/mandate; optional x402 Nansen lookups check price/asset/network, reserve a daily allowance before signing and cache recent trade snapshots. The keeper indexes activity and complete receipts, meters activity gas and posts/scorers on demand. The Envio schema/handlers are implemented but not yet proven on a hosted indexer.

## Integration evidence

| Integration | Honest current claim | Missing proof |
|---|---|---|
| Monad | Hosted testnet post/follow/close/withdraw with explorer receipts | Mainnet production readiness |
| Kuru | Execution adapter and previously documented mainnet-fork round trip | New consented live market execution and exact bounty eligibility |
| Agora / AUSD | Real AUSD route parameterization; preview uses test stand-in | Real-token mobile flow |
| Mera | Passkey derivation/signing in web/native; genuine Android certificate association published; signed Expo preview completed; custom-domain replacement completed | Android/iPhone hardware test; physical passkey and real-token mobile flow still unverified |
| MetaMask | Plugin installed in a real Agent Wallet (Guard mode). Live autopilot followed @sarah and refused @sybil_farm on testnet data; a mainnet write was held for email approval, approved and sent ([tx](https://monadvision.com/tx/0x0eff6e0564becb130933f98a453b3156d549c19b9cd016a9640a670bfe467b1e)) | Agent Wallet doesn't relay Monad testnet transactions, so live vault deposits/follows need the mainnet deployment |
| ERC-8004 | Agent #10406 registered on Monad mainnet's official IdentityRegistry from the Agent Wallet ([tx](https://monadvision.com/tx/0x0eff6e0564becb130933f98a453b3156d549c19b9cd016a9640a670bfe467b1e)); mandate decodes on read | Identity describes the mandate; it doesn't enforce it (the vault cap and wallet policy do) |
| x402 / Nansen | Live: the MetaMask Agent Wallet paid $0.05 USDC on Monad mainnet over x402 for a Nansen Smart Money lookup ([settlement tx](https://monadvision.com/tx/0xbeb69a4ceb28340b52a8a64e78c9c03bd3a0e31b8716d2a0cc19221e13f6775d)); price/network/budget guards tested | Smart Money labels for Monad are sparse (1 wallet seen) |
| Perpl | Read-only live position context | Does not execute an Upside Perpl trade |
| Envio | HyperIndex indexer running on the VPS with a public read-only GraphQL API (`https://indexer.38.49.210.22.sslip.io/v1/graphql`); full testnet history indexed and matching onchain records | Apps still read the keeper's `/flow`; switching the feed to the indexer is next |
| Cleanverse | Gate plus a `query_apass` adapter written to Cleanverse's documented API (sandbox base URL, `api-id` header, Monad chain slug, status/expiry parsing); explicit demo-only mock mode | Sandbox credentials return HTTP 403 (expired or IP not allowlisted); live CVI checks need Cleanverse to re-enable access |

## Track and judging story

Primary recommendation: Social, Attention & Culture — accountable trading creators and shared outcomes. Finance & Trading is also a plausible fit; use the portal's actual submission rules to choose. Sponsor integrations must meet their exact rules; do not add advertised bounty amounts as guaranteed winnings or imply all tracks accept the same project.

The compelling demo is the link from a public commitment to a follower's own confirmed trade and an intelligible fee receipt. Show one clean loop and one refusal rather than listing every sponsor badge.

Native dependency compatibility and remaining transitive advisories are recorded in `docs/mobile-dependency-review.md`; a passing build is not a production security audit.

## Boundaries

Fees account for realized trading PnL before performance fees and gas. Open losses are excluded until closed; earlier fees are not refunded. The closing call's rate applies to new gains above the peak. A local daily allowance can be bypassed outside that client; only the vault exposure limit is onchain. Keeper prices and administrator configuration are trusted dependencies. Stale price blocks exits and locks open base tokens. Scores use the price when scored after expiry, not a historical expiry observation. No claim of Sybil-proof reputation, guaranteed profit or production audit is made.

## Fields still requiring human/external completion

Public repository: https://github.com/IamHarrie-Labs/upside; confirm judge access, team names and contact, final track/bounty selection from the signed-in portal, physical-phone results, actual user interviews, successful funded sponsor transactions where claimed, and narrated final video. Android build: https://expo.dev/accounts/iamharrie/projects/upside/builds/4c90a59c-b38c-43ab-a1f3-4db5c58b8871. Portal cutoff and sponsor stacking rules remain to be confirmed. Rehearse and prepare submission by 12 October rather than relying on the ambiguous public deadline.
