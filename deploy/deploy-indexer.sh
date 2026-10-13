#!/usr/bin/env bash
# Deploys the Envio HyperIndex indexer to a VPS with Docker and Caddy (no Docker Compose needed):
#   upside-indexer-pg      Postgres 17 (volume upside-indexer-pg)
#   upside-indexer-hasura  Hasura GraphQL on 127.0.0.1:8090, public read-only role
#   upside-indexer         envio start
#
#   VPS=root@38.49.210.22 SSH_KEY=~/.ssh/prepai_vps INDEXER_HOST=indexer.38.49.210.22.sslip.io \
#   bash deploy/deploy-indexer.sh
#
# Secrets (Postgres password, Hasura admin secret, optional ENVIO_API_TOKEN) live only in /etc/upside/indexer.env
# on the VPS, generated there on first deploy. Nothing secret is printed or committed.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VPS:?VPS=user@host}" "${INDEXER_HOST:?INDEXER_HOST=indexer.example.com}"
SSH_KEY=${SSH_KEY:-}
ssh_() { ssh -o BatchMode=yes ${SSH_KEY:+-i "$SSH_KEY"} "$VPS" "$@"; }

echo "→ uploading indexer to $VPS:/opt/upside/indexer"
tar czf - -C indexer config.yaml schema.graphql tsconfig.json package.json src \
  | ssh_ 'rm -rf /opt/upside/indexer && mkdir -p /opt/upside/indexer && tar xzf - -C /opt/upside/indexer'
ssh_ 'cat > /opt/upside/indexer/Dockerfile' < deploy/indexer.Dockerfile

echo "→ secrets (/etc/upside/indexer.env, generated once on the VPS)"
ssh_ 'mkdir -p /etc/upside && f=/etc/upside/indexer.env && touch $f && chmod 600 $f
  grep -q "^ENVIO_PG_PASSWORD=" $f || echo "ENVIO_PG_PASSWORD=$(openssl rand -hex 24)" >> $f
  grep -q "^HASURA_GRAPHQL_ADMIN_SECRET=" $f || echo "HASURA_GRAPHQL_ADMIN_SECRET=$(openssl rand -hex 24)" >> $f'

echo "→ network, Postgres, Hasura"
ssh_ 'set -e; set -a; . /etc/upside/indexer.env; set +a
  docker network inspect upside-indexer >/dev/null 2>&1 || docker network create upside-indexer >/dev/null
  if ! docker ps -a --format "{{.Names}}" | grep -qx upside-indexer-pg; then
    docker run -d --name upside-indexer-pg --network upside-indexer --restart unless-stopped \
      -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$ENVIO_PG_PASSWORD" -e POSTGRES_DB=envio \
      -v upside-indexer-pg:/var/lib/postgresql/data --log-opt max-size=10m postgres:17.5 >/dev/null
  fi
  for i in $(seq 1 30); do docker exec upside-indexer-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
  if ! docker ps -a --format "{{.Names}}" | grep -qx upside-indexer-hasura; then
    docker run -d --name upside-indexer-hasura --network upside-indexer --restart unless-stopped \
      -p 127.0.0.1:8090:8080 \
      -e HASURA_GRAPHQL_DATABASE_URL="postgres://postgres:$ENVIO_PG_PASSWORD@upside-indexer-pg:5432/envio" \
      -e HASURA_GRAPHQL_ADMIN_SECRET="$HASURA_GRAPHQL_ADMIN_SECRET" \
      -e HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public -e HASURA_GRAPHQL_ENABLE_CONSOLE=false \
      -e HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true -e HASURA_GRAPHQL_NO_OF_RETRIES=10 \
      --log-opt max-size=10m hasura/graphql-engine:v2.43.0 >/dev/null
  fi
  for i in $(seq 1 60); do curl -sf http://127.0.0.1:8090/healthz >/dev/null && break; sleep 2; done'

echo "→ building and (re)starting the indexer"
ssh_ 'set -e; set -a; . /etc/upside/indexer.env; set +a
  cd /opt/upside/indexer && docker build -q -t upside-indexer . >/dev/null
  docker rm -f upside-indexer >/dev/null 2>&1 || true
  docker run -d --name upside-indexer --network upside-indexer --restart unless-stopped --memory 800m \
    -e ENVIO_PG_HOST=upside-indexer-pg -e ENVIO_PG_PORT=5432 -e ENVIO_PG_USER=postgres \
    -e ENVIO_PG_PASSWORD="$ENVIO_PG_PASSWORD" -e ENVIO_PG_DATABASE=envio -e ENVIO_PG_PUBLIC_SCHEMA=envio \
    -e HASURA_GRAPHQL_ENDPOINT=http://upside-indexer-hasura:8080/v1/metadata \
    -e HASURA_GRAPHQL_ADMIN_SECRET="$HASURA_GRAPHQL_ADMIN_SECRET" \
    -e HASURA_SERVICE_HOST=upside-indexer-hasura -e HASURA_SERVICE_PORT=8080 \
    -e ENVIO_INDEXER_HOST=0.0.0.0 -e ENVIO_INDEXER_PORT=9898 -e TUI_OFF=true \
    -e LOG_LEVEL=info -e LOG_STRATEGY=console-pretty ${ENVIO_API_TOKEN:+-e ENVIO_API_TOKEN="$ENVIO_API_TOKEN"} \
    --log-opt max-size=10m --log-opt max-file=3 upside-indexer >/dev/null'

echo "→ Caddy site $INDEXER_HOST"
sed "s/INDEXER_HOST/$INDEXER_HOST/" deploy/upside-indexer.Caddyfile | ssh_ 'cat > /etc/caddy/sites/upside-indexer.Caddyfile'
ssh_ 'set -a; for f in $(systemctl show caddy -p EnvironmentFiles --value | grep -o "/[^ ]*"); do . "$f"; done; set +a
      caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy' \
  || { echo "Caddy config invalid; removing the new site file"; ssh_ 'rm -f /etc/caddy/sites/upside-indexer.Caddyfile'; exit 1; }

sleep 15
ssh_ 'docker logs --tail 15 upside-indexer 2>&1'
