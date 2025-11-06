# Configuração MySQL com IP Público

## ✅ Configuração Atual

- **IP Público MySQL**: `201.76.177.134:3306`
- **IP Privado MySQL**: `192.168.1.193:3306` (hostname: `sql`)
- **Usuário**: `Indicadores`
- **Database**: `indicadores`

## 📋 Status da Configuração

O `docker-compose.yaml` está configurado para usar o IP público `201.76.177.134` por padrão.

```yaml
- DB_HOST=${DB_HOST:-201.76.177.134}
- DB_PORT=${DB_PORT:-3306}
- DB_USER=${DB_USER:-Indicadores}
- DB_PASSWORD=${DB_PASSWORD:-xEth+vOHltr*c4Eju3+t}
- DB_NAME=${DB_NAME:-indicadores}
```

## 🔧 Configuração no Coolify

### Opção 1: Usar Valores Padrão (Recomendado)

Se você não configurar nada no Coolify, o container usará automaticamente:
- `DB_HOST=201.76.177.134`
- `DB_PORT=3306`
- `DB_USER=Indicadores`
- `DB_PASSWORD=xEth+vOHltr*c4Eju3+t`
- `DB_NAME=indicadores`

### Opção 2: Sobrescrever no Coolify

Se quiser configurar explicitamente no Coolify (recomendado para produção):

```
DB_HOST=201.76.177.134
DB_PORT=3306
DB_USER=Indicadores
DB_PASSWORD=xEth+vOHltr*c4Eju3+t
DB_NAME=indicadores
```

## 🔒 Segurança

⚠️ **IMPORTANTE**: A senha está hardcoded no `docker-compose.yaml`. Para produção:

1. **Remova a senha do arquivo** (deixe apenas `${DB_PASSWORD}`)
2. **Configure no Coolify** usando Secrets/Variables
3. **Nunca commite senhas** no Git

## 🧪 Teste de Conexão

### Teste 1: Do servidor onde está o container

```bash
# Teste conectividade
ping 201.76.177.134

# Teste porta MySQL
telnet 201.76.177.134 3306
# OU
nc -zv 201.76.177.134 3306
```

### Teste 2: Do container

```bash
# Acesse o container
docker exec -it payment-and-commission-platform sh

# Teste conexão MySQL
mysql -h 201.76.177.134 -u Indicadores -pxEth+vOHltr*c4Eju3+t indicadores
```

### Teste 3: Verificar logs

```bash
# Ver logs do container
docker compose logs app | grep -i "database\|mysql\|connection"

# Verificar se não há mais erros ETIMEDOUT
docker compose logs app | grep -i "ETIMEDOUT\|ECONNREFUSED"
```

## ✅ Checklist

- [x] IP público configurado: `201.76.177.134`
- [x] Porta configurada: `3306`
- [x] Usuário configurado: `Indicadores`
- [x] Database configurado: `indicadores`
- [ ] Testar conexão do container
- [ ] Verificar se MySQL aceita conexões do IP `82.25.66.17`
- [ ] Verificar firewall (porta 3306 deve estar aberta)
- [ ] Testar login na aplicação

## 🔍 Verificações no Servidor MySQL

Se ainda houver problemas de conexão, verifique no servidor MySQL:

### 1. MySQL aceita conexões remotas?

```sql
-- Ver usuários e hosts permitidos
SELECT user, host FROM mysql.user WHERE user = 'Indicadores';

-- Se necessário, permitir conexão de qualquer IP (CUIDADO!)
GRANT ALL PRIVILEGES ON indicadores.* TO 'Indicadores'@'%' IDENTIFIED BY 'xEth+vOHltr*c4Eju3+t';
FLUSH PRIVILEGES;
```

### 2. MySQL está escutando em todas as interfaces?

```bash
# Verificar configuração
sudo grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf

# Deve estar:
# bind-address = 0.0.0.0
```

### 3. Firewall permite conexões?

```bash
# Verificar se porta 3306 está aberta
sudo ufw status | grep 3306

# Se não estiver, abrir:
sudo ufw allow 3306/tcp
```

## 🎯 Próximos Passos

1. **Reinicie o container** após a configuração
2. **Teste o login** na aplicação
3. **Verifique os logs** se ainda houver erros
4. **Considere mover a senha** para variáveis de ambiente no Coolify

## 📝 Resumo

✅ **Configuração atual**: IP público `201.76.177.134` configurado no `docker-compose.yaml`

✅ **Próximo passo**: Reiniciar o container e testar a conexão

✅ **Recomendação**: Mover senha para variáveis de ambiente no Coolify para maior segurança

