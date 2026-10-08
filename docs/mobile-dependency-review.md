# Mobile dependency check — 8 October 2026

The first signed Android build completed. Its cloud Expo Doctor check passed 20/21 checks because `expo` 57.0.26 and `expo-linking` 57.0.11 were one patch behind the current SDK requirements. The project now uses 57.0.27 and 57.0.12; local Expo Doctor passes 21/21, and TypeScript passes. A replacement signed preview will use this corrected lockfile.

`npm audit` reports 22 affected dependency entries (15 high, seven moderate), propagated from three advisory roots. Updating compatible transitive versions did not resolve them. These entries overlap; they are not 22 independent findings in application code.

| Root | Installed path / observed use | Current boundary |
|---|---|---|
| `braces` 3.0.3 | Expo → Metro file map → micromatch | Stack-exhaustion advisory; no patched release listed. Build tooling processes repository patterns. Keep build inputs trusted and do not expose Metro publicly. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). |
| `node-forge` 1.4.0 | Expo CLI and code-signing certificate utilities | RSA signature-verification advisory; no patched release listed. No OTA update service or application RSA verifier was added. This does not establish absence of all exploitable paths. [Advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv). |
| `uuid` 7.0.3 | Expo config plugins → xcode | Advisory concerns v3/v5/v6 external output buffers. Installed xcode generates IDs with `uuid.v4()`, which the advisory distinguishes from affected methods. A major override requires separate compatibility testing before native iOS release. [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). |

The suggested `npm audit fix --force` would downgrade Expo to 44 and React Native to 0.72. That would replace the SDK rather than establish a compatible fix. No forced downgrade or invented security exemption was applied. This remains a test-token preview; dependency reachability review, upstream fixes and independent contract/security review remain production release work. Expo Doctor success is a compatibility check, not a security audit.
