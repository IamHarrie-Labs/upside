// End-to-end check of the plugin's core on a local Anvil chain, with a local signer standing in for MetaMask's
// wallet executor. Everything except the mm host itself runs exactly as in the plugin.
//
// Needs: anvil on :8547, `bash scripts/setup-local.sh` (Sarah verified), and the keeper pushing prices.
//   cd mm-plugin && npm run test:local
import { mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { CallBookAbi, KeeperPriceSourceAbi } from "../src/abi.js";
import {
  autopilotPass,
  close,
  DEFAULT_RULES,
  deposit,
  ensureVault,
  fmtQuote,
  getMid,
  getVaultState,
  parseQuote,
  type Deployment,
  type Host,
  type PilotAction,
} from "../src/core.js";

const RPC = process.env.UPSIDE_RPC_URL ?? "http://127.0.0.1:8547";
const d = JSON.parse(readFileSync(new URL("../../contracts/deployments/31337.json", import.meta.url), "utf8")) as Deployment;
process.env.UPSIDE_STATE_DIR = mkdtempSync(join(tmpdir(), "upside-pilot-"));

// Anvil's public test keys: #1 Sarah (verified caller), #2 Sybil Farm (unverified). The agent's wallet is a fresh
// key each run, so every run starts without a vault.
const KEYS = {
  sarah: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  sybil: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  agent: generatePrivateKey(),
} as const;

const read = createPublicClient({ chain: foundry, transport: http(RPC) }) as PublicClient;
const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: http(RPC) });

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

async function post(key: Hex, horizon: number, feeBps: number): Promise<number> {
  const mid = (await getMid({ read, d }))!;
  const w = wallet(key);
  const hash = await w.writeContract({
    address: d.callBook,
    abi: CallBookAbi,
    functionName: "postCall",
    args: [d.base, d.settlement, 0, (mid * 110n) / 100n, (mid * 90n) / 100n, feeBps, horizon],
  });
  await read.waitForTransactionReceipt({ hash });
  return Number(await read.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "callCount" })) - 1;
}

// Stand-in for ctx.walletExecutor: same Host contract the plugin gives the core.
const agent = wallet(KEYS.agent);
const submitted: string[] = [];
const host: Host = {
  chainId: 31337,
  d,
  read,
  account: agent.account.address,
  log: (m) => console.log("   ", m),
  async submit(tx, summary) {
    submitted.push(summary);
    const hash = await agent.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
    const r = await read.waitForTransactionReceipt({ hash });
    return { hash, status: r.status === "success" ? "confirmed" : "reverted" };
  },
};

const kinds = (acts: PilotAction[], callId: number) => acts.filter((a) => "callId" in a && a.callId === callId).map((a) => a.kind);

