# Submission functional review

10 October 2026. Production: https://upside-monad.vercel.app/

## Fix published

An existing browser credential previously restricted sign-in to that remembered passkey, with no way to select another existing credential. Sign-in now offers **Choose another existing passkey**. Successful discoverable sign-in saves the selected credential reference for subsequent visits. Cancellation and passkey-operation failures now explain how to retry instead of showing library error codes. Account derivation, the dashboard gate and ownership rules remain the same.

Published deployment: `dpl_3Pr7E4DhAsRA4skkPXMDpitpZKQj`. Production JavaScript: `index-w7pwgqWv.js`.

## Verified coverage

| Area | Evidence and outcome |
| --- | --- |
| Landing | Six sections, working section anchors, loaded artwork/font, FAQ keyboard open/close, bounded sticky reading, fee stages, proof links present, reduced motion and phone layouts passed. |
| Public resources | Documentation overview and five topics, Privacy and Terms load directly on production. Correct public chrome, no horizontal overflow, no runtime errors. |
| Dashboard gate and navigation | 31 route checks: protected direct links, preserved post-login destinations, six section URLs/active states, details, public-help return, legacy shared links, sign-out, Back after sign-out and rejected external return destinations. |
| Calls and records | Live/scored/all filters, search and empty recovery, names, caller comparison including losses, details, generated shared links, missing calls and invalid URLs passed with labelled fixtures. |
| Trade review | Read-only preparation and cancellation; expired quote, changed account and missing gas refused. Signing refusal remains visible and recoverable on desktop and phone widths. |
| Appearance | Light/dark, persistence, six dashboard destinations and text-token contrast checks passed. Full suite captured 102 views at 1440, 390 and 320 pixels with zero runtime errors or transaction writes. |
| Authentication | Local and deployed bundles exercised with simulated WebAuthn responses through real Mera account derivation: cancellation retry, PRF rejection, stale-credential recovery, credential-reference update, same account after sign-out and repeat sign-in. Zero transaction broadcasts. |
| Actual local trading | Website post, follow, close, settlement, withdrawal and scoring completed on disposable chain 31337 using public Anvil keys. 50 test AUSD returned 60, with 1.8 paid to caller and 0.2 to protocol. Later loss and partial recovery paid zero new fee. |
| Actual account controls | Website profile rename/restoration, trading-limit update, both funding-address clipboard buttons, test-token faucet and funding withdrawal matched local contract state and balances. |
| Hosted services | Production gates/resources, real testnet call and the recorded hosted settlement receipt passed after publishing. The keeper's complete history matches the explorer transaction. |
| Contracts and build | 21 contract tests passed: 18 vault/call tests and three handle tests. Web lint, TypeScript and production build passed. Existing large JavaScript chunk warning remains. |

## Evidence files

- `ui-qa-results.json`: full fixture suite and route checks.
- `review-error-web-results.json`: refused-signing and error recovery.
- `landing-interaction-results.json`: motion, anchors, FAQ and responsive behavior.
- `passkey-qa-results.json` and `hosted-passkey-qa-results.json`: simulated authentication checks, clearly labelled.
- `account-actions-results.json`: actual local-chain profile, limits and funding checks.
- `local-e2e-results.json`: actual local trading and loss recovery.
- `hosted-read-only-results.json`: final production resources, gates, call and receipt checks.
- `screens/submission-*`: this review's browser captures.

## Practical limits for submission

The tested web flows pass. A physical Android/iPhone passkey ceremony is still unverified: simulated credentials prove application handling, not authenticator compatibility or biometric prompts. The passkey provider must support WebAuthn PRF. An unsupported provider cannot derive the signing account; the interface explains this rather than allowing access without a valid account.

The hosted flow uses Monad testnet, test assets, a demo router and demo prices. Describe it as a working onchain prototype. The existing recorded testnet proof was read and checked again; this review did not spend from a real wallet or repeat hosted transactions. New successful UI transactions used only disposable local test accounts.

External explorer links use configured transaction/address URLs. Four landing proof links are present; the underlying recorded call/settlement was independently read. Availability of every third-party explorer page and optional sponsor service is not guaranteed by this audit. Physical native-app behavior, optional paid APIs and MetaMask Guard Mode are separate from the web review.

Before submission, complete one real-device sign-in and retain the demo video/source link. Existing APK and sponsor integration limitations are tracked in `docs/priority-work-status.md`. The repository has no configured Git remote, so a local commit alone does not provide judges with source access.
