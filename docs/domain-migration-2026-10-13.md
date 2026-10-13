# Custom-domain handoff

Primary website: https://onlyupside.xyz/

Original accounts: https://upside-monad.vercel.app/signin

Both hosts serve the same production app without an automatic cross-domain redirect. `www.onlyupside.xyz` redirects to the apex with HTTP 307. The sign-in page links existing users to the original host and preserves their requested dashboard destination. It explains that a new passkey creates a separate account; no funds, positions or names are migrated. The original hostname-based account derivation remains unchanged.

The existing Android APK continues to use the original domain. Replacement build `4c90a59c-b38c-43ab-a1f3-4db5c58b8871` uses onlyupside.xyz, version 0.1.1, the slimmer logo, domain-scoped credential references and a link to the old web account. It retains the remote signing identity. Build page: https://expo.dev/accounts/iamharrie/projects/upside/builds/4c90a59c-b38c-43ab-a1f3-4db5c58b8871. Build finished. Download: https://expo.dev/artifacts/eas/iAQs6TYQNS023RhtCFu97wbGSmXsYB10jNZF0pBSqOs.apk. The original-domain APK remains a fallback in the phone test sheet.

Android association files are served directly as JSON on both hosts with the verified signing fingerprint. The Apple association file remains empty because no native Apple signing identity is configured. iPhone Safari is a separate web test, not a native iOS release.

The VPS keeper now accepts the exact browser origins https://onlyupside.xyz and https://upside-monad.vercel.app, reflects the selected allowed origin, sets Vary: Origin and supports GET/POST/OPTIONS preflight. Other browser origins receive HTTP 403. Clients without an Origin header remain usable. Existing secret configuration and persistent receipt/spending data were retained. The prior remote proxy source is backed up as `/opt/upside/keeper/src/proxy.ts.before-domain`.

Verified evidence: `design/domain-migration-results.json`, `design/hosted-read-only-results.json` and `design/hosted-passkey-qa-results.json`. Real hosting, association delivery, dual-origin data requests, legacy/new account links, direct dashboard gating, hosted settlement history and simulated authentication passed. Physical passkey ceremonies are still pending. Web lint/build and mobile TypeScript/config evaluation passed.

If a browser cached the former HTTP 308 redirect from onlyupside.xyz to Vercel, use a fresh browser session or clear that site's cached redirect. Server responses now serve the custom domain directly.

After creating accounts on either domain, keep that domain accessible. Rollback must preserve both account routes; redirecting all old users to the new host would break their passkey access. Use the public custom domain for submission, social links and new recordings.