async function main() {
  const seed=wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const price=await seed.writeContract({address:d.priceSource,abi:KeeperPriceSourceAbi,functionName:'push',args:[d.base,d.settlement,2000000n]});await read.waitForTransactionReceipt({hash:price});
  if (!(await getMid(host))) throw new Error("No fresh mid onchain: start the keeper first.");
  await read.request({ method: "anvil_setBalance" as any, params: [host.account, "0x56BC75E2D63100000"] as any });
  console.log(`agent wallet ${host.account}\n`);

  // Two calls at the same moment: a verified caller and an unverified farm.
  const adaShort = await post(KEYS.sarah, 90, 1500); // expires soon: tests close-on-expiry
  const adaLong = await post(KEYS.sarah, 3600, 1500);
  const sybil = await post(KEYS.sybil, 3600, 1500);
  const greedy = await post(KEYS.sarah, 3600, 2900); // fee above the agent's limit
  console.log(`posted calls: Sarah #${adaShort} (90s), Sarah #${adaLong}, Sybil #${sybil}, Sarah high-fee #${greedy}\n`);

  // Vault with a 25 AUSD onchain exposure cap, funded with 100 test AUSD.
  const { vault } = await ensureVault(host, parseQuote("25"));
  await deposit(host, vault, parseQuote("100"));
  const before = await getVaultState(host, vault);
  console.log(`vault ${vault}: cash ${fmtQuote(before.cash)}, cap ${fmtQuote(before.maxExposure)}, open ${fmtQuote(before.openCost)}\n`);

  // Only calls from this run (posted in the last 45 seconds); record thresholds are off because the local chain's record is whatever earlier runs left.
  const rules = { ...DEFAULT_RULES, perCall: parseQuote("10"), minScored: 0, minWinRate: 0, minAvgReturnBps: -10_000, maxFeeBps: 2000, maxAgeSec: 45 };
  const opts = { rules, dailyBudget: parseQuote("50"), closeExpired: true, dryRun: false };

  // Dry run sends nothing.
  const n0 = submitted.length;
  const dry = await autopilotPass(host, { ...opts, dryRun: true });
  check(submitted.length === n0, "dry run sends no transactions");
  check(kinds(dry, adaLong).includes("followed"), "dry run would follow the verified caller");

  // Real pass.
  const pass1 = await autopilotPass(host, opts);
  for (const a of pass1) if (a.kind === "skipped" && [adaShort, adaLong, sybil, greedy].includes(a.callId)) console.log(`    skipped #${a.callId}: ${a.reasons.join("; ")}`);
  check(kinds(pass1, adaShort).includes("followed"), `follows Sarah's call #${adaShort}`);
  check(kinds(pass1, adaLong).includes("followed"), `follows Sarah's call #${adaLong}`);
  const sy = pass1.find((a) => a.kind === "skipped" && a.callId === sybil) as Extract<PilotAction, { kind: "skipped" }> | undefined;
  check(!!sy?.reasons.some((r) => r.includes("not verified")), `skips Sybil Farm's call #${sybil}: unverified`);
  const gr = pass1.find((a) => a.kind === "skipped" && a.callId === greedy) as Extract<PilotAction, { kind: "skipped" }> | undefined;
  check(!!gr?.reasons.some((r) => r.includes("profit share")), `skips call #${greedy}: fee above the limit`);

  const mid = await getVaultState(host, vault);
  check(mid.openCost <= mid.maxExposure, `open cost ${fmtQuote(mid.openCost)} stays within the ${fmtQuote(mid.maxExposure)} cap`);

  // Exposure cap: a third verified call doesn't fit (20 open + 10 > 25).
  const third = await post(KEYS.sarah, 3600, 1000);
  const pass2 = await autopilotPass(host, opts);
  check(!kinds(pass2, adaLong).includes("followed"), "never follows the same call twice");
  const cap = pass2.find((a) => a.kind === "skipped" && a.callId === third) as Extract<PilotAction, { kind: "skipped" }> | undefined;
  check(!!cap?.reasons.some((r) => r.includes("exposure cap")), `skips call #${third}: vault exposure cap`);

  const ledger=join(process.env.UPSIDE_STATE_DIR!,`autopilot-31337-${host.account.toLowerCase()}.json`);unlinkSync(ledger);
  const recovered=await autopilotPass(host,{...opts,dailyBudget:parseQuote('20')});
  check(recovered.some(a=>a.kind==='skipped'&&a.callId===third&&a.reasons.some(r=>r.includes('daily budget'))),'missing local state reconstructs confirmed daily spend');
  // Manual close works through the same path.
  const longPos = (await getVaultState(host, vault)).positions.find((p) => p.callId === adaLong && p.open)!;
  await close(host, vault, longPos);
  check(!(await getVaultState(host, vault)).positions.find((p) => p.id === longPos.id)!.open, `closes position #${longPos.id}`);

  // Nansen Smart Money rule (x402 lookup stubbed here; scripts/identity-x402-test.ts covers the payment).
  const smartRules = { ...opts, dryRun: true, rules: { ...rules, requireSmartMoney: true } };
  const notSmart = await autopilotPass(host, { ...smartRules, smartMoney: async () => new Map() });
  const ns = notSmart.find((a) => a.kind === "skipped" && a.callId === third) as Extract<PilotAction, { kind: "skipped" }> | undefined;
  check(!!ns?.reasons.some((r) => r.includes("Nansen")), `--smart-money-only skips call #${third} when Nansen doesn't list the caller`);
  let lookups = 0;
  const sarah = privateKeyToAccount(KEYS.sarah).address.toLowerCase();
  const smart = await autopilotPass(host, {
    ...smartRules,
    smartMoney: async () => (lookups++, new Map([[sarah, { label: "30D Smart Trader" }]])),
  });
  check(!kinds(smart, third).includes("followed") && lookups === 0, `dry-run Smart Money rule refuses without buying intelligence`);

  // Close on expiry: wait for Sarah's short call to expire, then a pass closes it.
  console.log(`\nwaiting for call #${adaShort} to expire…`);
  const call: any = await read.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "getCall", args: [BigInt(adaShort)] });
  await read.request({method:'evm_increaseTime' as any,params:[Math.max(1,Number(call.expiry)+2-Number((await read.getBlock()).timestamp))] as any});await read.request({method:'evm_mine' as any});
  const fresh=await seed.writeContract({address:d.priceSource,abi:KeeperPriceSourceAbi,functionName:'push',args:[d.base,d.settlement,2000000n]});await read.waitForTransactionReceipt({hash:fresh});
  const pass3 = await autopilotPass(host, opts);
  check(kinds(pass3, adaShort).includes("closed"), `closes the position on call #${adaShort} after it expires`);

  const end = await getVaultState(host, vault);
  console.log(`\nvault now: cash ${fmtQuote(end.cash)}, open ${fmtQuote(end.openCost)}; ${submitted.length} transactions sent:`);
  for (const s of submitted) console.log(`  - ${s}`);
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
