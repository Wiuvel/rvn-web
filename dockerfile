FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN echo "SUPABASE_URL: $NEXT_PUBLIC_SUPABASE_URL"
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Копируем standalone сборку
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./
# В standalone режиме Next.js создает node_modules в .next/standalone/node_modules
# Копируем их в корень для доступа к Next.js и другим зависимостям
# Также копируем Next.js из builder, если его нет в standalone
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/next ./node_modules/next
RUN if [ -d ".next/standalone/node_modules" ]; then \
      cp -r .next/standalone/node_modules/* ./node_modules/ 2>/dev/null || true; \
      echo "✓ Copied node_modules from standalone"; \
    else \
      echo "⚠ node_modules not found in standalone"; \
    fi && \
    if [ -d "node_modules/next" ]; then \
      echo "✓ Next.js found in node_modules"; \
    else \
      echo "❌ Next.js not found!"; \
      exit 1; \
    fi

USER nextjs

EXPOSE 3001
ENV PORT=3001

CMD ["node", "server.js"]