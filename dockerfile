FROM node:20-alpine AS base
FROM rust:1-alpine AS wasm
RUN apk add --no-cache musl-dev build-base
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-pack
COPY wasm /app/wasm
WORKDIR /app/wasm
RUN wasm-pack build --target nodejs --out-dir /app/lib/wasm/pkg

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=wasm /app/lib/wasm/pkg ./lib/wasm/pkg

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN echo "SUPABASE_URL: $NEXT_PUBLIC_SUPABASE_URL"
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/next ./node_modules/next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ioredis ./node_modules/ioredis
COPY --from=builder /app/lib/wasm/pkg ./lib/wasm/pkg
RUN [ -d ".next/standalone/node_modules" ] && cp -r .next/standalone/node_modules/* ./node_modules/ 2>/dev/null || true; \
    [ -d "node_modules/next" ] || (echo "❌ NextJS not found." && exit 1); \
    [ -d "node_modules/ioredis" ] || (echo "⚠️ ioredis not found, but continuing.." && true)

USER nextjs

EXPOSE 3001
ENV PORT=3001

CMD ["node", "server.js"]