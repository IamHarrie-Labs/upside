# Web and native design review

Reviewed 9 October 2026.

## Design references

The direction draws from documented app design patterns rather than copying a screen or product identity. Apple's [2025 Design Awards](https://developer.apple.com/design/awards/2025/) highlight Lumy's focused presentation and restrained palette, Denim's smooth transitions, and Speechify's reduction of cognitive load and accessibility support. Those observations informed a short native welcome, clear hierarchy and fewer competing labels. They do not establish an award or accessibility certification for Upside.

Android navigation references: [Material navigation bar](https://m3.material.io/components/navigation-bar/overview) and [Material's Android implementation guide](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md). Four destinations fit a small stable dock. Visible labels are omitted at the user's request; accessible tab names and selected states remain. Every icon is a vector outline, with a minimum 52-point target.

Implementation references: [Expo Router layouts](https://docs.expo.dev/router/basics/navigation-layouts/), [native link rewriting](https://docs.expo.dev/router/advanced/native-intent/), [SDK 57 safe areas](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/), [SDK 57 SVG](https://docs.expo.dev/versions/v57.0.0/sdk/svg/), and [React Native 0.86 keyboard events](https://reactnative.dev/docs/0.86/keyboard).

## Changes

- Landing: smaller faces in the original aircraft concept, dark forest fee story, lighter narrative text, removed redundant section labels and hero preview slogan. Six substantive sections remain. The pause button is removed; the hero entrance lasts two seconds once, and reduced-motion preferences disable decorative motion. Existing scroll-linked story and fee progression remain.
- Desktop: four ordinary text destinations under the header. No floating bottom navigation on the web. Simpler page names and address-based caller identity replace persona names, ascending chart avatars and repeated marketing slogans.
- Documentation: six topics with distinct URLs and sidebar navigation. Tokens and network, fees, vault operations and implementation limits are explained with configured contract addresses. There is no deployed UPSIDE token; MON gas and the current test settlement/base tokens are distinguished from mainnet assets.
- Footer: Documentation, Privacy and Terms each lead to distinct content. Repeated preview/test-venue labels are removed from general chrome; factual network and asset disclosures remain in trade review, proof and Docs.
- Native: separate welcome, explanation and account stages; initial welcome fits without scrolling. Safe-area handling replaces fixed platform padding. A vector icon dock replaces text tabs, while accessible names remain. The dock responds to keyboard events, and Android requests resize behavior. Expo Router navigation preserves the root signing session. Existing website share links retain their call/profile destinations.

## Brand selection

The original three choices are available at `brand/logo-options/upside-three-logos.png`: Lift, Accord and Cabin. Replacement awaits the user's selection. Cabin is retained temporarily across the website and APK rather than introducing an unselected mark.

## Verification and limits

Current browser evidence is in `ui-qa-results.json`, `landing-interaction-results.json`, `accessibility-results.json` and `native-web-qa-results.json`. Fixtures block transactions. Native-browser checks are not physical-device tests. The finished Android build record is in `android-build-results.json` (build `250f354b-80aa-4dc6-8f82-7b1f5c01fa2a`, source `6efa636`). Physical-device verification remains pending.

The independent native route checks include legacy website links, custom-scheme call links and unchanged vault paths. Web and native type checks and source lint pass; Expo Doctor passes 21/21 after adding required Router dependencies and pinning optional animation dependencies to SDK 57 versions.

Completed browser checks: 69 web page/state captures at 320, 390 and 1440 pixels; 38 native preview captures at 320, 390 and 430 pixels, including a 320×640 welcome. Separate refusal checks produced 15 web and 19 native captures. Both fixture suites report zero runtime errors and zero transaction writes. Reduced motion, keyboard skip navigation, pinned reading, fee progression and the dark fee surface passed targeted checks. The deployed website passed a read-only testnet history and receipt check after publication.

Still requiring phones: passkey create/restore, OS keyboard behavior, system font scaling, screen-reader announcements, Android back gestures, and signed native trade completion. A native iPhone build additionally requires Apple developer signing and association. Smart contract and trading limitations documented in the project review are unchanged.

Current web deployment: `dpl_BSsKBR6Dq4awLCF6AE58KaUFuiyj`, published to https://upside-monad.vercel.app/ and verified read-only after deployment.
