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

The landing interaction suite verifies actual Space Grotesk loading, six main sections, removal of decorative arrows, sticky heading bounds, third-step progression, fee arithmetic at all three reading stages, four proof links, FAQ keyboard controls and motion preferences. Its screenshots show the pinned reading state in addition to normal page layouts. The web fixture suite checks caller comparison, including scored losses and switching the selected caller.

The local end-to-end scripts require a **fresh** Anvil chain on port 8547 and the demo deployment from `scripts/setup-local.sh`. They use public Anvil keys, explicitly require chain 31337, and broadcast local transactions:

```powershell
node scripts/qa/local-e2e.mts
node scripts/qa/local-loss-recovery.mts
```

Run them in that order. They deliberately control demo prices, balances and time to check profitable settlement, withdrawal, scoring, a loss, and partial recovery. Their balance assertions are designed for a fresh setup rather than repeated execution on an already modified chain. They are not mainnet trading tests.

`node scripts/sync-brand.mjs` regenerates the web/native theme from `brand/tokens.json`. `brand-assets.mts` exports the current mark into app icons. The original generated cabin scene is shared by web and native; QA screenshots do not overwrite it.

Hosted testnet proof is in docs/design/hosted-testnet-results.json. Signed APKs, physical-phone passkeys, sponsor credentials and independent contract review remain separately tracked in docs/priority-work-status.md.

`node scripts/qa/security-regressions.mts` checks agent reservations, x402 offers, caches and verification policy without making payments. `node scripts/qa/hosted-read-only.mts` checks the live website and the recorded testnet settlement without sending transactions. Run the latter after publishing. The receipt-index check uses a disposable local chain, requires the local transaction scenarios first, and deliberately ages blocks to verify bounded backfill resumption. Artwork prompt provenance is in `app/public/art/README.md`.
