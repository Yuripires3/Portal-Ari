# Docker Compose - Guia de Uso

Este projeto agora suporta Docker Compose para facilitar o deploy e desenvolvimento.

## Arquivos

- `docker-compose.yml` - Configuração do Docker Compose
- `Dockerfile` - Imagem Docker (usada pelo Compose)
- `.env` - Variáveis de ambiente (crie este arquivo)

## Configuração Inicial

### 1. Criar arquivo .env

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Variáveis de Ambiente - Banco de Dados
DB_HOST=192.168.1.193
DB_PORT=3306
DB_USER=Indicadores
DB_PASSWORD=sua_senha_aqui
DB_NAME=indicadores

# Variáveis de Ambiente - Aplicação
PORT=3005
NODE_ENV=production
```

### 2. Build e Start

```bash
# Build da imagem e iniciar containers
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Parar containers
docker-compose down

# Parar e remover volumes
docker-compose down -v
```

## Comandos Úteis

```bash
# Rebuild sem cache
docker-compose build --no-cache

# Ver status dos containers
docker-compose ps

# Acessar shell do container
docker-compose exec app sh

# Ver logs em tempo real
docker-compose logs -f app

# Reiniciar serviço
docker-compose restart app

# Parar todos os serviços
docker-compose stop

# Iniciar serviços parados
docker-compose start
```

## Verificar Health Check

```bash
# Verificar se o health check está passando
docker-compose ps

# Testar endpoint de health
curl http://localhost:3005/api/health
```

## Acessar a Aplicação

Após iniciar, a aplicação estará disponível em:
- **Local**: http://localhost:3005
- **Network**: http://0.0.0.0:3005

## Variáveis de Ambiente

As variáveis podem ser configuradas de duas formas:

### 1. Arquivo .env (Recomendado)
Crie um arquivo `.env` na raiz do projeto.

### 2. Variáveis de Sistema
Exporte as variáveis antes de executar:
```bash
export DB_HOST=192.168.1.193
export DB_PASSWORD=sua_senha
docker-compose up -d
```

### 3. No docker-compose.yml
Edite diretamente no arquivo (não recomendado para senhas).

## Troubleshooting

### Container não inicia
```bash
# Ver logs detalhados
docker-compose logs app

# Verificar se a porta está em uso
lsof -i :3005
```

### Erro de conexão com banco
- Verifique se as variáveis de ambiente estão corretas
- Verifique se o banco está acessível na rede
- Teste a conexão: `mysql -h ${DB_HOST} -u ${DB_USER} -p`

### Rebuild completo
```bash
# Parar tudo
docker-compose down -v

# Remover imagens
docker rmi payment-and-commission-platform_app

# Rebuild
docker-compose up -d --build
```

## Integração com Coolify

O Coolify pode usar o `docker-compose.yml` diretamente. Certifique-se de:

1. Configurar as variáveis de ambiente no Coolify
2. O Coolify detectará automaticamente o arquivo `docker-compose.yml`
3. O health check já está configurado no compose

## Estrutura do docker-compose.yml

- **Service**: `app` - Aplicação Next.js
- **Port**: `3005:3005` - Mapeamento de portas
- **Healthcheck**: Verifica `/api/health` a cada 30s
- **Restart**: `unless-stopped` - Reinicia automaticamente
- **Network**: `app-network` - Rede isolada

