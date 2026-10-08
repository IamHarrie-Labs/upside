// Verify a caller and record it onchain in AttestedGate.
//
//   CLEANVERSE_MODE=api   query the caller's A-Pass through the Cleanverse API v3 (needs credentials from
//                          Cleanverse / Monad Foundation) and attest only if it is active and unexpired.
//   CLEANVERSE_MODE=mock  attest directly (local demos only; the README says so).
//
// Usage: KEEPER_KEY=0x... npm run attest -- 0xCallerAddress [days]
import { keccak256, toHex, type Address } from "viem";
import { AttestedGateAbi } from "./abi.js";
import { deployment, publicClient, walletClient } from "./env.js";
import { verificationMode } from "./verification-policy.js";

const [caller, daysArg] = process.argv.slice(2) as [Address, string | undefined];
if (!caller) {
  console.error("usage: npm run attest -- <callerAddress> [days]");
  process.exit(1);
}
const mode = verificationMode(process.env.CLEANVERSE_MODE, deployment.chainId, deployment.demo);

type APass = { status: string; expiresAt: number; reference: string };

/** Reads the caller's A-Pass from Cleanverse. Endpoint path follows the public API v3 integrations. */
async function queryAPass(address: Address): Promise<APass | null> {
  const base = process.env.CLEANVERSE_BASE_URL;
  const id = process.env.CLEANVERSE_API_ID;
  const key = process.env.CLEANVERSE_API_KEY;
  if (!base || !id || !key) throw new Error("Set CLEANVERSE_BASE_URL, CLEANVERSE_API_ID, CLEANVERSE_API_KEY");
  const res = await fetch(`${base}/apass/query?wallet=${address}`, {
    headers: { "x-api-id": id, "x-api-key": key },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cleanverse ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return { status: body.status, expiresAt: Number(body.expireTime ?? body.expiresAt), reference: body.id ?? "" };
}

let until: bigint;
let ref: `0x${string}`;
if (mode === "api") {
  const pass = await queryAPass(caller);
  if (!pass || pass.status.toLowerCase() !== "active" || pass.expiresAt * 1000 < Date.now()) {
    console.error(`No active A-Pass for ${caller}; not attesting.`);
    process.exit(2);
  }
  until = BigInt(pass.expiresAt);
  ref = keccak256(toHex(pass.reference)); // only a hash of the reference goes onchain
} else {
  until = BigInt(Math.floor(Date.now() / 1000) + Number(daysArg ?? 30) * 86_400);
  ref = keccak256(toHex(`mock:${caller}`));
}

const hash = await walletClient.writeContract({
  address: deployment.gate,
  abi: AttestedGateAbi,
  functionName: "attest",
  args: [caller, until, ref],
});
await publicClient.waitForTransactionReceipt({ hash });
console.log(`attested ${caller} until ${new Date(Number(until) * 1000).toISOString()} (${mode}) tx ${hash}`);
