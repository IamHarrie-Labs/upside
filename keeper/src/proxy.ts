// Tiny HTTP proxy so the app can get Kuru Flow quotes for a vault (Kuru Flow uses JWT auth and may not allow
// browser CORS). Only quotes for the deployment's pair are served.
import { createServer } from "node:http";
import { getAddress, type Address } from "viem";
import { deployment } from "./env.js";
import { kuruQuote } from "./kuru.js";

const PORT = Number(process.env.PROXY_PORT ?? 8788);
const allowed = new Set([deployment.base.toLowerCase(), deployment.settlement.toLowerCase()]);

export function startQuoteProxy() {
  createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", process.env.ALLOWED_ORIGIN ?? "*");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.method !== "POST" || req.url !== "/quote") {
      res.statusCode = 404;
      return res.end();
    }
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { userAddress, tokenIn, tokenOut, amount } = JSON.parse(body);
      if (!allowed.has(String(tokenIn).toLowerCase()) || !allowed.has(String(tokenOut).toLowerCase()))
        throw new Error("pair not allowed");
      const q = await kuruQuote(getAddress(userAddress) as Address, tokenIn, tokenOut, BigInt(amount));
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          status: "success",
          output: q.output.toString(),
          minOut: q.minOut.toString(),
          transaction: { to: q.to, calldata: q.data, value: q.value.toString() },
        }),
      );
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ status: "error", message: (e as Error).message }));
    }
  }).listen(PORT, () => console.log(`Kuru quote proxy on :${PORT}`));
}
