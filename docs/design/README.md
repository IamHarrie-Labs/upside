# Upside design and product review

Reviewed 8 October 2026.

The current direction combines the aircraft, illustrated traders and clouds with a locally bundled Space Grotesk type system and a rounded U monogram. Landing, account creation, calls, author profiles, call details, creation, vaults, rankings, help, privacy, terms and error states share the paper/ink/copper system.

## What changed

- Five main landing sections explain the product, the following process, fees, vault controls and common questions. Repeated signup prompts and decorative directional arrows were removed.
- Copy uses plain terms and concrete behavior. Field-note slogans, repeated taglines and abstract onboarding language were cut.
- The how-it-works heading stays pinned beside all three steps on larger screens and releases at the section boundary. Phone layouts keep it in normal flow.
- Receipt and exposure details animate once when visible. Reading copy stays visible; FAQ disclosures work from the keyboard.
- The reference's aircraft/community scene is incorporated into the new layout. Portraits are decorative. The cropped scene excludes the reference's name and headline; video and clouds have pause and reduced-motion handling.
- A concrete product story and a labelled fee example explain cumulative loss recovery.
- Calls have filters, search, status labels, and address-derived identity marks.
- Loading, connection failures, stale prices, empty records, and invalid links have explicit states.
- Leaderboard rows link to full author records. Both positive and negative outcomes remain visible.
- Account creation no longer promises an onchain handle that may silently fail to save. Handle editing belongs in the funded account's vault.
- Existing-passkey sign-in is available even when the browser has no saved local credential ID.
- Switching accounts clears the previous vault state and reloads the record; outdated refreshes cannot overwrite the new session's snapshot.
- Exposure editing is inline, with numeric validation. Withdrawal uses the existing contract helper and prevents amounts above available cash.
- Target and stop levels are explicitly described as informational. Pre-close amounts are labelled estimates.
- The guide explains signal scores versus realized PnL, fees, gas, verification, account access, and preview boundaries.
- The native theme, icons, illustration, form validation, exposure and withdrawal controls, and network states are aligned with the web.

## Page-by-page assessment

| Page or state | Assessment and evidence |
|---|---|
| Landing | New editorial layout, aircraft/community scene and cloud framing, specific value proposition, explanation and fee example. Desktop/phone screenshots; both account and browse paths tested. |
| Account creation / sign-in | Consistent brand; accessible name field and processing/error states. Local account navigation tested. Physical passkey authentication is a separate check. |
| Calls | Filters, search, identity, fees, thesis, status, and score are grouped consistently. Fixture data includes live, scored, winning and losing calls. |
| Call detail | Supported call IDs show the record; unsupported IDs have an explicit empty record. Accessible return navigation. |
| Author profile | Address, verification, score, hit rate, history and sharing. The avatar is derived from the address and is not represented as a real person. |
| Create call | Fee, stop and target validation. Disabled submission for stale prices. Informational stop/target explanation. |
| Vault onboarding | Positive exposure limit required. Clear custody and limit explanation. Tested with no existing vault. |
| Funded vault | Available cash, original-cost exposure, open/closed positions, estimates, relationship accounting and public handle are grouped. |
| Exposure editing | Inline editor; a limit below open exposure is blocked by the interface. |
| Funding / withdrawal | Correct vault address, amount validation, available-balance guard and existing withdrawal helper. A real UI withdrawal of 5 test AUSD was confirmed on the local chain. Hosted funding remains a release check. |
| Record / leaderboard | Ranked and unranked authors, readable outcome signs, and clickable profiles. Formula is documented in the guide. |
| Guide / privacy / preview terms | Working pages with readable measure, consistent hierarchy and return links. Preview terms are descriptive; they are not claimed to be production legal documents. |
| Loading / empty / stale / error / missing page | Dedicated feedback and recovery controls; no false empty feed on an RPC failure. |
| Expo screens | Shared brand tokens and consistent major controls. Expo-web checks supplement TypeScript; physical Android/iOS remains separate. |

## Verification evidence

- `ui-qa-results.json`: 51 fixture-based browser routes and screen states at 1440, 390 and 320 pixels, with no runtime errors, horizontal overflow, or transaction writes.
- `native-web-qa-results.json`: 20 Expo-web screen states at 390 and 768 pixels, with no runtime errors, horizontal overflow, or transaction writes. This is not physical-phone evidence.
- `screens/`: screenshots for each reviewed route and state.
- `contrast-results.json`: all 18 shared foreground/surface combinations meet the 4.5:1 text contrast threshold.
- `landing-interaction-results.json`: five main sections, actual Grotesk font loading, no decorative arrows, sticky heading/release, third-step progression, keyboard FAQ, motion pause, reduced motion and responsive behavior at 320/390/768/1024/1440 pixels.
- `accessibility-results.json`: keyboard skip navigation, named buttons, animation pause, and reduced-motion behavior. This is a targeted check, not full accessibility certification.
- `local-e2e-results.json`: real transactions on Anvil chain 31337 through the browser UI: post, follow 50 test AUSD, close for 60, settle a 2 AUSD performance fee (1.8 to caller; 0.2 protocol share), withdraw 5, and score the call. Separate losing and partial-recovery rounds paid no new caller fee.
- Production web build, web lint, native TypeScript and native-source lint.
- Existing Foundry suite: 18 passed, 0 failed. Includes exposure, ownership, loss recovery, stale price, unverified fees and locked-token behavior.

The fixture suites deliberately block transaction writes. The separate local end-to-end suite broadcasts only to Anvil using public development keys and test tokens; no real funds were used. Prices were controlled to exercise settlement and loss recovery. Fixture screenshots are named by route/state and are refreshed for the current UI; screenshots prefixed `local-` show the transaction checks from revision `31dfc8f`, whose contract logic is unchanged. Neither suite establishes hosted RPC reliability or real-device authentication.

## Remaining release gates

1. Verify the full hosted trading round trip after deploying the redesign.
2. Confirm the production domain and phone passkey association files; current placeholders must be replaced for a signed native build.
3. Exercise Android/iOS passkeys and transactions on physical devices.
4. Confirm real verification and paid intelligence credentials before presenting those services as active integrations.
5. Obtain an independent contract/security review before handling real customer funds.

The preview still has a sizeable wallet/chain JavaScript bundle. The build reports this warning; a production release should assess lazy loading and mobile network performance. No usage metrics, user testing, or production-readiness certification are inferred from this design review.
