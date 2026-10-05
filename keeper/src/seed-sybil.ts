// Demo: a "Sybil farm" posts a call and piles fake followers into it from fresh wallets.
// After scoring, the call's score equals the market move, no matter how many followers it had.
//
// Local:   KEEPER_KEY=<anvil key 0> npx tsx src/seed-sybil.ts [followers] [horizonSec]
// Testnet: CHAIN_ID=10143 RPC_URL=https://testnet-rpc.monad.xyz KEEPER_KEY=... (funds each fake wallet with 0.05 MON)
import { createWalletClient, http, parseEther, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CallBookAbi, DemoRouterAbi, DemoTokenAbi, FollowVaultAbi, KeeperPriceSourceAbi, VaultFactoryAbi } from "./abi.js";
import { encodeFunctionData } from "viem";
import { chain, deployment as d, publicClient, walletClient } from "./env.js";

if (!d.demo) throw new Error("Demo deployments only");
const N = Number(process.argv[2] ?? 12);
const HORIZON = Number(process.argv[3] ?? 120);
const SYBIL_KEY = (process.env.SYBIL_KEY ??
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as `0x${string}`; // anvil key 2
const local = d.chainId === 31337;
const rpcUrl = chain.rpcUrls.default.http[0];
const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });

async function fund(addr: Address) {
  if (local) {
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [addr, "0x56BC75E2D63100000"] }),
    });
  } else {
    await wait(await walletClient.sendTransaction({ to: addr, value: parseEther("0.05") }));
  }
}

const sybil = privateKeyToAccount(SYBIL_KEY);
const sybilWallet = createWalletClient({ chain, transport: http(rpcUrl), account: sybil });
await fund(sybil.address);

const mid = (await publicClient.readContract({
  address: d.priceSource, abi: KeeperPriceSourceAbi, functionName: "midPrice", args: [d.base, d.settlement],
})) as bigint;
await wait(await sybilWallet.writeContract({
  address: d.callBook, abi: CallBookAbi, functionName: "postCall",
  args: [d.base, d.settlement, 0, (mid * 120n) / 100n, (mid * 90n) / 100n, 3000, HORIZON],
}));
const callId = ((await publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "callCount" })) as bigint) - 1n;
console.log(`farm ${sybil.address} posted call #${callId}; adding ${N} fake followers…`);

const amount = parseUnits("100", 6);
for (let i = 0; i < N; i++) {
  const acct = privateKeyToAccount(generatePrivateKey());
  const w = createWalletClient({ chain, transport: http(rpcUrl), account: acct });
  await fund(acct.address);
  await wait(await w.writeContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "createVault", args: [parseUnits("1000", 6)] }));
  const vault = (await publicClient.readContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "vaultOf", args: [acct.address] })) as Address;
  await wait(await w.writeContract({ address: d.settlement, abi: DemoTokenAbi, functionName: "faucet", args: [vault, amount] }));
  const data = encodeFunctionData({ abi: DemoRouterAbi, functionName: "swap", args: [d.base, d.settlement, amount, false, vault] });
  await wait(await w.writeContract({ address: vault, abi: FollowVaultAbi, functionName: "follow", args: [callId, amount, d.router, data, 0n] }));
  process.stdout.write(`.`);
}
console.log(`\n${N} fake followers put $${N * 100} behind call #${callId}.`);
console.log(`It is scored in ${HORIZON}s from the market mid only. Watch it on the Leaders tab: @sybil_farm stays unranked (unverified), and the call's result equals the price move.`);
