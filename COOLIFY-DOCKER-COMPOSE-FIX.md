# Correções do docker-compose.yaml para Coolify

## 🎯 Objetivo

Corrigir o `docker-compose.yaml` para que o Coolify exiba o link correto com **IP + porta** (ex: `http://192.168.X.X:3000`) em vez do hostname do container (ex: `http://portal-ari:3000`).

## 🔍 Problemas Identificados

### 1. **Porta Fixa vs Dinâmica**
- **Antes**: Porta fixa `3005` hardcoded
- **Agora**: Porta configurável via variável de ambiente `PORT` (padrão: `3000`)
- **Motivo**: Permite flexibilidade e compatibilidade com diferentes configurações do Coolify

### 2. **Mapeamento de Portas**
- **Antes**: `"3005:3005"` (fixo)
- **Agora**: `"${PORT:-3000}:${PORT:-3000}"` (dinâmico)
- **Motivo**: O Coolify pode configurar a porta via variáveis de ambiente

### 3. **Health Check**
- **Antes**: Porta fixa `3005` no healthcheck
- **Agora**: Porta `3000` (deve corresponder à `PORT` definida)
- **Motivo**: Health check precisa de porta fixa, mas deve corresponder à configuração

### 4. **Labels do Coolify**
- **Adicionado**: Labels específicos para o Coolify
- **Motivo**: Ajuda o Coolify a identificar e gerenciar o serviço corretamente

### 5. **Documentação de Rede**
- **Melhorado**: Comentários explicando por que usar `networks:` ao invés de `network_mode: bridge`
- **Motivo**: São mutuamente exclusivos; `networks:` é mais flexível

## ✅ Correções Aplicadas

### 1. Porta Configurável

```yaml
ports:
  - "3000:3000"

environment:
  - PORT=${PORT:-3000}
```

**Explicação**:
- Porta fixa `3000:3000` no mapeamento (mais confiável)
- Variável de ambiente `PORT` com fallback para `3000`
- O Coolify pode sobrescrever `PORT` via painel, mas o mapeamento deve ser ajustado manualmente se mudar a porta
- Para usar porta 3005: altere `ports` para `"3005:3005"` e defina `PORT=3005`

### 2. HOST=0.0.0.0 (CRÍTICO)

```yaml
environment:
  - HOST=0.0.0.0
  - HOSTNAME=0.0.0.0
```

**Explicação**:
- `HOST=0.0.0.0` faz o servidor escutar em **todas as interfaces de rede**
- Sem isso, o servidor só escuta em `localhost` e **não é acessível externamente**
- Permite acesso via IP do servidor: `http://192.168.X.X:3000`

### 3. Network Bridge

```yaml
networks:
  - app-network

networks:
  app-network:
    driver: bridge
```

**Explicação**:
- `driver: bridge` cria uma rede bridge isolada
- Permite comunicação entre containers E acesso externo via IP
- **Não usar** `network_mode: bridge` junto com `networks:` (são mutuamente exclusivos)

### 4. server-start.js (Já Existente)

O script `server-start.js` já faz o trabalho pesado:

1. **Patcheia `os.hostname()`** para retornar IP real
2. **Intercepta logs** do Next.js para substituir hostname por IP
3. **Força `HOST=0.0.0.0`** antes do Next.js iniciar

**Resultado**: Os logs do Next.js mostram `http://192.168.X.X:3000` em vez de `http://container-hostname:3000`

### 5. Labels do Coolify

```yaml
labels:
  - "coolify.managed=true"
  - "coolify.service=app"
```

**Explicação**:
- Ajuda o Coolify a identificar o serviço
- Facilita gerenciamento e monitoramento

## 📋 Configuração no Coolify

### 1. Variáveis de Ambiente

Configure no painel do Coolify:

```
PORT=3000          # ou 3005 se preferir
HOST=0.0.0.0       # Já está no compose, mas pode sobrescrever
HOSTNAME=0.0.0.0   # Já está no compose, mas pode sobrescrever
DB_HOST=...        # Seu IP do MySQL
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
```

### 2. Docker Compose File Path

No Coolify, certifique-se de que:
- **Docker Compose File**: `docker-compose.yaml` (ou deixe em branco para detecção automática)
- **Build Pack**: Docker Compose

### 3. Porta Interna

