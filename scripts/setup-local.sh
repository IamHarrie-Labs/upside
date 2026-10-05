#!/usr/bin/env bash
# Deploys Upside to a running local Anvil node (port 8547) and verifies the demo caller "Ada".
# Start Anvil first:  anvil --port 8547
# Uses Anvil's public, well-known test keys only. Never put a real key here.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"

ANVIL_KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # deployer, keeper, attester
ADA=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                               # Anvil account 1

(cd contracts && DEMO=true forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 \
  --broadcast --private-key "$ANVIL_KEY0" | grep -E "SUCCESS|Error")
node scripts/export-abi.mjs
(cd keeper && KEEPER_KEY="$ANVIL_KEY0" npm run --silent attest -- "$ADA" 30)
echo "Now run the keeper:  cd keeper && KEEPER_KEY=$ANVIL_KEY0 npm start"
