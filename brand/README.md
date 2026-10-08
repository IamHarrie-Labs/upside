# Upside brand system

## Position

Good calls. Shared upside.

Upside is a marketplace for committed trading calls and loss-aware compensation. The brand treats trading as a considered decision, not a spectacle. Its central idea is **earned upside**: evidence earns attention; cumulative results earn fees.

## Visual direction

Warm editorial finance. Comfortable spacing, public records, and precise typography. The latest direction keeps the new interface and editorial typography while incorporating the aircraft, illustrated traders, and cloud framing from the user's video reference. The reference's product name and headline are excluded from the visible artwork.

## Mark and artwork

The rounded U monogram accompanies the Space Grotesk wordmark. Use both in ink, leaving at least half a mark's width of clear space. The standalone mark works for app icons. Do not rotate, stretch, or add a gradient.

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
| Copper | #a44927 | Links, step markers and exposure indicators |
| Positive | #356348 | Positive results |
| Negative | #a13b32 | Losses and errors |
| Caution | #82581b | Availability and operational notices |

Colours never carry a result alone: amounts use signs and states have text. The palette is deliberately restrained. Avoid purple, glass-heavy surfaces, neon charts, photographs pretending to be customers, and decorative financial figures.

## Typography and layout

- Space Grotesk throughout web and native. The web bundles the variable WOFF2, preloaded locally; Expo bundles Regular, Medium and Bold TTFs with `expo-font`.
- Web display weights are 400–500; interface emphasis uses 500–600. No serif or faux italic display face.
- Native selects the corresponding bundled static face; text inputs use Regular. Tabular numerals remain enabled for web amounts.
- The web workspace is limited to 1200px; native remains a readable phone column on wider screens.
- Call cards use a responsive two-column grid. Forms stay in a narrower single column.
- Primary actions use ink with paper text. Copper is an accent, not the primary-action fill.
- All pages use the same tokens, surfaces, radii, navigation labels, and concise language.
- Landing has five main sections: introduction/aircraft, following steps, fees, vault controls, and common questions. Signup and browse actions are confined to the header and introduction.

## Voice

Direct, specific, calm. Say what happens, what it costs, and what the user controls. Do not claim guaranteed profit, unmanipulable reputation, automatic stop-loss protection, unique-human verification, or completed integrations without evidence.

## Motion and accessibility

Landing video is muted and plays inline. The how-it-works heading stays pinned beside the three steps on larger screens, then releases at the section boundary. Phone layouts use normal document flow so the heading cannot obscure the steps. Receipt and exposure animations are decorative; reading text is always visible. Video, clouds and decorative motion pause together and respect reduced-motion preferences. Questions expand with native keyboard-accessible disclosure controls. Native uses a static aircraft scene.

## Assets and reproducibility

- Web favicon and app/PWA icons: `app/public/`.
- Expo app/adaptive icons and illustration: `mobile/assets/`.
- `scripts/qa/brand-assets.mts` exports icons from the original mark.
- `scripts/qa/ui-review.mts` exports the cropped native community scene during its desktop check.
- Font source: [official Space Grotesk project](https://github.com/floriankarsten/space-grotesk). The SIL Open Font License is included with both sets of font files.
- The browser scripts use the Codex-bundled Playwright path on this machine. Adjust that path when moving the tooling to another environment.
