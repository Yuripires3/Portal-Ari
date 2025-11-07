# Stage 1: Dependencies (base em Debian para suportar apt-get/python)
FROM node:20-bullseye-slim AS deps

# Instala Python 3, pip e tzdata logo no início para reutilizar nas demais stages
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip tzdata && \
    rm -rf /var/lib/apt/lists/*

ENV TZ=America/Sao_Paulo
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# Instala tzdata e Python também na stage de build (útil para scripts em tempo de build)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip tzdata && \
    rm -rf /var/lib/apt/lists/*

ENV TZ=America/Sao_Paulo

# Copiar dependências do stage anterior
COPY --from=deps /app/node_modules ./node_modules
# Copiar código fonte
COPY . .

# Cria um requirements.txt vazio caso não exista para permitir COPY condicional na stage final
RUN if [ ! -f requirements.txt ]; then touch requirements.txt; fi
# Garante que a pasta de scripts exista mesmo que não haja scripts no repositório
RUN mkdir -p scripts

# Variáveis de ambiente para build
# Aumentar memória para evitar OOM durante o build
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Desabilitar Turbopack no build (pode causar crashes silenciosos)
# Forçar uso do Webpack tradicional que é mais estável
ENV NEXT_USE_TURBOPACK=0

# Build da aplicação com output mais verboso
RUN node -v && npm -v && npm run build

# Stage 3: Runner
FROM node:20-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV TZ America/Sao_Paulo

# Instala pacotes de sistema incluindo Python 3, pip e curl para healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip tzdata curl && \
    rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar arquivos necessários do builder
# Copiar o standalone output (contém server.js e node_modules necessários)
COPY --from=builder /app/.next/standalone ./
# Copiar arquivos estáticos
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Disponibiliza scripts Python e requirements para execução em runtime
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/requirements.txt ./requirements.txt

# Copiar script de inicialização e package.json customizado (DEPOIS do standalone para sobrescrever)
COPY server-start.js ./
COPY package-standalone.json ./package.json

# Instala dependências Python caso haja requirements.txt preenchido
RUN if [ -s requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi

# Ajustar permissões
RUN chown -R nextjs:nodejs /app && \
    chmod +x server-start.js

USER nextjs

EXPOSE 3005

ENV PORT 3005
ENV HOST "0.0.0.0"

# Health check - verifica se a aplicação está respondendo
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:3005/api/health || exit 1

# Iniciar aplicação usando script wrapper que força hostname a 0.0.0.0
CMD ["node", "server-start.js"]

