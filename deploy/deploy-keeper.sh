#!/usr/bin/env bash
# Deploys the keeper to a VPS running Docker and Caddy (sites imported from /etc/caddy/sites/*.Caddyfile).
#
#   VPS=root@38.49.210.22 SSH_KEY=~/.ssh/prepai_vps KEEPER_HOST=keeper.38.49.210.22.sslip.io \
#   ALLOWED_ORIGIN=https://upside.vercel.app bash deploy/deploy-keeper.sh
#
# The keeper's private key lives only in /etc/upside/keeper.env on the VPS (mode 600). On first deploy it is
# created from .env.deploy (DEPLOYER_KEY) if present; the key is streamed over SSH and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VPS:?VPS=user@host}" "${KEEPER_HOST:?KEEPER_HOST=keeper.example.com}"
SSH_KEY=${SSH_KEY:-}
CHAIN_ID=${CHAIN_ID:-10143}
RPC_URL=${RPC_URL:-https://testnet-rpc.monad.xyz}
ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-*}
MAX_DAILY_MON=${MAX_DAILY_MON:-1}
ssh_() { ssh -o BatchMode=yes ${SSH_KEY:+-i "$SSH_KEY"} "$VPS" "$@"; }

echo "→ uploading keeper source to $VPS:/opt/upside"
tar czf - deploy/keeper.Dockerfile keeper/package.json keeper/package-lock.json keeper/src contracts/deployments \
  | ssh_ 'mkdir -p /opt/upside && rm -rf /opt/upside/keeper/src && tar xzf - -C /opt/upside'

echo "→ keeper settings (/etc/upside/keeper.env)"
ssh_ 'mkdir -p /etc/upside && touch /etc/upside/keeper.env && chmod 600 /etc/upside/keeper.env'
if ! ssh_ 'grep -q "^KEEPER_KEY=0x[0-9a-fA-F]\{64\}" /etc/upside/keeper.env'; then
  [ -f .env.deploy ] || { echo "No KEEPER_KEY on the VPS and no .env.deploy here."; exit 1; }
  K=$(grep '^DEPLOYER_KEY=' .env.deploy | cut -d= -f2- | tr -d '\r[:space:]')
  case "$K" in 0x*) ;; *) K="0x$K" ;; esac
  printf 'KEEPER_KEY=%s\n' "$K" | ssh_ 'cat >> /etc/upside/keeper.env'
  unset K
  echo "  stored KEEPER_KEY (not printed)"
fi
# Non-secret settings are rewritten on every deploy.
ssh_ "sed -i '/^\(CHAIN_ID\|RPC_URL\|ALLOWED_ORIGIN\|MAX_DAILY_MON\|FLOW_STATE\)=/d' /etc/upside/keeper.env && cat >> /etc/upside/keeper.env" <<EOF
CHAIN_ID=$CHAIN_ID
RPC_URL=$RPC_URL
ALLOWED_ORIGIN=$ALLOWED_ORIGIN
MAX_DAILY_MON=$MAX_DAILY_MON
FLOW_STATE=/data/flow-$CHAIN_ID.json
EOF
# Keeper state (follower-count scan cursor) survives restarts; the container runs as uid 1000 (node).
ssh_ 'mkdir -p /opt/upside/data && chown 1000:1000 /opt/upside/data'

echo "→ building and (re)starting the container"
ssh_ 'cd /opt/upside && docker build -q -f deploy/keeper.Dockerfile -t upside-keeper . >/dev/null \
  && (docker rm -f upside-keeper >/dev/null 2>&1 || true) \
  && docker run -d --name upside-keeper --restart unless-stopped --env-file /etc/upside/keeper.env \
       -p 127.0.0.1:8788:8788 -v /opt/upside/data:/data --log-opt max-size=10m --log-opt max-file=3 upside-keeper >/dev/null'

echo "→ Caddy site $KEEPER_HOST"
sed "s/KEEPER_HOST/$KEEPER_HOST/" deploy/upside-keeper.Caddyfile | ssh_ 'cat > /etc/caddy/sites/upside-keeper.Caddyfile'
# Validate with the Caddy service's own environment files, since other sites may use {$ENV} placeholders.
ssh_ 'set -a; for f in $(systemctl show caddy -p EnvironmentFiles --value | grep -o "/[^ ]*"); do . "$f"; done; set +a
      caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy' \
  || { echo "Caddy config invalid; removing the new site file"; ssh_ 'rm -f /etc/caddy/sites/upside-keeper.Caddyfile'; exit 1; }

sleep 8
ssh_ 'docker logs --tail 5 upside-keeper 2>&1' | sed -E 's/0x[0-9a-fA-F]{64}/[key]/g'
echo "→ https://$KEEPER_HOST/poke:"
curl -s -X POST "https://$KEEPER_HOST/poke"; echo