No Coolify, configure:
- **Internal HTTP Port**: `3000` (ou `3005` se usar essa porta)
- O Coolify detectará automaticamente a porta mapeada no compose

## 🔧 Como Funciona

### Fluxo Completo

1. **Coolify inicia o container**
   - Lê `docker-compose.yaml`
   - Mapeia porta `${PORT:-3000}:${PORT:-3000}`
   - Define variáveis de ambiente (`HOST=0.0.0.0`, `PORT=3000`)

2. **Container inicia**
   - Executa `node server-start.js`
   - Script obtém IP real da máquina
   - Patcheia `os.hostname()` para retornar IP
   - Intercepta logs para substituir hostname

3. **Next.js inicia**
   - Escuta em `0.0.0.0:3000` (todas as interfaces)
   - Usa `os.hostname()` (que retorna IP devido ao patch)
   - Mostra nos logs: `http://192.168.X.X:3000`

4. **Coolify detecta**
   - Lê os logs do container
   - Encontra o link com IP real
   - Exibe no painel: `http://192.168.X.X:3000`

## 🧪 Validação

### Teste Local

```bash
# Build e start
docker compose up -d --build

# Ver logs (deve mostrar IP real)
docker compose logs app | grep -i "ready\|started"

# Testar acesso
curl http://localhost:3000/api/health
curl http://<SEU_IP>:3000/api/health
```

### Teste no Coolify

1. Faça commit e push do `docker-compose.yaml`
2. O Coolify detectará automaticamente
3. Verifique os logs - deve mostrar IP real
4. O link no painel deve ser: `http://<IP_SERVIDOR>:3000`

## ⚠️ Troubleshooting

### Problema: Ainda mostra hostname do container

**Soluções**:
1. Verifique se `HOST=0.0.0.0` está definido
2. Verifique se `server-start.js` está sendo executado (`command: node server-start.js`)
3. Verifique os logs: `docker compose logs app`
4. Certifique-se de que o `server-start.js` está no container (verificar Dockerfile)

### Problema: Porta não acessível externamente

**Soluções**:
1. Verifique se `HOST=0.0.0.0` está definido (não `localhost` ou `127.0.0.1`)
2. Verifique se a porta está mapeada: `ports: - "3000:3000"`
3. Verifique firewall do servidor
4. Teste localmente primeiro: `curl http://localhost:3000/api/health`

### Problema: Coolify não detecta a porta

**Soluções**:
1. Configure manualmente no Coolify: **Internal HTTP Port** = `3000`
2. Verifique se o healthcheck está passando
3. Verifique se a porta no compose corresponde à porta configurada

## 📝 Resumo das Mudanças

| Item | Antes | Depois | Motivo |
|------|-------|--------|--------|
| Porta | Fixa `3005` | Fixa `3000` (configurável via env) | Padrão 3000, pode mudar |
| Mapeamento | `"3005:3005"` | `"3000:3000"` | Mais confiável e compatível |
| Healthcheck | Porta fixa `3005` | Porta `3000` | Deve corresponder à PORT |
| Labels | Nenhum | `coolify.managed=true` | Identificação no Coolify |
| Comentários | Básicos | Detalhados | Melhor documentação |

## ✅ Checklist de Validação

- [x] `ports` mapeado corretamente
- [x] `HOST=0.0.0.0` definido
- [x] `PORT` configurável via variável de ambiente
- [x] Network bridge configurada
- [x] `command: node server-start.js` definido
- [x] Sem `hostname` explícito
- [x] Healthcheck configurado
- [x] Labels do Coolify adicionados
- [x] Variáveis de ambiente sem senhas hardcoded
- [x] Compatível com Docker Compose v3.8+

## 🎯 Resultado Esperado

Após as correções:

✅ **Coolify exibirá**: `http://192.168.X.X:3000`  
✅ **Acesso externo funcionará**: `http://<IP_SERVIDOR>:3000`  
✅ **Logs mostrarão IP real**: `Ready - started server on 0.0.0.0:3005, url: http://192.168.X.X:3000`  
✅ **Health check passará**: Container ficará "Healthy" no Coolify

## 📚 Referências

- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Next.js Standalone Output](https://nextjs.org/docs/advanced-features/output-file-tracing)
- [Coolify Documentation](https://coolify.io/docs)

