# Cabin artwork and landing motion review

Reviewed 9 October 2026. This is a design review and artwork comparison, not a deployed redesign.

## Why the faces changed

Commit `6e55ae8` replaced the reference-video scene with an independently generated cabin illustration. The intended purpose was an original Upside identity. The replacement retained aircraft, traders and clouds, but changed the portrait language more than the user wanted. The earlier scene's compact, expressive faces should have been treated as a preference to preserve, rather than replaced automatically with detailed portraits. Earlier reference assets remain in the repository for comparison.

## Artwork assessment

The old treatment uses compact, bold outlines, varied silhouettes and mostly head-and-shoulder portraits. It has a stronger sense of a crew and reads better when small. The current treatment is calmer and more editorial, with trading devices and activities visible, but has more texture and less immediate facial character.

The current aircraft is cropped so its front is not explicit. The wing alone is an unreliable orientation cue in this composition. Passenger torsos, seat backs, tray devices and wing sweep should nevertheless tell one coherent story. The corrected preview uses left as the aircraft's forward direction, seat backs to the passengers' right, and devices in front toward the left. Mirroring the entire image would not correct a relative mismatch.

Recommended final direction: preserve the current layout, Grotesk, Cabin mark and restrained palette; recover the older scene's compact portrait scale and expressive silhouettes with original characters. Correct the seating geometry in either treatment. The orientation preview is retained separately so the existing live artwork is not overwritten before comparison.

## Motion already present

The landing has a pinned how-it-works heading on desktop, step indicators tied to the reading position, a once-only receipt stamp, a once-only exposure fill and FAQ disclosure movement. The cabin itself uses a gentle repeating CSS transform; the people are not independently animated. The page provides a pause control and reduced-motion handling. Mobile uses ordinary document flow for the explanatory heading.

## Three additions worth prototyping

1. **Cloud depth at the hero boundary.** Move a separate foreground cloud layer slightly faster than the aircraft as the hero leaves the screen. Keep movement within roughly 16–24 CSS pixels. Do not move text. Separate layers are required; the flattened illustration cannot provide independent character or cloud motion.
2. **An illustrative trading receipt that develops as you read.** Keep the existing fee explanation visible while its receipt progresses through a loss, partial recovery and a gain beyond the prior peak. For example, −20, then +10, then +20 leaves 10 AUSD above the previous peak, before fee and gas. A clearly disclosed 20% fee on that incremental 10 is 2 AUSD. Reveal the actual arithmetic rather than animate fabricated live balances. On phones, use vertically stacked stages with no scroll trapping.
3. **A restrained section entrance.** Give decorative cards a 10–12 pixel settling movement and a short opacity transition when first visible. Keep headings, explanations and controls readable from initial render, including if JavaScript fails. Avoid line-by-line text effects, cursor followers or long pinned scenes.

Keep native scrolling. All added movement must stop with the existing pause control and become a static final state under reduced motion. Test keyboard focus, mobile overflow, browser back navigation and visibility after resuming motion. Add only effects that clarify the product or composition.

## Product improvements with more value than extra animation

- Add one honest landing proof section connecting an actual committed call, its vault execution and its final settlement receipt. Use the existing testnet proof and label the demo venue and test tokens. Link to its public explorer evidence; do not suggest independent customer adoption.
- Prototype a compact two-caller comparison: include losses, unresolved calls, fees and the observation period. Distinguish signal-price scoring from follower returns. Do not present a single score as proof of reliable profitability.
- Finish signed Android and iPhone Safari authentication, restore and transaction checks before expanding onboarding features. APK compilation does not establish PRF support or account continuity on a device.
- Measure whether prospective users can explain when a fee is charged after seeing the page. Interview results remain pending; no preference or conversion findings are assumed.

The product is a substantial testnet prototype. Real-device validation, genuine sponsor-specific execution evidence and independent review remain more consequential than adding additional decorative sections. The next visual pass should preserve the approved layout and improve cabin coherence, character expression and the explanation of settlement.
