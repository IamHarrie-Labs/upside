// Accounts: a Mera passkey account (production) or, on a local chain only, Anvil's public test keys.
// Same Session shape as the web app, so the shared upside.ts works unchanged.
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
import { chain, RP_ID } from "../env";
import { getItem, setItem } from "./storage";
import { webAuthnClient } from "./webauthn";

// Preserve the original key on its original RP. Never apply that reference to a new domain.
const CRED_KEY = RP_ID === "upside-monad.vercel.app" ? "upside.passkey.credentialId" : `upside.passkey.${RP_ID}.credentialId`;

export type Session = {
  account: LocalAccount;
  wallet: WalletClient;
  label: string;
  end: () => void;
};

function sessionFromPrf(prfOutput: Uint8Array, label: string): Session {
  // BIP-44 account 0 from the passkey's PRF output, as in the Mera guide. Same derivation as the web app,
  // so one passkey gives the same Monad account on the website and in the app.
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

export async function hasPasskey(): Promise<boolean> {
  return !!(await getItem(CRED_KEY));
}

function requireRp() {
  if (!RP_ID) throw new Error("Passkeys need EXPO_PUBLIC_RP_ID set to your domain (see mobile/README.md).");
}

export async function createPasskeyAccount(name: string): Promise<Session> {
  requireRp();
  const res = await createPasskeyWithPrfOutput({
    rp: { id: RP_ID, name: "Upside" },
    user: { name, displayName: name },
    webAuthnClient,
  });
  await setItem(CRED_KEY, res.credentialId);
  return sessionFromPrf(res.prfOutput, name);
}

export async function signInWithPasskey(chooseAnother = false): Promise<Session> {
  requireRp();
  const credentialId = await getItem(CRED_KEY);
  const res = await getPasskeyPrfOutput({
    rpId: RP_ID,
    credential: credentialId && !chooseAnother ? { credentialId } : undefined,
    webAuthnClient,
  });
  await setItem(CRED_KEY, res.credentialId);
  return sessionFromPrf(res.prfOutput, "Passkey account");
}

export function describeError(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This passkey provider can't derive keys (PRF). Use iCloud Keychain, Google Password Manager or 1Password.";
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
