// Accounts: a Mera passkey account (production) or, on a local chain only, Anvil's public test keys.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { createWalletClient, http, type LocalAccount, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "../env";

const CRED_KEY = "upside.passkey.credentialId";

export type Session = {
  account: LocalAccount;
  wallet: WalletClient;
  label: string;
  end: () => void;
};

function sessionFromPrf(prfOutput: Uint8Array, label: string): Session {
  // BIP-44 account 0 from the passkey's PRF output, as in the Mera guide.
  const node = HDKey.fromMasterSeed(prfOutput).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("Key derivation failed");
  const signing = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  const account = toViemAccount(signing);
  return {
    account,
    wallet: createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) }),
    label,
    end: () => signing.end(),
  };
}

export function hasPasskey(): boolean {
  try {
    return !!localStorage.getItem(CRED_KEY);
  } catch {
    return false;
  }
}

export async function createPasskeyAccount(name: string): Promise<Session> {
  const res = await createPasskeyWithPrfOutput({
    rp: { id: location.hostname, name: "Upside" },
    user: { name, displayName: name },
  });
  try {
    localStorage.setItem(CRED_KEY, res.credentialId);
  } catch {
    // storage blocked: the user can still sign in by picking the passkey
  }
  return sessionFromPrf(res.prfOutput, name);
}

export async function signInWithPasskey(chooseAnother = false): Promise<Session> {
  let credentialId: string | null = null;
  try {
    credentialId = localStorage.getItem(CRED_KEY);
  } catch {
    credentialId = null;
  }
  const res = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: credentialId && !chooseAnother ? { credentialId } : undefined,
  });
  try {
    localStorage.setItem(CRED_KEY, res.credentialId);
  } catch {
    // Discoverable sign-in remains available when storage is blocked.
  }
  return sessionFromPrf(res.prfOutput, "Passkey account");
}

export function describeError(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This passkey provider can't derive keys (PRF). On desktop Chrome, save the passkey to Google Password Manager, or use your phone.";
    if (e.code === "PASSKEY_OPERATION_FAILED") {
      const cause = e.cause as { name?: string } | undefined;
      if (cause?.name === "NotAllowedError" || cause?.name === "AbortError")
        return "Sign-in was cancelled or timed out. Try again, or choose another existing passkey.";
      return "Your device could not complete passkey sign-in. Try again in your browser, or choose another existing passkey. Your account has not changed.";
    }
    return `${e.code}: ${e.message}`;
  }
  const msg = (e as Error)?.message ?? String(e);
  const short = msg.split("\n").find((l) => l.includes("reverted") || l.includes("Error")) ?? msg.split("\n")[0];
  return short.slice(0, 220);
}

/** Anvil's well-known public test keys. Only offered when the app points at a local chain. */
export const DEV_ACCOUNTS = [
  { label: "Sarah (verified caller)", key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
  { label: "Sybil Farm (unverified)", key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
  { label: "Femi (follower)", key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
] as const;

export function devSession(i: number): Session {
  const d = DEV_ACCOUNTS[i];
  const account = privateKeyToAccount(d.key as `0x${string}`);
  return {
    account,
    wallet: createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) }),
    label: d.label,
    end: () => {},
  };
}
