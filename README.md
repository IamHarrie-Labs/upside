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
| `app/` | Mobile-first web app (Vite + React + viem). Passkey accounts via [Mera](https://mera.category.xyz). |
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

Testnet uses demo tokens and a `DemoRouter` that fills at the keeper's mid, so the full loop can be shown without testnet liquidity. Fund the deployer with testnet MON first. Passkeys need HTTPS or `localhost`; for phones, deploy the built `app/dist` to any HTTPS host.

## Mainnet fork check (real Kuru liquidity, no real money)

```bash
anvil --fork-url https://rpc.monad.xyz --chain-id 31338 --port 8548
cd contracts && DEMO=false SETTLEMENT_TOKEN=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a   BASE_TOKEN=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A ROUTER=0xb3e6778480b2E488385E8205eA05E20060B813cb   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8548 --broadcast --slow --private-key <anvil key 0>
cd .. && node scripts/export-abi.mjs
cd keeper && CHAIN_ID=31338 RPC_URL=http://127.0.0.1:8548 KEEPER_KEY=<anvil key 0> npx tsx src/fork-test.ts
```

## Mainnet

`DEMO=false` with `SETTLEMENT_TOKEN` (AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`), `BASE_TOKEN` and `ROUTER` (`0xb3e6778480b2E488385E8205eA05E20060B813cb`, the Kuru Flow router). Base token WMON is `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`. The keeper then prices from Kuru quotes and serves a quote proxy on `:8788` (Kuru Flow needs a JWT per address, 1 request/second); set `VITE_KURU_PROXY` to its public URL.

## Sponsor integrations

| Sponsor | Where | Status |
| --- | --- | --- |
| **Agora (AUSD)** | Settlement token for every vault, fee and payout | Contracts parameterised on AUSD; demo uses a 6-decimal stand-in |
| **Kuru** | Spot execution via Kuru Flow quotes (router `0xb3e6778480b2E488385E8205eA05E20060B813cb`); mid used for scoring | **Verified on a mainnet fork:** a FollowVault bought 322.2 WMON for 10 AUSD and sold back for 9.993 AUSD with live Kuru Flow calldata (`keeper/src/fork-test.ts`). Testnet uses DemoRouter. |
| **Mera (Monad Foundation)** | Passkey sign-up and sign-in; PRF output → BIP-44 account → `toViemAccount` signing session | Implemented (`app/src/lib/account.ts`) |
| **Cleanverse** | `AttestedGate`: the keeper attests callers with an active A-Pass (`keeper/src/attest.ts`, `CLEANVERSE_MODE=api`) | API path written, untested without credentials; `mock` mode for demos |
| **Envio** | `indexer/` config, schema and handlers | Written; run `envio codegen` and fill addresses |
| Perpl, Nansen, MetaMask agent plugin | Planned stretch | Not started |

## Known limits (honest list)

- **Prices are keeper-posted.** `KeeperPriceSource` takes the mid from a keeper with a 10-minute staleness limit. A Kuru orderbook adapter can replace it, since `CallBook` accepts any `IPriceSource`.
- **Scoring runs when the keeper calls it.** Scoring happens at the first `scoreCall` after expiry, which is anyone's to send. The keeper scores within seconds.
- **The fee rate follows the closing call.** `feeBps` applies per closing call, while net and the high-water mark are tracked per caller.
- **Spot and long only.** Shorts and perps (Perpl) come later.
- **Not audited.** Hackathon code.
