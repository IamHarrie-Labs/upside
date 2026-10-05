// Web: localStorage. The native build uses storage.native.ts (SecureStore).
export async function getItem(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the passkey can still be picked at sign-in
  }
}
