FROM node:20-alpine

WORKDIR /app

# Pacotes necessários para scripts Python e healthcheck
RUN apk add --no-cache python3 py3-pip curl

# Instala dependências do Node primeiro para aproveitar cache
COPY package.json package-lock.json* ./
RUN npm ci

# Copia todo o código (incluindo scripts Python)
COPY . .

# Instala dependências Python se houver requirements.txt não vazio
RUN if [ ! -f requirements.txt ]; then touch requirements.txt; fi
RUN if [ -s requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi

# Build de produção do Next.js (espera que output: "standalone" esteja habilitado)
ENV NODE_ENV=production
RUN npm run build

# Define porta/host padrão e expõe a porta 3005
ENV PORT=3005
ENV HOST=0.0.0.0
EXPOSE 3005

# Healthcheck utilizando a porta configurada (fallback 3005)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:${PORT:-3005}/ || exit 1

# Inicia o servidor standalone do Next
CMD ["node", ".next/standalone/server.js"]

