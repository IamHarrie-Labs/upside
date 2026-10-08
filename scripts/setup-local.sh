#!/usr/bin/env bash
# Deploys Upside to a running local Anvil node (port 8547) and verifies the demo caller "Ada".
# Start Anvil first:  anvil --port 8547
# Uses Anvil's public, well-known test keys only. Never put a real key here.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
RPC_URL=${UPSIDE_RPC_URL:-http://127.0.0.1:8547}

ANVIL_KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # deployer, keeper, attester
ADA=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                               # Anvil account 1

(cd contracts && DEMO=true forge script script/Deploy.s.sol --rpc-url "$RPC_URL" \
  --broadcast --private-key "$ANVIL_KEY0" | grep -E "SUCCESS|Error")
node scripts/export-abi.mjs
(cd keeper && RPC_URL="$RPC_URL" CLEANVERSE_MODE=mock KEEPER_KEY="$ANVIL_KEY0" npm run --silent attest -- "$ADA" 30)
# public handles for the three demo accounts (Anvil keys 1-3)
HANDLES=$(node -e "console.log(require('./contracts/deployments/31337.json').handles)")
cast send "$HANDLES" "setHandle(string)" ada --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d --rpc-url "$RPC_URL" >/dev/null
cast send "$HANDLES" "setHandle(string)" sybil_farm --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a --rpc-url "$RPC_URL" >/dev/null
cast send "$HANDLES" "setHandle(string)" femi --private-key 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 --rpc-url "$RPC_URL" >/dev/null
echo "handles set: @ada @sybil_farm @femi"
echo "Now run the keeper:  cd keeper && KEEPER_KEY=$ANVIL_KEY0 npm start"
