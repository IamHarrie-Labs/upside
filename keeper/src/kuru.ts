// Kuru Flow client. Tokens are issued per user address and rate-limited to 1 request/second each.
// Verified against the live API on 2026-10-05: POST /api/generate-token {user_address} -> {token, expires_at};
// POST /api/quote -> {status, output, minOut, transaction: {to, calldata (no 0x), value}}.
import type { Address, Hex } from "viem";

export const KURU_FLOW_URL = process.env.KURU_FLOW_URL ?? "https://ws.kuru.io";

type Token = { token: string; expiresAt: number; nextAt: number };
const tokens = new Map<string, Token>();

async function tokenFor(user: Address): Promise<Token> {
  const key = user.toLowerCase();
  const cached = tokens.get(key);
  if (cached && cached.expiresAt * 1000 > Date.now() + 60_000) return cached;
  const res = await fetch(`${KURU_FLOW_URL}/api/generate-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_address: user }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Kuru token failed: ${JSON.stringify(body)}`);
  const t = { token: body.token, expiresAt: body.expires_at, nextAt: 0 };
  tokens.set(key, t);
  return t;
}

export type KuruQuote = { output: bigint; minOut: bigint; to: Address; data: Hex; value: bigint };

export async function kuruQuote(user: Address, tokenIn: Address, tokenOut: Address, amount: bigint): Promise<KuruQuote> {
  const t = await tokenFor(user);
  const wait = t.nextAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  t.nextAt = Date.now() + 1100;
  const res = await fetch(`${KURU_FLOW_URL}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
    body: JSON.stringify({ userAddress: user, tokenIn, tokenOut, amount: amount.toString(), autoSlippage: true }),
  });
  const q = await res.json();
  if (q.status !== "success") throw new Error(`Kuru quote failed: ${JSON.stringify(q).slice(0, 200)}`);
  const raw: string = q.transaction.calldata;
  return {
    output: BigInt(q.output),
    minOut: BigInt(q.minOut),
    to: q.transaction.to,
    data: (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex,
    value: BigInt(q.transaction.value || "0"),
  };
}
