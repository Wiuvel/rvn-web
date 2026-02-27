# ---- Stage 1: WASM Builder ----
FROM rust:1-slim-bookworm AS wasm
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown

COPY wasm/Cargo.toml wasm/Cargo.lock* ./wasm/
RUN mkdir -p wasm/src && echo "fn main() {}" > wasm/src/main.rs \
    && cd wasm && cargo build --release --target wasm32-unknown-unknown || true

COPY wasm/src ./wasm/src
RUN cd wasm && cargo build --release --target wasm32-unknown-unknown \
    && mkdir -p /app/lib/wasm/pkg \
    && cp target/wasm32-unknown-unknown/release/*.wasm /app/lib/wasm/pkg/

# ---- Stage 2: Dependencies ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 3: Builder ----
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

COPY . .
COPY --from=wasm /app/lib/wasm/pkg ./lib/wasm/pkg

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1536"

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

RUN npm run build

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
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./

COPY --from=builder --chown=nextjs:nodejs /app/node_modules/next ./node_modules/next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ioredis ./node_modules/ioredis
COPY --from=wasm --chown=nextjs:nodejs /app/lib/wasm/pkg ./lib/wasm/pkg

RUN if [ -d .next/standalone/node_modules ]; then cp -r .next/standalone/node_modules/* ./node_modules/ 2>/dev/null || true; fi

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]