# Upside brand system

## Position

Good calls. Shared upside.

Upside is a marketplace for committed trading calls and loss-aware compensation. The brand treats trading as a considered decision, not a spectacle. Its central idea is **earned upside**: evidence earns attention; cumulative results earn fees.

## Visual direction

Warm editorial finance. Comfortable spacing, public records, precise typography, and original line illustrations. The warm illustrated feel of the user's reference is retained; its characters, clouds, aircraft, footage, logo, and composition are not used in the current product.

## Mark and artwork

The mark traces a rising path with a deliberate setback and an open upward arrow. It works at small sizes without a wordmark. Use the copper mark next to the ink wordmark, leaving at least half a mark's width of clear space. Do not rotate, stretch, or add a gradient.

`app/src/Brand.tsx` contains the original vector mark, address-derived glyphs, and three-record illustration. The illustration connects a committed call, a user-controlled vault, and a settlement receipt. It conveys process, not a promised investment result. The moving copper dot and gently drifting records express progress without implying constant market gains.

## Tokens

The source of truth is `brand/tokens.json`. Run `node scripts/sync-brand.mjs` after changing it to regenerate `app/src/brand.css` and `mobile/src/theme.ts`.

| Role | Colour | Use |
|---|---|---|
| Paper | #f4eee5 | Page background |
| Light paper | #fffaf3 | Cards, buttons on ink |
| Fold | #ebe2d5 | Grouped data and inset regions |
| Ink | #242820 | Headlines, primary text and actions |
| Muted ink | #626558 | Supporting text |
| Copper | #a44927 | Brand, links and the motion path |
| Positive | #356348 | Positive results |
| Negative | #a13b32 | Losses and errors |
| Caution | #82581b | Availability and operational notices |

Colours never carry a result alone: amounts use signs and states have text. The palette is deliberately restrained. Avoid purple, glass-heavy surfaces, neon charts, photographs pretending to be customers, and decorative financial figures.

## Typography and layout

- Arial/Helvetica/system sans for the web interface. Native uses platform system sans.
- Georgia italic for the editorial counterpoint on the landing page; do not use it for financial data.
- System monospace for record IDs and brief section markers. Tabular numerals for amounts.
- The web workspace is limited to 1200px; native remains a readable phone column on wider screens.
- Call cards use a responsive two-column grid. Forms stay in a narrower single column.
- Primary actions use ink with paper text. Copper is an accent, not the primary-action fill.
- All pages use the same tokens, surfaces, radii, navigation labels, and concise language.

## Voice

Direct, specific, calm. Say what happens, what it costs, and what the user controls. Do not claim guaranteed profit, unmanipulable reputation, automatic stop-loss protection, unique-human verification, or completed integrations without evidence.

## Motion and accessibility

Landing motion can be paused and respects the system's reduced-motion preference. No autoplay video or audio remains. Browser navigation has named landmarks, labels, visible focus rings, statuses, errors, and recovery paths. Phone actions have generous touch targets. Native uses a static export of the original illustration; native animated playback is not claimed.

## Assets and reproducibility

- Web favicon and app/PWA icons: `app/public/`.
- Expo app/adaptive icons and illustration: `mobile/assets/`.
- `scripts/qa/brand-assets.mts` exports icons from the original mark.
- `scripts/qa/ui-review.mts` exports the static illustration during its desktop check.
- The browser scripts use the Codex-bundled Playwright path on this machine. Adjust that path when moving the tooling to another environment.
