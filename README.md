# Upside

**Trading calls you only pay for when you profit.** Built on Monad for Metropolis 2026 (Track 03: Social, Attention & Culture).

Paid signal groups charge whether you win or lose, and their track records are screenshots. On Upside:

1. **Every call is committed onchain before the move.** It can't be edited, backdated or deleted, and it expires.
2. **Callers are paid only from a follower's net gains.** Each follower trades through their own vault. When they close, the caller gets a share of the follower's *cumulative* net gain with that caller above a high-water mark. A follower who is still down with a caller pays nothing.
3. **Scores come from market prices, not followers.** A call is scored from the order-book mid when it was posted to the mid at expiry, losers included. Fake followers, reviews and recycled capital don't move the score.
4. **Only verified callers rank and earn.** A caller is verified when they hold an active Cleanverse A-Pass.

## What's here

| Folder | What it is |
| --- | --- |
| `contracts/` | Foundry project: `CallBook`, `FollowVault`, `VaultFactory`, `UpsideConfig`, `AttestedGate`, `KeeperPriceSource`, plus testnet-only `demo/` contracts. 15 tests. |
| `app/` | Mobile-first web app (Vite + React + viem). Passkey accounts via [Mera](https://mera.category.xyz). Also hosts the passkey association files. |
| `mobile/` | Native iOS/Android app (Expo SDK 57) sharing the same contract logic; installable Android APK via EAS. See `mobile/README.md`. |
| `mm-plugin/` | MetaMask Agent Wallet plugin (`mm upside …`): an AI agent with an ERC-8004 identity follows verified callers within your rules, your vault's onchain cap and your Agent Wallet policy, and pays for Nansen intel over x402. See `mm-plugin/README.md`. |
| `keeper/` | Keeps the order-book mid fresh onchain, scores expired calls, and attests verified callers. |
| `indexer/` | Envio HyperIndex config, schema and handlers for the feed, caller records and settlements. |
| `scripts/` | ABI export and the one-command local setup. |

## How the money moves

```
caller ──postCall──▶ CallBook (entry mid from price source, expiry)
follower ──follow──▶ FollowVault ──swap──▶ router (Kuru Flow on mainnet; DemoRouter on testnet)
follower ──close───▶ FollowVault ──swap──▶ router
                         └─ pnl → netPnl[caller]; fee = feeBps × (net − highWater) if positive and caller verified
                              ├─ caller fee → caller
                              └─ protocol cut (10% of fee) → treasury
keeper ──scoreCall──▶ CallBook (exit mid, return in bps, caller record)
```

Protections, each covered by a test:

- **Losses come first:** the high-water mark is tracked per follower–caller pair (`test_highWaterMark_lossesRecoveredFirst`).
- **No dodging the fee:** a vault can only swap through allowlisted routers, and both fills must land within `maxSlippageBps` of the mid. That blocks routing sale proceeds to another address (`test_redirectingProceedsReverts`).
- **Base tokens stay put:** tokens backing an open position can't be withdrawn, so a follower can't exit outside the vault (`test_lockedBaseCannotBeWithdrawn`).
- **Exposure limit:** each vault refuses follows beyond its own limit (`test_exposureLimit`).
- **Fake followers don't count:** scores read only market mids (`test_fakeFollowersDoNotMoveScore`).
- **Unverified callers earn $0:** the high-water mark still advances for them, so nothing is charged retroactively if they get verified later (`test_unverifiedCallerEarnsNothing`).
- **Liquid pairs only:** calls can only be posted on allowlisted pairs.

## Run it locally (5 minutes)

Requires Node 20+ and [Foundry](https://getfoundry.sh).

```bash
# 0. contract dependencies (first time only)
cd contracts && forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git && cd ..

# 1. local chain
anvil --port 8547

# 2. in another terminal: deploy demo contracts, export ABIs, verify the demo caller "Ada"
bash scripts/setup-local.sh

# 3. keeper (Anvil's public test key #0)
cd keeper && npm install && KEEPER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 INTERVAL_MS=3000 npm start

# 4. app
cd app && npm install && npm run dev   # http://localhost:5173
```

On a local chain, the sign-in screen offers three demo accounts: **Ada** (verified caller), **Sybil Farm** (unverified caller) and **Femi** (follower). Post a 2-minute call as Ada, follow it as Femi, then close. The keeper scores the call when it expires.

Tests: `cd contracts && forge test`.

## Deploy to Monad testnet

```bash
cd contracts
DEMO=true forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
cd .. && node scripts/export-abi.mjs
cd keeper && RPC_URL=https://testnet-rpc.monad.xyz CHAIN_ID=10143 KEEPER_KEY=$DEPLOYER_KEY npm start
cd ../app && VITE_CHAIN_ID=10143 npm run dev
```

**Live on Monad testnet** (chain 10143): CallBook `0x618861b1935bc2C2dB6d7F75cA6F3dfC81aac317`, VaultFactory `0x056426DE47B68b55D9049F373a5bF72436D8ab49`, AttestedGate `0x4894539218Fa5D838Bef29B7658f959aFB63F99b`, KeeperPriceSource `0x1255E1b9bc0351ea4527aE54dF182aec39f9A941`. All addresses are in `contracts/deployments/10143.json`.

The keeper pushes prices on demand, because each push costs gas (about 0.005 MON on testnet). It pushes every `PUSH_MS` (30s) while an app or the MetaMask plugin has pinged `POST /poke` in the last 5 minutes, and otherwise only right before scoring an expired call. With nobody using Upside it sends nothing. `ALWAYS_ON=1` restores constant pushing.

Testnet uses demo tokens and a `DemoRouter` that fills at the keeper's mid, so the full loop can be shown without testnet liquidity. Fund the deployer with testnet MON first. Passkeys need HTTPS or `localhost`; for phones, deploy the built `app/dist` to any HTTPS host.

## Mainnet fork check (real Kuru liquidity, no real money)

```bash
anvil --fork-url https://rpc.monad.xyz --chain-id 31338 --port 8548
cd contracts && DEMO=false SETTLEMENT_TOKEN=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a   BASE_TOKEN=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A ROUTER=0xb3e6778480b2E488385E8205eA05E20060B813cb   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8548 --broadcast --slow --private-key <anvil key 0>
cd .. && node scripts/export-abi.mjs
cd keeper && CHAIN_ID=31338 RPC_URL=http://127.0.0.1:8548 KEEPER_KEY=<anvil key 0> npx tsx src/fork-test.ts
```

## Mainnet

`DEMO=false` with `SETTLEMENT_TOKEN` (AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`), `BASE_TOKEN` and `ROUTER` (`0xb3e6778480b2E488385E8205eA05E20060B813cb`, the Kuru Flow router). Base token WMON is `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`. The keeper then prices from Kuru quotes and serves a quote proxy on `:8788` (Kuru Flow needs a JWT per address, 1 request/second); set `VITE_KEEPER_API` (web) / `EXPO_PUBLIC_KEEPER_API` (mobile) to its public URL. The same API serves Perpl's market context; `VITE_PERPL_NETWORK` / `EXPO_PUBLIC_PERPL_NETWORK` choose which Perpl exchange the badge reads (defaults to the deployment's chain).

## Sponsor integrations

| Sponsor | Where | Status |
| --- | --- | --- |
| **Agora (AUSD)** | Settlement token for every vault, fee and payout | Contracts parameterised on AUSD; demo uses a 6-decimal stand-in |
| **Kuru** | Spot execution via Kuru Flow quotes (router `0xb3e6778480b2E488385E8205eA05E20060B813cb`); mid used for scoring | **Verified on a mainnet fork:** a FollowVault bought 322.2 WMON for 10 AUSD and sold back for 9.993 AUSD with live Kuru Flow calldata (`keeper/src/fork-test.ts`). Testnet uses DemoRouter. |
| **Mera (Monad Foundation)** | Passkey sign-up and sign-in; PRF output → BIP-44 account → `toViemAccount` signing session | Implemented (`app/src/lib/account.ts`) |
| **Cleanverse** | `AttestedGate`: the keeper attests callers with an active A-Pass (`keeper/src/attest.ts`, `CLEANVERSE_MODE=api`) | API path written, untested without credentials; `mock` mode for demos |
| **Envio** | `indexer/` (HyperIndex v3): calls, caller records, vaults, follows and settlements; vaults registered dynamically from `VaultCreated` | Written for v3; `node scripts/indexer-config.mjs <chainId>` fills addresses. Not yet run: the Envio CLI has no native Windows build, so run it in WSL or Envio's hosted service |
| **Perpl** | "Skin in the game" badge on every call and caller profile: whether the caller holds MON on Perpl right now, long or short, entry and P&L, flagged when it's the opposite of their public call. Market metadata from Perpl's public API (`/api/v1/pub/context`, via the keeper because it lacks CORS); positions read from Perpl's Exchange contract (`getAccountByAddr`, `getPosition`) | **Verified against Perpl mainnet:** real long and short MON positions render in both apps (`app/src/lib/perpl.ts`) |
| **Nansen** | Caller intelligence: a "Nansen · Smart Trader" chip on calls and the full label list on caller profiles. The keeper either uses `NANSEN_API_KEY` (`/api/v1/profiler/address/labels`, chain `monad`) or pays per call with **USDC on Monad via x402** (`NANSEN_PAY=1`; `/api/v1/smart-money/dex-trades` on Monad, $0.05, refreshed every `NANSEN_REFRESH_MIN`) | x402 flow verified up to settlement on Monad: Nansen's 402 terms accept `eip155:143` USDC, the keeper signs, and Monad's facilitator verifies (rejected only for zero balance in the test wallet). Fund the paying wallet with a few cents of USDC on Monad, or set an API key. UI checked with local-only mock labels (`NANSEN_MOCK`) |
| **MetaMask** | Agent Wallet plugin `mm-plugin-upside`: `mm upside calls / caller / vault / deposit / follow / close / autopilot`, plus an agent skill (`mm-plugin/skills/upside/SKILL.md`). An agent can follow a call only when four layers allow it: the caller's onchain record, the user's rules (verified, record, fee, freshness, per-call size, daily budget), the vault's onchain exposure cap, and the Agent Wallet policy. Writes go through `ctx.walletExecutor` with a human-readable intent. **ERC-8004:** `mm upside agent register / show` publishes the agent's mandate in the official IdentityRegistry on Monad (`register(string)` with a base64 data URI, id from `Registered`; `ownerOf`, `tokenURI`, `getAgentWallet`). **x402:** `mm upside intel` and `--smart-money-only` pay Nansen $0.05 USDC on Monad, with the EIP-712 authorization signed by the Agent Wallet (`x402HTTPClient` + `registerExactEvmScheme`) | Installs into `mm` 7.0.0; read commands run there against live chain data. Autopilot verified on Anvil (13 checks). ERC-8004 registration verified against the real registry on a Monad testnet fork; x402 verified up to Nansen's facilitator (rejected only for an empty test wallet). Signing through a real Agent Wallet needs the user's `mm login` |

## Known limits (honest list)

- **Prices are keeper-posted.** `KeeperPriceSource` takes the mid from a keeper with a 10-minute staleness limit. A Kuru orderbook adapter can replace it, since `CallBook` accepts any `IPriceSource`.
- **Scoring runs when the keeper calls it.** Scoring happens at the first `scoreCall` after expiry, which is anyone's to send. The keeper scores within seconds.
- **The fee rate follows the closing call.** `feeBps` applies per closing call, while net and the high-water mark are tracked per caller.
- **Spot and long only.** Shorts and perps (Perpl) come later.
- **Not audited.** Hackathon code.
