# ---- Stage 1: WASM Builder ----
FROM rust:1-slim-bookworm AS wasm
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown \
    && curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

COPY wasm/Cargo.toml wasm/Cargo.lock* ./wasm/
RUN mkdir -p wasm/src && echo "fn main() {}" > wasm/src/main.rs \
    && cd wasm && cargo build --release --target wasm32-unknown-unknown || true

COPY wasm/src ./wasm/src
RUN cd wasm && wasm-pack build --release --target nodejs --out-dir /app/lib/wasm/pkg

# ---- Stage 2: Dependencies ----
FROM node:22-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --node-linker=hoisted

# ---- Stage 3: Builder ----
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml

COPY . .
COPY --from=wasm /app/lib/wasm/pkg ./lib/wasm/pkg

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1536"

ARG NEXT_PUBLIC_TURNSTILE_SITEKEY
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_TURNSTILE_SITEKEY=${NEXT_PUBLIC_TURNSTILE_SITEKEY}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p data && \
    wget -q -O data/GeoLite2-City.mmdb \
      "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"

RUN pnpm build

# ---- Stage 4: Runner ----
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=wasm --chown=nextjs:nodejs /app/lib/wasm/pkg ./lib/wasm/pkg
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs
EXPOSE 3001

CMD ["node", "server.js"]