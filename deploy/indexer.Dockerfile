# Upside Envio HyperIndex indexer. Build context: indexer/
# Based on Envio's self-hosting example (github.com/enviodev/local-docker-example).
FROM node:24-slim

# psql is used by envio for its effects cache; ca-certificates lets its native (Rust) core verify HTTPS RPCs.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.7.1

WORKDIR /envio-indexer
COPY package.json ./
RUN pnpm install

COPY config.yaml schema.graphql tsconfig.json ./
RUN pnpm envio codegen

COPY src ./src

CMD ["pnpm", "envio", "start"]
