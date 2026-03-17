## Stage 1: Prune the monorepo for the server workspace
FROM oven/bun:1 AS pruner
RUN bun add -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune server --docker

## Stage 2: Install dependencies + build mediasoup worker
FROM oven/bun:1 AS builder

# Install system deps for mediasoup native build
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --break-system-packages invoke

WORKDIR /app

# Install deps from pruned lockfile + package.jsons only (cache layer)
COPY --from=pruner /app/out/json/ .
RUN bun install

# Run mediasoup postinstall to download/build the worker binary
RUN MEDIASOUP_DIR=$(find node_modules -path "*/mediasoup/npm-scripts.mjs" -exec dirname {} \; | head -1) \
    && cd "$MEDIASOUP_DIR" && node npm-scripts.mjs postinstall

# Copy pruned source
COPY --from=pruner /app/out/full/ .

## Stage 3: Run
FROM builder AS runner
WORKDIR /app

EXPOSE 3000

CMD ["bun", "run", "--hot", "apps/server/src/index.ts"]
