// Small HTTP API the apps use for things browsers can't call directly:
//   POST /quote                Kuru Flow quote for a vault (JWT per address, 1 request/second; mainnet only)
//   GET  /perpl/context?net=   Perpl's public market context (no CORS headers upstream), cached for 15 seconds
//   GET  /nansen?addresses=a,b Nansen labels / Smart Money status for callers (see nansen.ts)
//   POST /poke                 an app is open: keep the onchain price fresh for the next few minutes
import { createServer } from "node:http";
import { getAddress, type Address } from "viem";
import { deployment } from "./env.js";
import { kuruQuote } from "./kuru.js";
import { nansenFor, nansenMode } from "./nansen.js";

const PORT = Number(process.env.PROXY_PORT ?? 8788);
const allowed = new Set([deployment.base.toLowerCase(), deployment.settlement.toLowerCase()]);
const PERPL_API: Record<string, string> = {
  mainnet: "https://app.perpl.xyz",
  testnet: "https://testnet.perpl.xyz",
};
const perplCache = new Map<string, { at: number; body: string }>();

async function perplContext(net: string): Promise<string> {
  const base = PERPL_API[net];
  if (!base) throw new Error("net must be mainnet or testnet");
  const hit = perplCache.get(net);
  if (hit && Date.now() - hit.at < 15_000) return hit.body;
  const res = await fetch(`${base}/api/v1/pub/context`);
  if (!res.ok) throw new Error(`Perpl context ${res.status}`);
  const full = await res.json();
  // Only what the apps need: the exchange address and the market list with marks.
  const body = JSON.stringify({ chain: full.chain?.chain_id, instances: full.instances, markets: full.markets });
  perplCache.set(net, { at: Date.now(), body });
  return body;
}

export function startApi(hooks: { onPoke?: () => void } = {}) {
  createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", process.env.ALLOWED_ORIGIN ?? "*");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("content-type", "application/json");
    if (req.method === "OPTIONS") return res.end();
    const url = new URL(req.url ?? "/", "http://x");
    try {
      if (req.method === "GET" && url.pathname === "/perpl/context") {
        return res.end(await perplContext(url.searchParams.get("net") ?? "mainnet"));
      }
      if (req.method === "POST" && url.pathname === "/poke") {
        hooks.onPoke?.();
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.method === "GET" && url.pathname === "/nansen") {
        const addresses = (url.searchParams.get("addresses") ?? "").split(",").filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a));
        return res.end(JSON.stringify({ mode: nansenMode, data: await nansenFor(addresses) }));
      }
      if (req.method === "POST" && url.pathname === "/quote") {
        if (deployment.demo) throw new Error("quotes are for mainnet deployments; demo uses DemoRouter");
        let body = "";
        for await (const chunk of req) body += chunk;
        const { userAddress, tokenIn, tokenOut, amount } = JSON.parse(body);
        if (!allowed.has(String(tokenIn).toLowerCase()) || !allowed.has(String(tokenOut).toLowerCase()))
          throw new Error("pair not allowed");
        const q = await kuruQuote(getAddress(userAddress) as Address, tokenIn, tokenOut, BigInt(amount));
        return res.end(
          JSON.stringify({
            status: "success",
            output: q.output.toString(),
            minOut: q.minOut.toString(),
            transaction: { to: q.to, calldata: q.data, value: q.value.toString() },
          }),
        );
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ status: "error", message: "not found" }));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ status: "error", message: (e as Error).message }));
    }
  }).listen(PORT, () => console.log(`keeper API on :${PORT}`));
}
