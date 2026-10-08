// Seeds a demo venue (testnet) with the three demo personas, so the feed, leaderboard and portfolio have
// something real to show:
//   @ada         verified caller: a few short calls that get scored now, plus open calls for the coming days
//   @sybil_farm  unverified caller: one call with a pile of fake followers from fresh wallets
//   @femi        follower: follows one of Ada's short calls and closes it after expiry (fee or "still down"),
//                and holds an open position on one of Ada's longer calls
// Outcomes come from the keeper's simulated market; nothing is staged.
//
// Persona keys are created once and saved to ../.env.demo (git-ignored; testnet only). The deployer
// (KEEPER_KEY) funds them with testnet MON and attests Ada (mock Cleanverse).
//
//   CHAIN_ID=10143 RPC_URL=https://testnet-rpc.monad.xyz KEEPER_KEY=... KEEPER_API=https://... npx tsx src/seed-demo.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AttestedGateAbi, CallBookAbi, DemoRouterAbi, DemoTokenAbi, FollowVaultAbi, HandlesAbi, KeeperPriceSourceAbi, VaultFactoryAbi } from "./abi.js";
import { chain, deployment as d, publicClient, rpcTransport, walletClient } from "./env.js";

if (!d.demo || d.chainId === 143) throw new Error("Demo venues only (testnet or local)");
const handles = (d as any).handles as Address;
const KEEPER_API = process.env.KEEPER_API;
const FAKE_FOLLOWERS = Number(process.env.FAKE_FOLLOWERS ?? 8);
const rpcUrl = chain.rpcUrls.default.http[0];
const ONE = 10n ** 18n;
const AUSD = (n: string) => parseUnits(n, 6);
const wait = async (hash: Hex) => {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted: ${hash}`);
  return r;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ personas
const KEYS_FILE = new URL("../../.env.demo", import.meta.url);
const saved: Record<string, string> = existsSync(KEYS_FILE)
  ? Object.fromEntries(
      readFileSync(KEYS_FILE, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=0x/.test(l))
        .map((l) => l.split("=") as [string, string]),
    )
  : {};
for (const k of ["ADA_KEY", "SYBIL_KEY", "FEMI_KEY"]) saved[k] ??= generatePrivateKey();
writeFileSync(
  KEYS_FILE,
  "# Demo persona keys for the TESTNET demo venue only (scripts/seed-demo). Never fund on mainnet.\n" +
    Object.entries(saved)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n",
);
const persona = (key: string) => {
  const account = privateKeyToAccount(key as Hex);
  return { account, wallet: createWalletClient({ chain, transport: rpcTransport(), account }) };
};
// SEED_FINISH=1 skips to the last step after an interrupted run: wait for Ada's short calls (SEED_SHORT, default
// "0,1,2,3") to be scored, then Femi closes her position on the first one (FEMI_POSITION, default 0).
const FINISH = process.env.SEED_FINISH === "1";
const ada = persona(saved.ADA_KEY);
const sybil = persona(saved.SYBIL_KEY);
const femi = persona(saved.FEMI_KEY);
console.log(`personas: ada ${ada.account.address} · sybil_farm ${sybil.account.address} · femi ${femi.account.address}`);

// Keep the keeper pushing prices (and scoring) while we work.
const poke = () => (KEEPER_API ? fetch(`${KEEPER_API}/poke`, { method: "POST" }).catch(() => {}) : Promise.resolve());
await poke();
const poker = setInterval(poke, 20_000);

async function freshMid(): Promise<bigint> {
  for (let i = 0; i < 12; i++) {
    try {
      return (await publicClient.readContract({
        address: d.priceSource,
        abi: KeeperPriceSourceAbi,
        functionName: "midPrice",
        args: [d.base, d.settlement],
      })) as bigint;
    } catch {
      await poke();
      await sleep(5_000);
    }
  }
  throw new Error("no fresh price: is the keeper running?");
}

async function fund(addr: Address, target: string) {
  const bal = await publicClient.getBalance({ address: addr });
  const want = parseEther(target);
  if (bal >= want) return;
  await wait(await walletClient.sendTransaction({ to: addr, value: want - bal }));
}

async function setHandle(p: ReturnType<typeof persona>, name: string) {
  const cur = (await publicClient.readContract({ address: handles, abi: HandlesAbi, functionName: "handleOf", args: [p.account.address] })) as string;
  if (cur) return;
  await wait(await p.wallet.writeContract({ address: handles, abi: HandlesAbi, functionName: "setHandle", args: [name] }));
}

async function post(p: ReturnType<typeof persona>, horizon: number, feeBps: number, targetPct = 5, stopPct = 3): Promise<number> {
  const mid = await freshMid();
  await wait(
    await p.wallet.writeContract({
      address: d.callBook,
      abi: CallBookAbi,
      functionName: "postCall",
      args: [d.base, d.settlement, 0, (mid * BigInt(100 + targetPct)) / 100n, (mid * BigInt(100 - stopPct)) / 100n, feeBps, horizon],
    }),
  );
  return Number(await publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "callCount" })) - 1;
}

async function vaultFor(p: ReturnType<typeof persona>, cap: string, cash: string): Promise<Address> {
  let v = (await publicClient.readContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "vaultOf", args: [p.account.address] })) as Address;
  if (v === zeroAddress) {
    await wait(await p.wallet.writeContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "createVault", args: [AUSD(cap)] }));
    v = (await publicClient.readContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "vaultOf", args: [p.account.address] })) as Address;
  }
  await wait(await p.wallet.writeContract({ address: d.settlement, abi: DemoTokenAbi, functionName: "faucet", args: [v, AUSD(cash)] }));
  return v;
}

async function follow(p: ReturnType<typeof persona>, vault: Address, callId: number, amount: string): Promise<number> {
  const amt = AUSD(amount);
  const mid = await freshMid();
  const data = encodeFunctionData({ abi: DemoRouterAbi, functionName: "swap", args: [d.base, d.settlement, amt, false, vault] });
  await wait(
    await p.wallet.writeContract({
      address: vault,
      abi: FollowVaultAbi,
      functionName: "follow",
      args: [BigInt(callId), amt, d.router, data, (((amt * ONE) / mid) * 98n) / 100n],
    }),
  );
  return Number(await publicClient.readContract({ address: vault, abi: FollowVaultAbi, functionName: "positionCount" })) - 1;
}

async function close(p: ReturnType<typeof persona>, vault: Address, positionId: number) {
  const pos: any = await publicClient.readContract({ address: vault, abi: FollowVaultAbi, functionName: "getPosition", args: [BigInt(positionId)] });
  const mid = await freshMid();
  const data = encodeFunctionData({ abi: DemoRouterAbi, functionName: "swap", args: [d.base, d.settlement, pos.baseAmount, true, vault] });
  return wait(
    await p.wallet.writeContract({
      address: vault,
      abi: FollowVaultAbi,
      functionName: "close",
      args: [BigInt(positionId), d.router, data, (((pos.baseAmount * mid) / ONE) * 98n) / 100n],
    }),
  );
}

const getCall = (id: number) =>
  publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "getCall", args: [BigInt(id)] }) as Promise<any>;

// ------------------------------------------------------------------ seed
const start = await publicClient.getBalance({ address: walletClient.account.address });

let short: number[] = [];
let femiVault: Address = zeroAddress;
let femiShort = 0;
if (FINISH) {
  short = (process.env.SEED_SHORT ?? "0,1,2,3").split(",").map(Number);
  femiVault = (await publicClient.readContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "vaultOf", args: [femi.account.address] })) as Address;
  femiShort = Number(process.env.FEMI_POSITION ?? 0);
} else {
console.log("1/6 funding personas with testnet MON");
await fund(ada.account.address, "0.4");
await fund(femi.account.address, "0.4");
await fund(sybil.account.address, "0.3");

console.log("2/6 verifying Ada (mock Cleanverse A-Pass, 30 days) and setting handles");
const adaVerified = await publicClient.readContract({ address: d.gate, abi: AttestedGateAbi, functionName: "isVerified", args: [ada.account.address] });
if (!adaVerified)
  await wait(
    await walletClient.writeContract({
      address: d.gate,
      abi: AttestedGateAbi,
      functionName: "attest",
      args: [ada.account.address, BigInt(Math.floor(Date.now() / 1000) + 30 * 86_400), `0x${"00".repeat(31)}01`],
    }),
  );
await setHandle(ada, "ada");
await setHandle(sybil, "sybil_farm");
await setHandle(femi, "femi");

console.log("3/6 Ada posts short calls (scored in minutes) and open calls for the coming days");
for (const h of [180, 240, 300, 360]) short.push(await post(ada, h, 1500, 2, 2));
const open24h = await post(ada, 24 * 3600, 1500, 6, 4);
const open3d = await post(ada, 3 * 86_400, 2000, 12, 6);
const open6h = await post(ada, 6 * 3600, 1000, 3, 2);
console.log(`   short #${short.join(", #")} · open #${open6h} (6h), #${open24h} (24h), #${open3d} (3d)`);

console.log("4/6 Femi follows Ada's first short call and her 24h call");
femiVault = await vaultFor(femi, "500", "500");
femiShort = await follow(femi, femiVault, short[0], "100");
const femiLong = await follow(femi, femiVault, open24h, "50");
console.log(`   vault ${femiVault}: position #${femiShort} on call #${short[0]}, #${femiLong} on call #${open24h}`);

console.log(`5/6 Sybil Farm posts a 30-min call at a 30% fee and adds ${FAKE_FOLLOWERS} fake followers`);
const sybilCall = await post(sybil, 1800, 3000, 20, 10);
for (let i = 0; i < FAKE_FOLLOWERS; i++) {
  const fake = persona(generatePrivateKey());
  await fund(fake.account.address, "0.08");
  const v = await vaultFor(fake, "1000", "100");
  await follow(fake, v, sybilCall, "100");
  process.stdout.write(".");
}
console.log(`\n   call #${sybilCall}: ${FAKE_FOLLOWERS} wallets, $${FAKE_FOLLOWERS * 100} behind it`);
}

