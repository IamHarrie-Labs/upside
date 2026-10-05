// iOS and Android: the passkey credential ID is kept in the device keychain / keystore.
import * as SecureStore from "expo-secure-store";

export function getItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export function setItem(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value);
}
