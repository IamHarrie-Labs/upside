# Upside brand system

## Position

Good calls. Shared upside.

Upside is a marketplace for committed trading calls and loss-aware compensation. The brand treats trading as a considered decision, not a spectacle. Its central idea is **earned upside**: evidence earns attention; cumulative results earn fees.

## Visual direction

Warm editorial finance. Comfortable spacing, public records, and precise typography. The latest direction keeps the new interface and editorial typography while incorporating the aircraft, illustrated traders, and cloud framing from the user's video reference. The reference's product name and headline are excluded from the visible artwork.

## Mark and artwork

The quotation-style mark suggests a trader's stated call. Use the copper mark next to the ink wordmark, leaving at least half a mark's width of clear space. Do not rotate, stretch, or add a gradient. It replaces the rising-path mark that the user rejected.

`app/src/Brand.tsx` contains the vector mark and address-derived glyphs. The landing uses the cropped aircraft/community footage supplied in `Agent CrewArea.mp4`, with cloud framing in SVG. The portraits are decorative, not actual Upside customers or trader endorsements. The reference artwork is not represented as newly created Upside illustration. Native onboarding uses a static cropped export of this scene.

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

Landing video is muted and plays inline. Video and cloud motion can be paused and respect the system's reduced-motion preference, including when that preference changes while the page is open. Browser navigation has named landmarks, labels, visible focus rings, statuses, errors, and recovery paths. Phone actions have generous touch targets. Native uses a static scene; native animated playback is not claimed.

## Assets and reproducibility

- Web favicon and app/PWA icons: `app/public/`.
- Expo app/adaptive icons and illustration: `mobile/assets/`.
- `scripts/qa/brand-assets.mts` exports icons from the original mark.
- `scripts/qa/ui-review.mts` exports the cropped native community scene during its desktop check.
- The browser scripts use the Codex-bundled Playwright path on this machine. Adjust that path when moving the tooling to another environment.
