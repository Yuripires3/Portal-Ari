# Credenciais de Teste

## Acesso Administrativo (Admin)

**Email:** ti@qvsaude.com.br  
**Usuário (login):** admin  
**Senha:** Qv@2025 (hash armazenado no banco)

Perfil: Administrador do sistema com acesso total.

---

## Usuário de Teste (padrão)

Exemplo de cadastro para testes via `/register`:

- Email: joao@example.com  
- Usuário (login): joao.silva  
- CPF: 123.456.789-00  
- Área: Financeiro  
- Senha: Senha@123  

---

Após cadastro, faça login com email ou usuário + senha.

---

## Dados de Teste Disponíveis

### Produtos
- PROD-001: Produto Premium A (R$ 1.500,00)
- PROD-002: Produto Standard B (R$ 800,00)
- PROD-003: Produto Básico C (R$ 350,00)
- PROD-004: Serviço Consultoria (R$ 5.000,00)
- PROD-005: Produto Premium D (R$ 2.200,00)

### Faturas
- 5 faturas de teste (3 verificadas, 2 pendentes)
- Total em comissões: R$ 9.269,50

### Pagamentos
- 3 pagamentos concluídos
- 2 pagamentos agendados

---

## Como iniciar o Admin

1) Chame o seed uma vez:
```bash
curl http://localhost:3000/api/auth/seed
```
2) Faça login com as credenciais de admin acima.

---

## Observações

- Senhas são armazenadas com hash (bcrypt)
- Os dados são apenas para demonstração e testes
