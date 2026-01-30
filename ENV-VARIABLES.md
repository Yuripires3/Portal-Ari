# Variáveis de Ambiente - Guia Completo

Este documento descreve todas as variáveis de ambiente necessárias para a aplicação funcionar corretamente.

## Variáveis Obrigatórias

### Banco de Dados MySQL

```env
DB_HOST=192.168.1.193
DB_PORT=3306
DB_USER=Indicadores
DB_PASSWORD=sua_senha_aqui
DB_NAME=indicadores
```

## Variáveis Opcionais

### Elasticsearch (se necessário para scripts Python)

```env
ELASTICSEARCH_HOST=elasticsearch.example.com
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=sua_senha
ELASTICSEARCH_USE_SSL=false
ELASTICSEARCH_VERIFY_CERTS=false
```

### Aplicação Next.js

```env
NODE_ENV=production
PORT=3005
HOSTNAME=0.0.0.0
HOST=0.0.0.0
NEXT_TELEMETRY_DISABLED=1
```

### Limpeza ao fazer deploy (cálculos em andamento)

Ao subir uma nova versão, a aplicação **já limpa automaticamente** locks e sessões de cálculo (via `instrumentation.ts`). Opcionalmente, o pipeline de deploy pode chamar a API para garantir a limpeza:

```env
# Token para POST /api/bonificacoes/calculo/cleanup-on-deploy (opcional)
DEPLOY_CLEANUP_SECRET=seu-token-secreto
# Ou use o mesmo token do cron de limpeza:
# CLEANUP_TOKEN=seu-token-secreto
```

Exemplo de chamada após o deploy (Coolify, script, etc.):

```bash
curl -X POST "https://seu-dominio/api/bonificacoes/calculo/cleanup-on-deploy" \
  -H "Authorization: Bearer SEU_DEPLOY_CLEANUP_SECRET"
```

## Verificação de Variáveis de Ambiente

### No Docker Compose

```bash
# Verificar se as variáveis estão sendo passadas ao container
docker compose exec app printenv | grep -i DB

# Verificar todas as variáveis
docker compose exec app printenv

# Verificar variáveis específicas
docker compose exec app printenv DB_HOST DB_USER DB_PASSWORD
```

### No Coolify

1. Acesse o painel do Coolify
2. Vá em "Environment Variables" ou "Variáveis de Ambiente"
3. Verifique se todas as variáveis obrigatórias estão configuradas
4. Certifique-se de que não há espaços extras ou aspas desnecessárias

## Problemas Comuns

### 1. Variáveis não estão sendo passadas

**Sintoma**: A aplicação pede HTTP Basic Authentication mesmo com credenciais configuradas.

**Causa**: As variáveis não estão chegando ao container.

**Solução**:
```bash
# Verifique se o arquivo .env existe
ls -la .env

# Verifique se o docker-compose está usando o .env
docker compose config

# Rebuild o container
docker compose up -d --build
```

### 2. Variáveis com aspas ou espaços

**Sintoma**: Erro de conexão com banco de dados.

**Causa**: Aspas ou espaços extras nas variáveis.

**Solução**:
```env
# ❌ ERRADO
DB_PASSWORD="minha senha"
DB_HOST= 192.168.1.193

# ✅ CORRETO
DB_PASSWORD=minha_senha
DB_HOST=192.168.1.193
```

### 3. ARG vs ENV no Dockerfile

**Problema**: Variáveis definidas como ARG não existem em runtime.

**Solução**: Use apenas `ENV` no Dockerfile ou defina as variáveis no `docker-compose.yml` na seção `environment`.

### 4. Middleware sobrescrevendo autenticação

**Verifique**: Se há um `middleware.ts` que está ativando Basic Auth como fallback.

**Solução**: Verifique o arquivo `middleware.ts` ou `app/middleware.ts` e remova qualquer lógica de Basic Auth se não for necessária.

## Exemplo de Arquivo .env

```env
# Banco de Dados
DB_HOST=192.168.1.193
DB_PORT=3306
DB_USER=Indicadores
DB_PASSWORD=sua_senha_segura_aqui
DB_NAME=indicadores

# Elasticsearch (opcional)
ELASTICSEARCH_HOST=
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_USER=
ELASTICSEARCH_PASSWORD=
ELASTICSEARCH_USE_SSL=false
ELASTICSEARCH_VERIFY_CERTS=false

# Aplicação
NODE_ENV=production
PORT=3005
```

## No Coolify

No Coolify, configure as variáveis de ambiente através do painel:

1. Acesse seu projeto
2. Vá em "Environment Variables"
3. Adicione cada variável:
   - Key: `DB_HOST`
   - Value: `192.168.1.193`
4. Repita para todas as variáveis obrigatórias
5. Salve e faça o redeploy

**Importante**: No Coolify, não use o arquivo `.env` - configure as variáveis diretamente no painel.

