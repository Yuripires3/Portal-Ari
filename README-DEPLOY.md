# Guia de Deploy no Coolify

## Verificações de DNS e Rede

### 1. Verificar se o Container está Rodando

No Coolify, verifique:
- Status do container: deve estar "Running"
- Health check: deve estar "Healthy" após alguns minutos

### 2. Configurações de Networking no Coolify

Certifique-se de que:
- **Internal HTTP Port**: `3005`
- **Domínio**: Configurado corretamente
- **SSL**: Se necessário, configure o certificado

### 3. Testar a Aplicação

#### Dentro do servidor Coolify:
```bash
# Testar pelo IP interno
curl http://localhost:3005/api/health

# Deve retornar:
# {"ok":true,"status":"ok","timestamp":"..."}
```

#### Do seu computador:
```bash
# Substitua SEU_DOMINIO pelo domínio configurado no Coolify
curl http://SEU_DOMINIO/api/health
```

### 4. Verificar Logs do Container

No Coolify, veja os logs do container. Deve aparecer:
```
Ready - started server on 0.0.0.0:3005
```

### 5. Problemas Comuns

#### DNS_PROBE_FINISHED_NXDOMAIN
- **Causa**: DNS não está resolvendo o domínio
- **Solução**: 
  - Verifique se o domínio está configurado corretamente no Coolify
  - Aguarde a propagação do DNS (pode levar alguns minutos)
  - Verifique se o servidor está acessível publicamente

#### Container não inicia
- Verifique os logs do container no Coolify
- Verifique se todas as variáveis de ambiente estão configuradas
- Verifique se o build foi bem-sucedido

#### Health check falha
- Verifique se a porta 3005 está configurada corretamente
- Teste o endpoint `/api/health` manualmente
- Verifique os logs do container

## Configuração de Health Check no Coolify

Configure:
- **Tipo**: HTTP
- **Path**: `/api/health`
- **Porta**: `3005`
- **Grace period**: `60s`
- **Interval**: `10s`
- **Timeout**: `5s`
- **Retries**: `5`

## Variáveis de Ambiente Necessárias

Configure no Coolify:
- `DB_HOST` - IP do banco de dados
- `DB_PORT` - Porta do banco (geralmente 3306)
- `DB_USER` - Usuário do banco
- `DB_PASSWORD` - Senha do banco
- `DB_NAME` - Nome do banco
- `PORT` - Porta da aplicação (3005)

