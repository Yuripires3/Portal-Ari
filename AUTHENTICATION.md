# Sistema de Autenticação

Sistema completo de autenticação e cadastro de usuários utilizando a tabela `registro_usuarios_web_bonificacao`.

## Estrutura da Tabela

```sql
CREATE TABLE registro_usuarios_web_bonificacao (
  id INT NOT NULL AUTO_INCREMENT,
  cpf CHAR(14) NOT NULL UNIQUE,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  area ENUM('Financeiro','Movimentacao','Faturamento') NULL,
  usuario_login VARCHAR(150) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
```

## Funcionalidades Implementadas

### 1. Cadastro de Usuários (somente admin)

- Endpoint: `POST /api/admin/users` (apenas administradores)

- **Validações**:
  - CPF: obrigatório, aceita com ou sem máscara, valida formato e unicidade
  - Nome: obrigatório, máximo 150 caracteres
  - Email: obrigatório, formato válido, único
  - Área: opcional (Financeiro, Movimentacao, Faturamento)
  - Usuário de login: 4-150 caracteres, alfanumérico + _/./-, único
  - Senha: mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 dígito, 1 caractere especial

- **Segurança**:
  - Senha hashada com bcrypt (cost 12)
  - Prepared statements para prevenir SQL injection
  - Sanitização de entradas
  - Validação de duplicidades retorna 409

### 2. Login (`POST /api/auth/login`)

- Permite login por **email** ou **usuario_login**
- Compara senha via bcrypt
- Retorna JWT token
- Cookie httpOnly configurado

### 3. Verificação de Usuário (`GET /api/auth/me`)

- Retorna dados do usuário autenticado (sem senha)
- Valida token JWT

### 4. Seed Admin (`GET/POST /api/auth/seed`)

- Cria usuário admin caso não exista:
  - **CPF**: 000.000.000-00
  - **Nome**: Administrador do Sistema
  - **Email**: ti@qvsaude.com.br
  - **Área**: Financeiro
  - **Usuário**: admin
  - **Senha**: Qv@2025 (hashada)

## Páginas

### `/login`
- Página de login
- Aceita email ou usuario_login + senha
- Link para cadastro

Cadastro público removido. Solicite criação de usuário ao administrador.

## Segurança

### Implementado
- ✅ Hash de senha com bcrypt (cost 12)
- ✅ Nunca retorna hash de senha
- ✅ Prepared statements
- ✅ Validações de entrada
- ✅ Mensagens de erro genéricas (sem detalhes técnicos)
- ✅ JWT tokens
- ✅ Cookies httpOnly

### Recomendações Adicionais
- ⚠️ **Limite de tentativas**: Implementar rate limiting (5 tentativas/15min por IP/conta)
- ⚠️ **Logs de auditoria**: Implementar logs de autenticação (sucesso/falha)
- ⚠️ **Termo de uso**: Adicionar checkbox no cadastro

## Variáveis de Ambiente

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=nome_do_banco
JWT_SECRET=seu-secret-key-aqui-minimo-32-caracteres
```

## Perfis de Usuário

### ADMIN
- Usuários com `usuario_login = 'admin'` ou `email = 'ti@qvsaude.com.br'`
- Acesso a todas as rotas administrativas

### USER
- Usuários normais cadastrados
- Acesso limitado conforme implementação de rotas

## Como Inicializar o Admin

### Opção 1: Via API
```bash
curl http://localhost:3000/api/auth/seed
```

### Opção 2: Via Código
O seed é executado automaticamente na primeira inicialização através do endpoint `/api/auth/seed`.

Você pode chamar este endpoint uma vez após criar a tabela para garantir que o admin existe.

## Fluxo de Uso

1. **Primeira vez**: Execute `/api/auth/seed` para criar o admin
2. **Login**: Use email ou usuario_login + senha
3. **Cadastro**: Novos usuários podem se cadastrar em `/register`
4. **Acesso**: Usuários autenticados podem acessar `/admin`

## Exemplo de Uso

### Cadastro
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "cpf": "123.456.789-00",
    "nome": "João Silva",
    "email": "joao@example.com",
    "area": "Financeiro",
    "usuario_login": "joao.silva",
    "senha": "Senha@123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "joao@example.com",
    "senha": "Senha@123"
  }'
```

### Verificar Usuário
```bash
curl http://localhost:3000/api/auth/me \
  -H "Cookie: token=SEU_TOKEN_AQUI"
```