console.log("6/6 waiting for Ada's short calls to be scored, then Femi closes");
const deadline = Date.now() + 20 * 60_000;
for (;;) {
  const calls = await Promise.all(short.map(getCall));
  if (calls.every((c) => c.scored)) break;
  if (Date.now() > deadline) throw new Error("scoring timed out: is the keeper running?");
  await sleep(10_000);
}
const before: any = await publicClient.readContract({ address: femiVault, abi: FollowVaultAbi, functionName: "netPnl", args: [ada.account.address] });
await close(femi, femiVault, femiShort);
const net: bigint = (await publicClient.readContract({ address: femiVault, abi: FollowVaultAbi, functionName: "netPnl", args: [ada.account.address] })) as bigint;
const hwm: bigint = (await publicClient.readContract({ address: femiVault, abi: FollowVaultAbi, functionName: "highWater", args: [ada.account.address] })) as bigint;

clearInterval(poker);
const scored = await Promise.all(short.map(getCall));
const rec = (await publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "records", args: [ada.account.address] })) as readonly [bigint, number, number, number];
const end = await publicClient.getBalance({ address: walletClient.account.address });
console.log("\nDone.");
console.log(`@ada: ${rec[3]}/${rec[2]} wins; short calls: ${scored.map((c, i) => `#${short[i]} ${(Number(c.returnBps) / 100).toFixed(2)}%`).join(", ")}`);
console.log(
  `@femi closed #${femiShort}: net P&L with @ada ${(Number(net) / 1e6).toFixed(2)} AUSD (was ${(Number(before) / 1e6).toFixed(2)}), ` +
    (net > 0n && hwm > 0n ? "caller fee paid from the gain" : "still down or flat: @ada earns nothing"),
);
console.log(`deployer spent ${formatEther(start - end)} MON (funding + attest)`);
