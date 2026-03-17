FROM oven/bun:1

# mediasoup native build deps (unavoidable)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential \
    && pip install --break-system-packages invoke \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all package.json files first for layer caching
# (bun install is the slow step — only re-runs when deps change)
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

RUN bun install

# Ensure mediasoup worker binary is built (bun may skip postinstall)
RUN cd node_modules/mediasoup && bun run postinstall 2>/dev/null || true

# Copy source (only server + packages, web excluded via .dockerignore)
COPY . .

EXPOSE 3000

CMD ["bun", "run", "--hot", "apps/server/src/index.ts"]
