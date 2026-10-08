# Interface verification

Run from the repository root. The scripts use Node 24 type stripping, viem from the web dependencies, and Playwright. Their current Playwright module and Edge executable paths are specific to this Windows review workstation; adjust those paths for another machine. They do not install a browser or runtime automatically.

Start the Vite preview on port 5173 and Expo web on port 8081 with the local-chain deployment selected. Then:

```powershell
node scripts/qa/ui-review.mts
node scripts/qa/native-review.mts
node scripts/qa/accessibility.mts
node scripts/qa/landing-interactions.mts
node scripts/qa/contrast.cjs
```

The UI suites intercept chain and keeper reads with labelled fixtures and reject transaction writes. They cover routes, phone layouts, errors, empties, stale prices, validation, and recovery. Results and screenshots are saved in `docs/design/`. Expo web exercises React Native rendering in a browser, not native device authentication.

The landing interaction suite verifies actual Space Grotesk loading, five main sections, removal of decorative arrows, sticky heading bounds, third-step progression, FAQ keyboard controls and motion preferences. Its screenshots show the pinned reading state in addition to normal page layouts.

The local end-to-end scripts require a **fresh** Anvil chain on port 8547 and the demo deployment from `scripts/setup-local.sh`. They use public Anvil keys, explicitly require chain 31337, and broadcast local transactions:

```powershell
node scripts/qa/local-e2e.mts
node scripts/qa/local-loss-recovery.mts
```

Run them in that order. They deliberately control demo prices, balances and time to check profitable settlement, withdrawal, scoring, a loss, and partial recovery. Their balance assertions are designed for a fresh setup rather than repeated execution on an already modified chain. They are not mainnet trading tests.

`node scripts/sync-brand.mjs` regenerates the web/native theme from `brand/tokens.json`. `brand-assets.mts` exports the current mark into app icons. The web review also exports the cropped aircraft/community scene for native onboarding.

Hosted trading, signed APKs, physical-phone passkeys, production credentials, and independent contract review are tracked separately in the design review.
