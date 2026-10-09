# Android and iPhone test sheet

Stable passkey relying-party domain: `upside-monad.vercel.app`. Keep this domain for existing credentials; moving an account to a new relying party is not automatic.

Web: https://upside-monad.vercel.app/

Keeper: https://keeper.38.49.210.22.sslip.io

Native Android: Expo `preview` profile selects chain 10143, the same domain and keeper. The signed APK is ready to install. Expo Go cannot validate the native passkey module.

Expo sign-in completed on 8 October. Project: [@iamharrie/upside](https://expo.dev/accounts/iamharrie/projects/upside), ID `285477d2-32f0-4c89-893c-a1f25288b4bd`, saved in `mobile/app.config.ts`. Signing and build evidence will be recorded separately below.

Latest Android preview finished on 9 October: [build c79c69d4-55f3-49b7-8169-b3b193441317](https://expo.dev/accounts/iamharrie/projects/upside/builds/c79c69d4-55f3-49b7-8169-b3b193441317), source commit `3775b60`. [Download the signed APK](https://expo.dev/artifacts/eas/Le-30EFCZluTSy2Fux4VWwALeS4rKDxCNv-X9Gf8YKI.apk). Native compilation completed. This adds the approved expressive cabin artwork to onboarding and retains the confirmation-error fix from the previous build. Cloud compatibility results are recorded in `docs/design/android-build-results.json`.

Expo reused the remote Android keystore; no private signing material was downloaded. Its public SHA-256 certificate fingerprint is `15:93:64:40:B0:3F:F6:F2:AA:F2:83:91:E5:DD:F5:B3:EC:0E:5B:96:DF:BC:BB:F5:AF:CC:00:78:F8:0B:2C:1B`, recorded from `eas credentials --platform android` and configured in `assetlinks.json`. Build completion and physical authentication remain separate checks.

## Build and association (configured)

Expo login, project initialization, remote signing and HTTPS association are complete. For future source changes, rebuild from `mobile` with `npx eas-cli build --platform android --profile preview`; preserve the signing identity and relying-party domain.

Install the final APK above and record Android version, browser/passkey provider and test transactions below. Create a supported passkey, note the public account address, sign out and restore the same passkey before funding. Send Monad testnet MON to that account address for gas, then verify it appears. The demo faucet supplies test AUSD to the vault through the reviewed flow.

iPhone can first use Safari on the stable web domain. Native iOS distribution additionally needs an Apple developer team, a signed build and a real team ID in the Apple association file. Android APK signing does not establish iPhone native signing. A different/synced passkey provider can behave differently; verify the same address rather than assuming continuity.

The Apple association file deliberately lists no native apps until a genuine Apple signing identity is available. It does not claim an unregistered team ID. Both association files are served as JSON over HTTPS.

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
