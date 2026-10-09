# Upside trading workspace

9 October 2026

The website uses a persistent desktop workspace with six destinations: Calls, Create, Vault, Record, Profile and Funding. Calls is the trading entry point; profile changes and deposits have their own destinations rather than competing with the feed. On narrower browser screens the navigation becomes a horizontal, scrollable row. The native application's navigation remains separate.

## Information hierarchy

The header contains the current market reference, appearance control and account menu. Four overview metrics show available vault cash, original-cost exposure, live calls and open follows. These are derived from chain reads, not sample charts or invented portfolio returns.

Call cards emphasize the market, direction, public name, entry, target and stop. Live calls appear before older records. Verification status remains visible. Historical scores and external context expand under “Record & context.” The target and stop are informational; neither triggers an automatic exit.

Public Handles names are primary identity labels throughout the workspace. An account without a public name receives a neutral Trader label, with its actual address retained for inspection. Profile allows an onchain name change, subject to uniqueness and gas. Previous calls and scores cannot be edited or deleted.

Clicking the account opens a menu. Edit profile, funding and sign-out are separate actions. Escape and outside clicks close the menu. Funding clearly separates the signing account's native MON gas from the vault's AUSD trading funds. The current deployment's test-asset status remains visible at funding and transaction review, without a numeric-chain/demo banner on sign-in.

## Appearance

Light, Ivory, Dark and Forest each define background, panel, foreground, muted text, positive, negative and warning colors. The preference is stored on this browser. Space Grotesk remains the shared typeface. The landing page keeps its existing palette.

The automated palette check measures six text tokens against all three workspace surfaces. This verifies those combinations against the 4.5:1 normal-text threshold; it is not a certification of every rendered component or disabled state. Browser review also checks responsive overflow, trade review, forms and selected navigation.

## Design references

[Coinbase Advanced's dashboard documentation](https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/dashboard-overview) separates market information, execution and history and describes persistent workspace preferences. [Coinbase Prime's blotter](https://help.coinbase.com/en/prime/trading-and-funding/blotter) provides another primary reference for trading workspaces. These informed the structure, rather than a copied visual layout.

Upside's workflow differs from an exchange: users evaluate committed calls and choose whom to follow. An orderbook-shaped interface would suggest functionality that this product does not provide. The design therefore prioritizes caller identity, actionable calls, risk limits and execution review.

## Verification and boundaries

`scripts/qa/ui-review.mts` exercises all six destinations in all four themes at desktop and phone-browser widths, with further checks at 320px. It covers account-menu dismissal, public-name validation, funding overdraft rejection, call filters, comparison history, documentation, loading/error states, transaction review and appearance persistence. RPC values are fixtures and transaction writes are blocked. Screenshot records and results are stored alongside this note.

Production verification uses the hosted testnet record and keeper in read-only mode. Physical passkey authentication and real transaction confirmation require device testing and are separate from browser-layout validation. No contract, native signing or deployment-address changes are part of this redesign.
