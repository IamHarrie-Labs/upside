// iOS 18+ and Android 9+: platform passkeys through react-native-passkey, via Mera's adapter.
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";

export const webAuthnClient = reactNativeWebAuthnClient;
