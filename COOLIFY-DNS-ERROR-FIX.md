# 🔧 Correção do Erro de DNS no Coolify

## 📋 Problema Identificado

Durante o deploy no Coolify, ocorre o seguinte erro:

```
cURL error 6: Could not resolve host: api.github.com
```

**O que significa:**
- O container helper do Coolify não consegue resolver o DNS para `api.github.com`
- Isso acontece **antes** do build da sua aplicação
- É um problema de **infraestrutura/rede** no servidor onde o Coolify está rodando

## 🔍 Causas Possíveis

### 1. **DNS não configurado no servidor**
- O servidor não tem servidores DNS configurados
- Os servidores DNS configurados não estão funcionando

### 2. **Problemas de rede/firewall**
- Firewall bloqueando conexões DNS (porta 53)
- Servidor sem acesso à internet
- Rede do Docker sem acesso à internet

### 3. **Configuração do Docker**
- Docker não consegue resolver DNS
- Network do Docker sem configuração de DNS

## ✅ Soluções

### Solução 1: Configurar DNS no Servidor (Recomendado)

**No servidor onde o Coolify está rodando:**

#### Linux (Ubuntu/Debian):
```bash
# Editar arquivo de configuração DNS
sudo nano /etc/resolv.conf

# Adicionar servidores DNS confiáveis:
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1

# OU para configuração permanente (systemd-resolved):
sudo nano /etc/systemd/resolved.conf

# Adicionar:
[Resolve]
DNS=8.8.8.8 8.8.4.4 1.1.1.1
FallbackDNS=1.0.0.1

# Reiniciar serviço:
sudo systemctl restart systemd-resolved
```

#### Windows Server:
```powershell
# Configurar DNS via PowerShell (como Administrador)
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses "8.8.8.8","8.8.4.4","1.1.1.1"
```

### Solução 2: Configurar DNS no Docker

**Criar ou editar `/etc/docker/daemon.json`:**

```json
{
  "dns": ["8.8.8.8", "8.8.4.4", "1.1.1.1"]
}
```

**Reiniciar Docker:**
```bash
sudo systemctl restart docker
```

### Solução 3: Configurar DNS no docker-compose.yaml

**Adicionar configuração de DNS no seu `docker-compose.yaml`:**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile

    container_name: payment-and-commission-platform
    restart: always

    # Adicionar DNS
    dns:
      - 8.8.8.8
      - 8.8.4.4
      - 1.1.1.1

    ports:
      - "3005:3005"

    # ... resto da configuração
```

**Nota:** Isso só afeta o container da aplicação, não o helper do Coolify.

### Solução 4: Verificar Conectividade de Rede

**Testar no servidor:**

```bash
# Testar resolução DNS
nslookup api.github.com
# OU
dig api.github.com

# Testar conectividade
ping 8.8.8.8
ping api.github.com

# Testar acesso HTTPS
curl -I https://api.github.com/zen
```

**Se não funcionar:**
- Verifique firewall do servidor
- Verifique se o servidor tem acesso à internet
- Verifique configurações de proxy (se houver)

### Solução 5: Configurar Proxy (se aplicável)

**Se o servidor usa proxy:**

```bash
# Configurar proxy no Docker
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo nano /etc/systemd/system/docker.service.d/http-proxy.conf
```

**Adicionar:**
```ini
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=http://proxy.example.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1"
```

**Reiniciar Docker:**
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## 🧪 Validação

### 1. Testar DNS no Servidor

```bash
# Testar resolução
nslookup api.github.com

# Deve retornar IPs do GitHub
```

### 2. Testar DNS no Container Docker

```bash
# Executar container de teste
docker run --rm alpine nslookup api.github.com

# Deve resolver corretamente
```

### 3. Testar no Container Helper do Coolify

```bash
# Executar container helper manualmente
docker run --rm --network coolify \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/coollabsio/coolify-helper:1.0.12 \
  sh -c "nslookup api.github.com && curl -I https://api.github.com/zen"
```

## 📝 Configuração no Coolify

### Verificar Configurações de Rede

No painel do Coolify:
1. Vá em **Settings** → **Docker**
2. Verifique se há configurações de DNS ou Proxy
3. Se houver, configure os servidores DNS: `8.8.8.8`, `8.8.4.4`, `1.1.1.1`

### Verificar Logs do Coolify

No painel do Coolify:
1. Vá em **Logs** do deployment
2. Procure por erros de DNS ou rede
3. Verifique se o problema persiste após aplicar as correções

## 🔄 Após Aplicar as Correções

1. **Reiniciar Docker** (se mudou configuração do daemon)
2. **Reiniciar Coolify** (se necessário)
3. **Tentar deploy novamente**
4. **Verificar logs** para confirmar que o erro não ocorre mais

## ⚠️ Notas Importantes

- O erro ocorre **antes** do build da sua aplicação
- Não é um problema do código do projeto
- É um problema de **infraestrutura/rede** no servidor
- As soluções devem ser aplicadas **no servidor onde o Coolify está rodando**

## 📚 Servidores DNS Recomendados

### Google DNS:
- `8.8.8.8`
- `8.8.4.4`

### Cloudflare DNS:
- `1.1.1.1`
- `1.0.0.1`

### OpenDNS:
- `208.67.222.222`
- `208.67.220.220`

## 🆘 Se Nada Funcionar

1. **Verifique se o servidor tem acesso à internet:**
   ```bash
   ping 8.8.8.8
   ```

2. **Verifique firewall:**
   ```bash
   # Linux
   sudo ufw status
   sudo iptables -L
   ```

3. **Verifique logs do sistema:**
   ```bash
   # Linux
   sudo journalctl -u docker
   sudo dmesg | grep -i dns
   ```

4. **Contate o administrador do servidor** se não tiver acesso root

## ✅ Checklist

- [ ] DNS configurado no servidor (`/etc/resolv.conf` ou `systemd-resolved`)
- [ ] DNS configurado no Docker (`/etc/docker/daemon.json`)
- [ ] Teste de resolução DNS funcionando (`nslookup api.github.com`)
- [ ] Teste de conectividade funcionando (`curl https://api.github.com/zen`)
- [ ] Docker reiniciado (se mudou configuração)
- [ ] Deploy testado novamente no Coolify
- [ ] Logs verificados (sem erro de DNS)

