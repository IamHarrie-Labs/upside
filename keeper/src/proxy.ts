// Small HTTP API the apps use for things browsers can't call directly:
//   POST /quote                Kuru Flow quote for a vault (JWT per address, 1 request/second; mainnet only)
//   GET  /perpl/context?net=   Perpl's public market context (no CORS headers upstream), cached for 15 seconds
//   GET  /nansen?addresses=a,b Nansen labels / Smart Money status for callers (see nansen.ts)
//   POST /poke                 an app is open: keep the onchain price fresh for the next few minutes
//   GET  /flow                 follower count and volume per call (see flow.ts)
import { createServer } from "node:http";
import { getAddress, type Address } from "viem";
import { deployment } from "./env.js";
import { kuruQuote } from "./kuru.js";
import { nansenFor, nansenMode } from "./nansen.js";
import { flowSnapshot } from "./flow.js";
import {receiptsFor} from "./receipts.js";
import {corsOrigin} from "./cors.js";

const PORT = Number(process.env.PROXY_PORT ?? 8788);
const allowed = new Set([deployment.base.toLowerCase(), deployment.settlement.toLowerCase()]);
const PERPL_API: Record<string, string> = {
  mainnet: "https://app.perpl.xyz",
  testnet: "https://testnet.perpl.xyz",
};
const perplCache = new Map<string, { at: number; body: string }>();
const requests=new Map<string,{at:number;count:number}>();
export function readBodyLimit(req:AsyncIterable<Buffer|string>,limit=16_384) {
  return (async()=>{let bytes=0;let body="";for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>limit)throw Error("Request body exceeds 16 KiB limit");body+=chunk;}return body;})();
}

async function perplContext(net: string): Promise<string> {
  const base = PERPL_API[net];
  if (!base) throw new Error("net must be mainnet or testnet");
  const hit = perplCache.get(net);
  if (hit && Date.now() - hit.at < 15_000) return hit.body;
  const res = await fetch(`${base}/api/v1/pub/context`,{signal:AbortSignal.timeout(10_000)});
  if (!res.ok) throw new Error(`Perpl context ${res.status}`);
  const full = await res.json();
  // Only what the apps need: the exchange address and the market list with marks.
  const body = JSON.stringify({ chain: full.chain?.chain_id, instances: full.instances, markets: full.markets });
  perplCache.set(net, { at: Date.now(), body });
  return body;
}

export function startApi(hooks: { onPoke?: () => void; status?: () => Record<string, unknown> } = {}) {
  createServer(async (req, res) => {
    const origin = corsOrigin(req.headers.origin, process.env.ALLOWED_ORIGIN);
    res.setHeader("vary", "Origin");
    if (origin) res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("content-type", "application/json");
    if (req.headers.origin && !origin) { res.statusCode = 403; return res.end(JSON.stringify({message:"Browser origin is not allowed"})); }
    if (req.method === "OPTIONS") return res.end();
    let url:URL;
    try{url=new URL(req.url??"/","http://x");}catch{res.statusCode=400;return res.end(JSON.stringify({message:"Invalid request URL"}));}
    const ip=req.socket.remoteAddress??"unknown", now=Date.now();
    for(const [key,value] of requests) if(now-value.at>60_000)requests.delete(key);
    const window=requests.get(ip)??{at:now,count:0};requests.set(ip,window);
    if(++window.count>600||requests.size>2000){res.statusCode=429;res.setHeader("retry-after","60");return res.end(JSON.stringify({message:"Too many requests; retry shortly"}));}
    try {
      if (req.method === "GET" && url.pathname === "/perpl/context") {
        return res.end(await perplContext(url.searchParams.get("net") ?? "mainnet"));
      }
      if (req.method === "POST" && url.pathname === "/poke") {
        hooks.onPoke?.();
        return res.end(JSON.stringify({ ok: true, ...hooks.status?.() }));
      }
      if (req.method === "GET" && url.pathname === "/flow") {
        return res.end(JSON.stringify(flowSnapshot()));
      }
      if (req.method === "GET" && url.pathname === "/receipts") {
        const vault=url.searchParams.get("vault")??"";
        if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) throw new Error("Invalid vault address.");
        return res.end(JSON.stringify(await receiptsFor(vault)));
      }
      if (req.method === "GET" && url.pathname === "/nansen") {
        const addresses = (url.searchParams.get("addresses") ?? "").split(",").filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a));
        return res.end(JSON.stringify({ mode: nansenMode, data: await nansenFor(addresses) }));
      }
      if (req.method === "POST" && url.pathname === "/quote") {
        if (deployment.demo) throw new Error("quotes are for mainnet deployments; demo uses DemoRouter");
        const body = await readBodyLimit(req);
        const { userAddress, tokenIn, tokenOut, amount } = JSON.parse(body);
        if(!/^\d{1,40}$/.test(String(amount))||BigInt(amount)<=0n)throw Error("Amount must be a positive token quantity");
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
  }).setTimeout(15_000).listen(PORT, () => console.log(`keeper API on :${PORT}`));
}
