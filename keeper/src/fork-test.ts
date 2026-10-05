// End-to-end check of the mainnet path on a local fork of Monad mainnet:
// real AUSD, real WMON, real Kuru Flow router and calldata from the live Kuru Flow API.
//
//   anvil --fork-url https://rpc.monad.xyz --chain-id 31338 --port 8548
//   (deploy with DEMO=false SETTLEMENT_TOKEN=<AUSD> BASE_TOKEN=<WMON> ROUTER=<Kuru Flow router>)
//   CHAIN_ID=31338 RPC_URL=http://127.0.0.1:8548 KEEPER_KEY=<anvil key 0> npx tsx src/fork-test.ts
import { formatUnits, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { CallBookAbi, DemoTokenAbi, FollowVaultAbi, KeeperPriceSourceAbi, VaultFactoryAbi } from "./abi.js";
import { account, chain, deployment as d, publicClient, walletClient } from "./env.js";
import { kuruQuote } from "./kuru.js";

const AUSD_HOLDER = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F" as Address; // Perpl exchange (AUSD collateral)
const FOLLOWER = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const follower = createWalletClient({ chain, transport: http(chain.rpcUrls.default.http[0]), account: FOLLOWER });
const rpc = (method: string, params: unknown[]) =>
  fetch(chain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json());
const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });
const bal = (token: Address, who: Address) =>
  publicClient.readContract({ address: token, abi: DemoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

// 1. price from live Kuru quotes, pushed by the keeper
const buy = await kuruQuote(account.address, d.settlement, d.base, parseUnits("10", 6));
const midX18 = (parseUnits("10", 6) * 10n ** 18n) / buy.output;
console.log("Kuru mid ≈", (10 / Number(formatUnits(buy.output, 18))).toFixed(5), "AUSD per MON");
await wait(await walletClient.writeContract({ address: d.priceSource, abi: KeeperPriceSourceAbi, functionName: "push", args: [d.base, d.settlement, midX18] }));

// 2. caller posts a long call (the keeper key doubles as caller here)
await wait(await walletClient.writeContract({
  address: d.callBook, abi: CallBookAbi, functionName: "postCall",
  args: [d.base, d.settlement, 0, (midX18 * 110n) / 100n, (midX18 * 95n) / 100n, 2000, 3600],
}));
const callId = (await publicClient.readContract({ address: d.callBook, abi: CallBookAbi, functionName: "callCount" })) as bigint - 1n;

// 3. follower vault, funded with 20 real AUSD from an existing holder
await rpc("anvil_setBalance", [FOLLOWER.address, "0x56BC75E2D63100000"]);
await wait(await follower.writeContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "createVault", args: [parseUnits("100", 6)] }));
const vault = (await publicClient.readContract({ address: d.factory, abi: VaultFactoryAbi, functionName: "vaultOf", args: [FOLLOWER.address] })) as Address;
await rpc("anvil_impersonateAccount", [AUSD_HOLDER]);
await rpc("anvil_setBalance", [AUSD_HOLDER, "0x56BC75E2D63100000"]);
const holder = createWalletClient({ chain, transport: http(chain.rpcUrls.default.http[0]), account: AUSD_HOLDER });
await wait(await holder.writeContract({ address: d.settlement, abi: DemoTokenAbi, functionName: "transfer", args: [vault, parseUnits("20", 6)] }));
console.log("vault", vault, "AUSD", formatUnits(await bal(d.settlement, vault), 6));

// 4. follow with 10 AUSD through Kuru Flow calldata built for the vault
const amountIn = parseUnits("10", 6);
const qBuy = await kuruQuote(vault, d.settlement, d.base, amountIn);
await wait(await follower.writeContract({
  address: vault, abi: FollowVaultAbi, functionName: "follow",
  args: [callId, amountIn, qBuy.to, qBuy.data, qBuy.minOut],
}));
const pos: any = await publicClient.readContract({ address: vault, abi: FollowVaultAbi, functionName: "getPosition", args: [0n] });
console.log("FOLLOWED via Kuru:", formatUnits(pos.baseAmount, 18), "WMON for", formatUnits(pos.cost, 6), "AUSD");

// 5. close through Kuru Flow
const qSell = await kuruQuote(vault, d.base, d.settlement, pos.baseAmount);
const closeHash = await follower.writeContract({
  address: vault, abi: FollowVaultAbi, functionName: "close",
  args: [0n, qSell.to, qSell.data, qSell.minOut],
});
const rc = await wait(closeHash);
console.log("CLOSED via Kuru:", rc.status, "· vault AUSD now", formatUnits(await bal(d.settlement, vault), 6));
console.log("netPnl with caller:", formatUnits((await publicClient.readContract({ address: vault, abi: FollowVaultAbi, functionName: "netPnl", args: [account.address] })) as bigint, 6), "AUSD (round-trip costs)");
