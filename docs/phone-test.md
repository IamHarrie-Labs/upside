# Android and iPhone test sheet

Stable passkey relying-party domain: `upside-monad.vercel.app`. Keep this domain for existing credentials; moving an account to a new relying party is not automatic.

Web: https://upside-monad.vercel.app/

Keeper: https://keeper.38.49.210.22.sslip.io

Native Android: Expo `preview` profile selects chain 10143, the same domain and keeper. The profile produces a signed APK after Expo project setup and signing credentials. Expo Go cannot validate the native passkey module.

Expo sign-in completed on 8 October. Project: [@iamharrie/upside](https://expo.dev/accounts/iamharrie/projects/upside), ID `285477d2-32f0-4c89-893c-a1f25288b4bd`, saved in `mobile/app.config.ts`. Signing and build evidence will be recorded separately below.

## Build and association

1. Complete the browser login started by `npx eas-cli login --browser`.
2. In `mobile`, run `npx eas-cli init` and keep its actual project ID in app configuration.
3. Run `npx eas-cli build --platform android --profile preview`. Use its real signing certificate SHA-256 in the website's `/.well-known/assetlinks.json`. Publish that association and verify it before calling native passkeys complete. Never use a fabricated fingerprint.
4. Install the signed APK and record build URL, certificate fingerprint, Android version, browser/passkey provider and test transactions below.

iPhone can first use Safari on the stable web domain. Native iOS distribution additionally needs an Apple developer team, a signed build and a real team ID in the Apple association file. Android APK signing does not establish iPhone native signing. A different/synced passkey provider can behave differently; verify the same address rather than assuming continuity.

## Real device acceptance

| Check | Android signed APK | iPhone Safari |
|---|---|---|
| Create supported PRF passkey and display account address | Pending | Pending |
| Sign out, restore original passkey; address matches | Pending | Pending |
| Explain MON goes to account, test AUSD goes to vault | Pending | Pending |
| Fund test MON, wait for network propagation | Pending | Pending |
| Open trade review; cancel sends zero writes | Pending | Pending |
| Follow, inspect the confirmed position | Pending | Pending |
| Close, read exact settlement receipt, open explorer | Pending | Pending |
| Withdraw available test AUSD to the account | Pending | Pending |
| Provider refusal, cancellation, stale price and retry | Pending | Pending |
| Large text, keyboard, back navigation, safe areas | Pending | Pending |

Save screenshots and public explorer links. Do not record recovery secrets or passkey material. Native-web fixture screenshots and desktop browser tests are separate evidence, not completed rows in this table.
