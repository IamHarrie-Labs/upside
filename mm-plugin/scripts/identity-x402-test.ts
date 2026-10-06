// Checks the ERC-8004 and x402 paths against the real things, without spending anything:
//   1. ERC-8004: register an agent on a local fork of Monad testnet (the official IdentityRegistry), read the
//      Registered event, add the agent's own id to its registration, then read it back the way `agent show` does.
//   2. x402: ask Nansen for Smart Money trades on Monad and sign the USDC payment with a fresh, empty key.
//      Expected: Nansen's facilitator verifies the signature and rejects it only for insufficient funds.
//
//   anvil --fork-url https://testnet-rpc.monad.xyz --chain-id 10143 --port 8549
//   cd mm-plugin && npx tsx scripts/identity-x402-test.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { UpsideError, type Host } from "../src/core.js";
import { getAgent, registerAgent, registrationFile, savedAgentId, updateAgentUri } from "../src/erc8004.js";
import { nansenSmartMoney } from "../src/x402.js";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8549";
process.env.UPSIDE_STATE_DIR = mkdtempSync(join(tmpdir(), "upside-agent-"));

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

async function erc8004() {
  console.log("ERC-8004 on a fork of Monad testnet");
  const chain = { id: 10143, name: "monad-testnet-fork", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [FORK] } } } as const;
  const read = createPublicClient({ chain, transport: http(FORK) }) as PublicClient;
  // A fresh key funded on the fork stands in for the Agent Wallet. (Anvil's well-known test addresses carry
  // contract code on Monad, and the registry's _safeMint refuses them; `agent register` checks for that.)
  const w = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain, transport: http(FORK) });
  await read.request({ method: "anvil_setBalance" as any, params: [w.account.address, "0x56BC75E2D63100000"] as any });
  const h: Host = {
    chainId: 10143,
    d: {} as any,
    read,
    account: w.account.address,
    log: (m) => console.log("   ", m),
    async submit(tx, summary) {
      console.log(`    intent: ${summary}`);
      const hash = await w.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
      const r = await read.waitForTransactionReceipt({ hash });
      return { hash, status: r.status === "success" ? "confirmed" : "reverted" };
    },
  };
  const mandate = { perCall: "10.00", dailyBudget: "50.00", maxFeePct: 20, minScored: 3, minWinRatePct: 50, minAvgReturnPct: 0, maxAgeMin: 15, verifiedOnly: true };
  const base = { name: "Upside test follower", chainId: 10143, owner: h.account, vault: null, mandate };
  const reg = await registerAgent(h, registrationFile(base));
  // The code check: Anvil key #4 has code on Monad and is refused before anything is sent.
  const coded: Host = { ...h, account: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" };
  const sent = await registerAgent(coded, registrationFile({ ...base, owner: coded.account })).then(
    () => "sent",
    (e) => (e as UpsideError).code,
  );
  check(sent === "AGENT_WALLET_CANNOT_RECEIVE_NFT", `refuses a wallet whose code rejects ERC-721s (${sent})`);
  check(Number.isInteger(reg.agentId) && reg.agentId >= 0, `registered agent #${reg.agentId} (id from the Registered event)`);
  check(savedAgentId(h) === reg.agentId, "agent id saved for autopilot");
  await updateAgentUri(h, reg.agentId, registrationFile({ ...base, agentId: reg.agentId }));

  const a = await getAgent(read, 10143, reg.agentId);
  const r: any = a.registration;
  check(a.owner.toLowerCase() === h.account.toLowerCase(), "ownerOf is the wallet");
  check(a.agentWallet.toLowerCase() === h.account.toLowerCase(), `getAgentWallet is the wallet (${a.agentWallet})`);
  check(a.uri.startsWith("data:application/json;base64,"), "tokenURI is a base64 data URI");
  check(r?.type === "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", "registration decodes as ERC-8004 registration-v1");
  check(r?.registrations?.[0]?.agentId === reg.agentId && r.registrations[0].agentRegistry === `eip155:10143:${reg.registry}`, "registration lists its own agentId and registry");
  check(r?.upside?.mandate?.perCall === "10.00" && r.upside.mandate.dailyBudget === "50.00", "mandate round-trips");
}

async function x402() {
  console.log("\nx402: Nansen Smart Money on Monad, paid by an empty throwaway key");
  const acct = privateKeyToAccount(generatePrivateKey());
  let signed = 0;
  const signer = {
    address: acct.address,
    async signTypedData(td: any): Promise<Hex> {
      signed++;
      console.log(`    sign ${td.primaryType} on chain ${td.domain.chainId}: ${Number(td.message.value) / 1e6} ${td.domain.name} to ${td.message.to}`);
      return acct.signTypedData(td);
    },
  };
  try {
    await nansenSmartMoney(signer, { maxUsd: 0.01, log: (m) => console.log("   ", m) });
    check(false, "price cap refuses a $0.05 request when the cap is $0.01");
  } catch (e) {
    check(e instanceof UpsideError && e.code === "PRICE_TOO_HIGH" && signed === 0, `price cap refuses before signing (${(e as Error).message})`);
  }
  try {
    await nansenSmartMoney(signer, { maxUsd: 0.1, log: (m) => console.log("   ", m) });
    check(false, "an empty wallet can't pay");
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`    → ${msg}`);
    check(signed === 1, "signed exactly one USDC authorization (EIP-3009 typed data)");
    check(e instanceof UpsideError && e.code === "X402_REJECTED" && /insufficient|balance|fund/i.test(msg), "facilitator rejects only for insufficient funds");
  }
}

await erc8004().catch((e) => {
  console.error(e);
  failures++;
});
await x402().catch((e) => {
  console.error(e);
  failures++;
});
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
