# Upside keeper. Build from the repo root:
#   docker build -f deploy/keeper.Dockerfile -t upside-keeper .
# Secrets (KEEPER_KEY) come from --env-file at run time, never from the image.
FROM node:22-slim
WORKDIR /app
COPY keeper/package.json keeper/package-lock.json keeper/
RUN cd keeper && npm ci --omit=optional --no-audit --no-fund
COPY keeper/src keeper/src
COPY contracts/deployments contracts/deployments
WORKDIR /app/keeper
ENV NODE_ENV=production PROXY_PORT=8788
EXPOSE 8788
USER node
CMD ["npx", "tsx", "src/keeper.ts"]
