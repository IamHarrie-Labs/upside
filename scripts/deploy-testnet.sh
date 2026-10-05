#!/usr/bin/env bash
# Deploys Upside (demo venue) to Monad testnet, exports ABIs, fills the indexer config,
# verifies a caller and gives it a handle.
#
#   export DEPLOYER_KEY=0x...        # a fresh wallet funded with testnet MON. Never commit it.
#   bash scripts/deploy-testnet.sh [verifiedCallerAddress]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
RPC=https://testnet-rpc.monad.xyz

: "${DEPLOYER_KEY:?Set DEPLOYER_KEY to your testnet deployer private key}"
ADDR=$(cast wallet address --private-key "$DEPLOYER_KEY")
BAL=$(cast balance "$ADDR" --rpc-url "$RPC" --ether)
echo "deployer $ADDR has $BAL MON on testnet"
if [ "$(echo "$BAL < 0.5" | bc -l 2>/dev/null || python -c "print(int($BAL < 0.5))")" = "1" ]; then
  echo "Need at least 0.5 testnet MON. Use the Monad testnet faucet first."; exit 1
fi

(cd contracts && DEMO=true forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow \
  --private-key "$DEPLOYER_KEY" | grep -E "^\s+[A-Z]|SUCCESS|Error")
node scripts/export-abi.mjs
node scripts/indexer-config.mjs 10143

CALLER=${1:-$ADDR}
(cd keeper && CHAIN_ID=10143 RPC_URL="$RPC" KEEPER_KEY="$DEPLOYER_KEY" npm run --silent attest -- "$CALLER" 30)

echo
echo "Deployed. Next:"
echo "  keeper: cd keeper && CHAIN_ID=10143 RPC_URL=$RPC KEEPER_KEY=\$DEPLOYER_KEY npm start"
echo "  app:    cd app && VITE_CHAIN_ID=10143 npm run build   (then host app/dist on any HTTPS host)"
echo "  commit contracts/deployments/10143.json so the hosted app can find the addresses"
