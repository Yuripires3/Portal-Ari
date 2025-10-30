# Payment and Commission Platform

Plataforma de gestão de bonificações e comissões B2B.

## Tecnologias

- **Next.js 16** - Framework React com App Router
- **TypeScript** - Tipagem estática
- **MySQL** - Banco de dados relacional
- **JWT** - Autenticação via tokens
- **Tailwind CSS** - Estilização
- **shadcn/ui** - Componentes de UI

## Estrutura do Projeto

```
.
├── app/
│   ├── api/                    # API Routes do Next.js
│   │   ├── auth/               # Rotas de autenticação
│   │   └── bonificacoes/       # Rotas de bonificações
│   ├── admin/                  # Dashboard, bonificações e relatórios
│   ├── login/                  # Página de login
│   ├── register/               # Página de cadastro
│   └── layout.tsx              # Layout principal
├── components/
│   ├── admin/                  # Componentes admin
│   ├── auth/                   # Componentes de autenticação
│   └── ui/                     # Componentes UI (shadcn)
├── lib/                        # Utilitários e helpers
├── utils/                      # Funções utilitárias
└── public/                     # Arquivos estáticos
```

## Instalação

1. Clone o repositório

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
Crie um arquivo `.env.local` com:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=nome_do_banco
JWT_SECRET=seu-secret-key-aqui
```

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em: http://localhost:3000

## Estrutura de Rotas

### Frontend
- `/` - Redireciona para login
- `/login` - Página de login
- (Cadastro público removido) cadastro é feito pelo admin
- `/admin` - Dashboard administrativo
- `/admin/bonificacoes/cadastro-de-regras` - Cadastro de regras de bonificação
- `/admin/bonificacoes/visualizar-regras` - Visualização e filtros de regras
- `/admin/relatorios` - Relatórios

- ### API Routes
- `POST /api/admin/users` - Criar usuário (somente admin)
- `POST /api/auth/login` - Login (email ou usuário)
- `GET /api/auth/logout` - Logout
- `GET /api/auth/me` - Dados do usuário atual
- `GET /api/bonificacoes/regras` - Listar regras de bonificação
- `POST /api/bonificacoes/regras` - Criar regra de bonificação
- `PUT /api/bonificacoes/regras/[id]` - Atualizar regra
- `DELETE /api/bonificacoes/regras/[id]` - Deletar regra

## Principais Funcionalidades

### Autenticação
- Login por email ou usuário + senha
- JWT tokens para sessão
- Perfil: Admin (usuário comum acessa as mesmas páginas padrões)

### Gestão de Bonificações
- Cadastro de regras de bonificação
- Visualização e busca de regras
- Filtros por operadora, produto, faixa, etc.
- Paginação e ordenação

### Dashboard
- Métricas e gráficos
- Visualização de comissões
- Relatórios

## Scripts Disponíveis

- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm start` - Inicia servidor de produção
- `npm run lint` - Executa linter

## Variáveis de Ambiente

- `DB_HOST` - Host do banco MySQL
- `DB_PORT` - Porta do banco (padrão: 3306)
- `DB_USER` - Usuário do banco
- `DB_PASSWORD` - Senha do banco
- `DB_NAME` - Nome do banco de dados
- `JWT_SECRET` - Secret key para JWT tokens
