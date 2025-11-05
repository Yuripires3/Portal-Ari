# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copiar dependências do stage anterior
COPY --from=deps /app/node_modules ./node_modules
# Copiar código fonte
COPY . .

# Variáveis de ambiente para build (se necessário)
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Build da aplicação
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Instalar curl para health check (precisa ser antes de trocar para usuário não-root)
RUN apk add --no-cache curl

# Copiar arquivos necessários do builder
# Copiar o standalone output (contém server.js e node_modules necessários)
COPY --from=builder /app/.next/standalone ./
# Copiar arquivos estáticos
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Copiar script de inicialização e package.json customizado (DEPOIS do standalone para sobrescrever)
COPY server-start.js ./
COPY package-standalone.json ./package.json

# Ajustar permissões
RUN chown -R nextjs:nodejs /app && \
    chmod +x server-start.js

USER nextjs

EXPOSE 3005

ENV PORT 3005
ENV HOST "0.0.0.0"

# Health check - verifica se a aplicação está respondendo
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3005/api/health || exit 1

# Iniciar aplicação usando script wrapper que força hostname a 0.0.0.0
CMD ["node", "server-start.js"]

