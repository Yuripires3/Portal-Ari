# Correção para Node 20: Remoção de Patch de os.hostname()

## 🐛 Problema

No Node 20, `os.hostname` não pode ser redefinido usando `Object.defineProperty()`, causando o erro:
```
TypeError: Cannot redefine property: hostname
```

O código anterior tentava patchear `os.hostname()` para que os logs mostrassem IP:porta em vez do hostname do container, mas isso não funciona no Node 20.

## ✅ Solução Implementada

### 1. Remoção de Todos os Patches de `os.hostname()`

**Antes** (não funciona no Node 20):
```javascript
Object.defineProperty(os, 'hostname', {
  value: function() { return displayIP; },
  writable: false,
  configurable: false
});
```

**Agora**: Removido completamente. Não tentamos mais modificar `os.hostname()`.

### 2. Nova Função `resolvePublicBaseUrl()`

Criada função que resolve a URL pública usando variáveis de ambiente:

```javascript
function resolvePublicBaseUrl() {
  // Prioridade:
  // 1. NEXT_PUBLIC_SITE_URL (padrão Next.js)
  // 2. PUBLIC_HOST
  // 3. IP detectado automaticamente
  // 4. Fallback para 0.0.0.0:porta
}
```

**Características**:
- Aceita URLs com ou sem protocolo (`http://`)
- Normaliza URLs (remove trailing slash)
- Fallback inteligente para detecção automática de IP

### 3. Uso de Variáveis de Ambiente

O servidor agora usa variáveis de ambiente em vez de tentar modificar `os.hostname()`:

- `NEXT_PUBLIC_SITE_URL`: URL completa (ex: `http://192.168.1.100:3005`)
- `PUBLIC_HOST`: Host:porta (ex: `192.168.1.100:3005`) ou URL completa

### 4. Interceptação de Logs Melhorada

A função `replaceUrlsInLogs()` agora:
- Usa a URL pública resolvida (não tenta modificar `os.hostname()`)
- Substitui hostnames de containers nos logs
- Funciona com qualquer formato de URL

### 5. Sanity Check nos Logs

O script agora faz verificação e mostra mensagens apropriadas:

**Com `PUBLIC_HOST` definido**:
```
✅ Ready on http://192.168.1.100:3005
📡 Server listening on 0.0.0.0:3005
🌐 Public URL: http://192.168.1.100:3005
```

**Sem `PUBLIC_HOST` (detecção automática)**:
```
⚠️  PUBLIC_HOST or NEXT_PUBLIC_SITE_URL not set, using detected IP: http://192.168.1.100:3005
📡 Server listening on 0.0.0.0:3005
💡 To set a custom public URL, define PUBLIC_HOST or NEXT_PUBLIC_SITE_URL environment variable
```

**Sem `PUBLIC_HOST` e sem IP detectável**:
```
⚠️  PUBLIC_HOST or NEXT_PUBLIC_SITE_URL not set and could not detect IP
📡 Server listening on 0.0.0.0:3005
💡 Please define PUBLIC_HOST or NEXT_PUBLIC_SITE_URL environment variable
   Example: PUBLIC_HOST=192.168.1.100:3005 or NEXT_PUBLIC_SITE_URL=http://192.168.1.100:3005
```

## 📝 Mudanças no docker-compose.yaml

### Variáveis Adicionadas

```yaml
environment:
  - PUBLIC_HOST=${PUBLIC_HOST:-}
  - NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-}
```

### Configuração no Coolify

No painel do Coolify, defina:
```
PUBLIC_HOST=192.168.X.X:3005
```

Ou alternativamente:
```
NEXT_PUBLIC_SITE_URL=http://192.168.X.X:3005
```

## 🔧 Como Funciona Agora

1. **Servidor inicia** com `HOST=0.0.0.0` e `PORT=3005`
2. **server-start.js** resolve a URL pública usando variáveis de ambiente
3. **Logs são interceptados** e hostnames de containers são substituídos pela URL pública
4. **Next.js usa** `NEXT_PUBLIC_SITE_URL` (se definido) para URLs absolutas
5. **Nenhum patch** de `os.hostname()` é tentado

## ✅ Benefícios

1. **Compatível com Node 20**: Não tenta modificar propriedades não-configuráveis
2. **Mais flexível**: Permite definir URL pública via variáveis de ambiente
3. **Melhor para produção**: URL explícita é mais confiável que detecção automática
4. **Compatível com Next.js**: Usa `NEXT_PUBLIC_SITE_URL` que é o padrão do Next.js
5. **Logs informativos**: Mostra claramente qual URL está sendo usada

## 🧪 Teste

```bash
# Com PUBLIC_HOST definido
docker compose up -d
docker compose logs app | grep "Ready on"

# Deve mostrar:
# ✅ Ready on http://192.168.X.X:3005
```

## 📚 Referências

- [Node.js os.hostname()](https://nodejs.org/api/os.html#oshostname)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)

