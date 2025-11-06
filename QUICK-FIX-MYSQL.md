# 🔧 Correção Rápida: Erro ETIMEDOUT MySQL

## ⚡ Ação Imediata

O erro `ETIMEDOUT` significa que o container não consegue alcançar o MySQL. Siga estes passos:

### 1. Verificar se o Container Está Usando o IP Correto

**Execute no servidor onde está o container (82.25.66.17):**

```bash
docker exec payment-and-commission-platform printenv | grep DB_HOST
```

**Deve mostrar**: `DB_HOST=201.76.177.134`

**Se mostrar outro valor** (ex: `192.168.1.193` ou `sql`):
- O Coolify está sobrescrevendo a variável
- **Solução**: No Coolify, defina `DB_HOST=201.76.177.134` explicitamente

### 2. Forçar IP no docker-compose.yaml (Solução Rápida)

Se o Coolify continua sobrescrevendo, force o valor removendo a variável:

```yaml
# ANTES (pode ser sobrescrito):
- DB_HOST=${DB_HOST:-201.76.177.134}

# DEPOIS (valor fixo):
- DB_HOST=201.76.177.134
```

**⚠️ Atenção**: Isso impede sobrescrever via Coolify, mas garante que o IP correto será usado.

### 3. Testar Conectividade do Container

```bash
# Teste se o container consegue alcançar o MySQL
docker exec payment-and-commission-platform sh -c "nc -zv 201.76.177.134 3306"

# Se nc não estiver instalado, use telnet ou ping
docker exec payment-and-commission-platform sh -c "ping -c 3 201.76.177.134"
```

**Se falhar**: O problema é de rede/firewall, não de configuração.

### 4. Verificar Firewall do Servidor MySQL

O servidor MySQL (`201.76.177.134`) pode estar bloqueando conexões do IP `82.25.66.17`.

**No servidor MySQL, execute:**

```bash
# Verificar firewall
sudo ufw status
sudo iptables -L -n | grep 3306

# Permitir conexão do IP do servidor
sudo ufw allow from 82.25.66.17 to any port 3306
```

### 5. Verificar Configuração do MySQL

**No servidor MySQL, execute:**

```sql
-- Verificar se usuário pode conectar de qualquer IP
SELECT user, host FROM mysql.user WHERE user = 'Indicadores';

-- Se host não for '%', permitir conexão de qualquer IP
GRANT ALL PRIVILEGES ON indicadores.* TO 'Indicadores'@'%' IDENTIFIED BY 'xEth+vOHltr*c4Eju3+t';
FLUSH PRIVILEGES;

-- Verificar se MySQL está escutando em todas as interfaces
-- Edite: /etc/mysql/mysql.conf.d/mysqld.cnf
-- Deve ter: bind-address = 0.0.0.0
```

### 6. Habilitar Debug Temporariamente

Para ver mais informações sobre a tentativa de conexão:

**No Coolify, adicione:**
```
DB_DEBUG=true
```

Isso mostrará nos logs qual IP está sendo usado na tentativa de conexão.

## 🎯 Checklist Rápido

Execute estes comandos na ordem:

```bash
# 1. Verificar variável no container
docker exec payment-and-commission-platform printenv | grep DB_HOST

# 2. Testar conectividade
docker exec payment-and-commission-platform nc -zv 201.76.177.134 3306

# 3. Testar conexão MySQL direta
docker exec payment-and-commission-platform sh -c "mysql -h 201.76.177.134 -u Indicadores -pxEth+vOHltr*c4Eju3+t indicadores -e 'SELECT 1'"

# 4. Ver logs do container
docker compose logs app | tail -20
```

## 📋 Solução Mais Provável

**90% dos casos**: O Coolify está sobrescrevendo `DB_HOST` com valor antigo.

**Solução**:
1. No Coolify, vá em **Environment Variables**
2. Procure por `DB_HOST`
3. Se existir, altere para `201.76.177.134`
4. Se não existir, adicione: `DB_HOST=201.76.177.134`
5. **Reinicie o container**

## 🔍 Se Ainda Não Funcionar

1. **Forçar IP no docker-compose.yaml** (remover `${DB_HOST:-}`)
2. **Verificar firewall do servidor MySQL**
3. **Verificar se MySQL aceita conexões remotas**
4. **Testar conexão manual do servidor para o MySQL**

## 📞 Informações para Diagnóstico

Se precisar de ajuda, colete:

```bash
# 1. Variáveis de ambiente
docker exec payment-and-commission-platform printenv | grep DB_

# 2. Teste de conectividade
docker exec payment-and-commission-platform nc -zv 201.76.177.134 3306 2>&1

# 3. Últimos logs
docker compose logs app | tail -30
```

