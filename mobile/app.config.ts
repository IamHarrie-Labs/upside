import type { ExpoConfig } from "expo/config";

// The passkey domain (relying party). The same domain hosts the web app and the association files that let this app
// use its passkeys: /.well-known/apple-app-site-association and /.well-known/assetlinks.json (see mobile/README.md).
const RP_ID = process.env.EXPO_PUBLIC_RP_ID ?? "upside-monad.vercel.app";

const config: ExpoConfig = {
  name: "Upside",
  slug: "upside",
  owner: "iamharrie",
  extra: { eas: { projectId: "285477d2-32f0-4c89-893c-a1f25288b4bd" } },
  scheme: "upside",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#f4eee5",
  ios: {
    bundleIdentifier: "xyz.upside.app",
    supportsTablet: false,
    associatedDomains: [`webcredentials:${RP_ID}`, `applinks:${RP_ID}`],
  },
  android: {
    package: "xyz.upside.app",
    adaptiveIcon: {
      backgroundColor: "#f4eee5",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: RP_ID }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png", bundler: "metro" },
  plugins: [
    "expo-secure-store",
    ["expo-font", { fonts: ["./assets/fonts/SpaceGrotesk-Regular.ttf", "./assets/fonts/SpaceGrotesk-Medium.ttf", "./assets/fonts/SpaceGrotesk-Bold.ttf"] }],
    [
      "expo-build-properties",
      {
        // Passkeys with the PRF extension: Android 9+ (API 28), iOS 18+ (Mera's supported platforms).
        android: { minSdkVersion: 28 },
        ios: { deploymentTarget: "18.0" },
      },
    ],
  ],
};

export default config;
