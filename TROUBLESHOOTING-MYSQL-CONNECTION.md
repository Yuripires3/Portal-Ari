# Troubleshooting: Erro ETIMEDOUT na Conexão MySQL

## 🐛 Problema

Erro `ETIMEDOUT` ao tentar conectar no MySQL, mesmo com IP público configurado.

## 🔍 Diagnóstico Passo a Passo

### Passo 1: Verificar Variáveis de Ambiente no Container

O container pode não estar usando o IP correto. Verifique:

```bash
# Acesse o container
docker exec -it payment-and-commission-platform sh

# Verifique as variáveis de ambiente
printenv | grep DB_

# Deve mostrar:
# DB_HOST=201.76.177.134
# DB_PORT=3306
# DB_USER=Indicadores
# DB_PASSWORD=xEth+vOHltr*c4Eju3+t
# DB_NAME=indicadores
```

**Se não mostrar `DB_HOST=201.76.177.134`**, o problema é que o Coolify está sobrescrevendo ou o container não foi reiniciado.

### Passo 2: Testar Conectividade do Container

```bash
# Do container, teste se consegue alcançar o MySQL
docker exec -it payment-and-commission-platform sh

# Teste ping (pode não funcionar se ping está desabilitado)
ping -c 3 201.76.177.134

# Teste porta (instale netcat se necessário)
nc -zv 201.76.177.134 3306
# OU
telnet 201.76.177.134 3306
```

### Passo 3: Testar Conexão MySQL Diretamente

```bash
# Do container, teste conexão MySQL
docker exec -it payment-and-commission-platform sh

# Instale mysql client se necessário
apk add mysql-client

# Teste conexão
mysql -h 201.76.177.134 -u Indicadores -pxEth+vOHltr*c4Eju3+t indicadores
```

### Passo 4: Usar Script de Teste

Copie o arquivo `test-db-connection.js` para o container e execute:

```bash
# Copiar script para o container
docker cp test-db-connection.js payment-and-commission-platform:/app/

# Executar no container
docker exec -it payment-and-commission-platform node test-db-connection.js
```

## 🔧 Soluções

### Solução 1: Verificar Configuração no Coolify

O Coolify pode estar sobrescrevendo as variáveis. Verifique:

1. **No painel do Coolify**, vá em **Environment Variables**
2. **Verifique se `DB_HOST` está definido**:
   - Se estiver definido com valor diferente, atualize para `201.76.177.134`
   - Se não estiver definido, adicione: `DB_HOST=201.76.177.134`

3. **Reinicie o container** após alterar

### Solução 2: Forçar IP no docker-compose.yaml

Se o Coolify está sobrescrevendo, force o valor:

```yaml
environment:
  - DB_HOST=201.76.177.134  # Remover ${DB_HOST:-} e usar valor fixo
```

**⚠️ Atenção**: Isso impede sobrescrever via Coolify, mas garante que o IP correto será usado.

### Solução 3: Verificar Firewall do Servidor MySQL

O servidor MySQL (`201.76.177.134`) pode estar bloqueando conexões do IP `82.25.66.17`.

**No servidor MySQL**, verifique:

```bash
# Verificar firewall
sudo ufw status
sudo iptables -L -n | grep 3306

# Se necessário, permitir conexão do IP específico
sudo ufw allow from 82.25.66.17 to any port 3306
```

### Solução 4: Verificar Configuração do MySQL

O MySQL pode não estar aceitando conexões remotas.

**No servidor MySQL**, execute:

```sql
-- Ver usuários e hosts permitidos
SELECT user, host FROM mysql.user WHERE user = 'Indicadores';

-- Se necessário, permitir conexão de qualquer IP
GRANT ALL PRIVILEGES ON indicadores.* TO 'Indicadores'@'%' IDENTIFIED BY 'xEth+vOHltr*c4Eju3+t';
FLUSH PRIVILEGES;

-- Verificar se MySQL está escutando em todas as interfaces
-- Edite /etc/mysql/mysql.conf.d/mysqld.cnf
-- bind-address = 0.0.0.0
```

### Solução 5: Adicionar Timeout e Retry

Se a conexão está lenta, aumente o timeout:

```javascript
// Em lib/db.ts ou onde cria a conexão
const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 30000, // 30 segundos
  acquireTimeout: 30000,
};
```

## 🧪 Teste Rápido

Execute este comando para testar rapidamente:

```bash
# Do servidor onde está o container (82.25.66.17)
docker exec payment-and-commission-platform sh -c "printenv | grep DB_HOST"
```

**Deve mostrar**: `DB_HOST=201.76.177.134`

Se mostrar outro valor, o problema é configuração no Coolify.

## 📋 Checklist de Verificação

- [ ] Container foi reiniciado após mudança no docker-compose.yaml?
- [ ] Variável `DB_HOST` no container está com valor `201.76.177.134`?
- [ ] Consegue fazer ping no IP `201.76.177.134` do container?
- [ ] Porta 3306 está acessível do container?
- [ ] MySQL está aceitando conexões remotas?
- [ ] Firewall do servidor MySQL permite conexões do IP `82.25.66.17`?
- [ ] MySQL está escutando em `0.0.0.0` (todas as interfaces)?

## 🎯 Próximos Passos

1. **Execute o diagnóstico** acima
2. **Identifique qual passo falhou**
3. **Aplique a solução correspondente**
4. **Teste novamente a conexão**

## 📞 Informações para Suporte

Se o problema persistir, colete estas informações:

```bash
# 1. Variáveis de ambiente do container
docker exec payment-and-commission-platform printenv | grep DB_

# 2. Teste de conectividade
docker exec payment-and-commission-platform nc -zv 201.76.177.134 3306

# 3. Logs do container
docker compose logs app | tail -50

# 4. Teste de conexão MySQL
docker exec payment-and-commission-platform node test-db-connection.js
```

