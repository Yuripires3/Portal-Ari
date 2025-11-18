# Regras para Cálculo de Vidas Ativas na Posição

## Visão Geral

O cálculo de vidas ativas é realizado **mês a mês**, contando quantos beneficiários estavam ativos até o **último dia de cada mês** (ex: 31/01, 28/02, 31/03, etc.).

---

## Regra 1: Data de Início de Vigência

**CONDIÇÃO OBRIGATÓRIA:**
```
data_inicio_vigencia_beneficiario <= último dia do mês
```

**Explicação:**
- O beneficiário só pode ser contado a partir do mês em que sua vigência iniciou
- Se a vigência começou em 15/03/2025, ele só será contado a partir de março/2025
- Não será contado em janeiro/2025 ou fevereiro/2025

**Exemplo:**
- Mês de referência: Março/2025 (último dia = 31/03/2025)
- Beneficiário com `data_inicio_vigencia_beneficiario = 15/03/2025` → ✅ **CONTA** (15/03 <= 31/03)
- Beneficiário com `data_inicio_vigencia_beneficiario = 01/04/2025` → ❌ **NÃO CONTA** (01/04 > 31/03)

---

## Regra 2: Status e Data de Exclusão

A contagem depende da combinação entre `data_exclusao` e `status_beneficiario`:

### Cenário 2.1: Sem Data de Exclusão (`data_exclusao IS NULL`)

**CONDIÇÃO:**
```
status_beneficiario = 'ativo'
```

**Explicação:**
- Se o beneficiário não tem data de exclusão, verifica-se apenas o status
- Só conta se o status for exatamente `'ativo'` (minúsculo)
- Se o status for `'inativo'` ou qualquer outro valor, **NÃO CONTA**

**Exemplo:**
- `data_exclusao = NULL` e `status_beneficiario = 'ativo'` → ✅ **CONTA**
- `data_exclusao = NULL` e `status_beneficiario = 'inativo'` → ❌ **NÃO CONTA**

---

### Cenário 2.2: Com Data de Exclusão (`data_exclusao IS NOT NULL`)

**CONDIÇÕES (uma das duas deve ser verdadeira):**

#### Opção A: Data de Exclusão Futura
```
data_exclusao > CURDATE() (data atual do sistema)
```

**Explicação:**
- Se a data de exclusão é **futura** (maior que hoje), o beneficiário é considerado **ativo**
- Isso acontece mesmo que o `status_beneficiario` seja `'inativo'`
- A data futura indica que a exclusão ainda não ocorreu

**Exemplo:**
- Data atual: 10/11/2025
- `data_exclusao = 15/12/2025` → ✅ **CONTA** (15/12 > 10/11)
- `data_exclusao = 05/11/2025` → ❌ Verifica Opção B

#### Opção B: Data de Exclusão Passada ou Presente
```
data_exclusao > último dia do mês
```

**Explicação:**
- Se a data de exclusão já passou ou é hoje, verifica-se se o beneficiário ainda estava ativo naquele mês específico
- Só conta se a exclusão aconteceu **depois** do último dia do mês
- Se foi excluído durante o mês ou antes, **NÃO CONTA**

**Exemplo:**
- Mês de referência: Outubro/2025 (último dia = 31/10/2025)
- `data_exclusao = 15/11/2025` → ✅ **CONTA** (15/11 > 31/10 - ainda estava ativo em outubro)
- `data_exclusao = 20/10/2025` → ❌ **NÃO CONTA** (20/10 <= 31/10 - já foi excluído em outubro)
- `data_exclusao = 31/10/2025` → ❌ **NÃO CONTA** (31/10 <= 31/10 - excluído no último dia)

---

## Resumo das Regras Combinadas

Para um beneficiário ser contado como vida ativa em um mês M:

1. ✅ `data_inicio_vigencia_beneficiario <= último dia de M`
2. ✅ E uma das condições:
   - `data_exclusao IS NULL` **E** `status_beneficiario = 'ativo'` (minúsculo)
   - **OU** `data_exclusao IS NOT NULL` **E** (`data_exclusao > CURDATE()` **OU** `data_exclusao > último dia de M`)

---

## Exemplos Práticos

### Exemplo 1: Beneficiário Ativo Sem Exclusão
- `data_inicio_vigencia_beneficiario = 01/01/2025`
- `data_exclusao = NULL`
- `status_beneficiario = 'ativo'`
- **Resultado para Março/2025:** ✅ **CONTA** (vigência iniciada e status ativo)

### Exemplo 2: Beneficiário Inativo Sem Exclusão
- `data_inicio_vigencia_beneficiario = 01/01/2025`
- `data_exclusao = NULL`
- `status_beneficiario = 'inativo'`
- **Resultado para Março/2025:** ❌ **NÃO CONTA** (status inativo)

### Exemplo 3: Beneficiário com Exclusão Futura
- `data_inicio_vigencia_beneficiario = 01/01/2025`
- `data_exclusao = 15/12/2025`
- `status_beneficiario = 'inativo'`
- Data atual: 10/11/2025
- **Resultado para Novembro/2025:** ✅ **CONTA** (exclusão futura, ainda está ativo)

### Exemplo 4: Beneficiário Excluído Durante o Mês
- `data_inicio_vigencia_beneficiario = 01/01/2025`
- `data_exclusao = 15/10/2025`
- `status_beneficiario = 'inativo'`
- **Resultado para Outubro/2025:** ❌ **NÃO CONTA** (excluído em 15/10, antes do último dia 31/10)

### Exemplo 5: Beneficiário Excluído Após o Mês
- `data_inicio_vigencia_beneficiario = 01/01/2025`
- `data_exclusao = 15/11/2025`
- `status_beneficiario = 'inativo'`
- **Resultado para Outubro/2025:** ✅ **CONTA** (excluído em 15/11, depois do último dia 31/10)

### Exemplo 6: Vigência Iniciada Durante o Mês
- `data_inicio_vigencia_beneficiario = 15/03/2025`
- `data_exclusao = NULL`
- `status_beneficiario = 'ativo'`
- **Resultado para Março/2025:** ✅ **CONTA** (vigência iniciada em 15/03, antes do último dia 31/03)
- **Resultado para Fevereiro/2025:** ❌ **NÃO CONTA** (vigência ainda não iniciada)

---

## Filtros Adicionais

Além das regras acima, os seguintes filtros podem ser aplicados (se fornecidos):

- **Operadoras:** `operadora IN (operadora1, operadora2, ...)`
- **Entidades:** `entidade IN (entidade1, entidade2, ...)`
- **Tipo:** `tipo = 'valor_especifico'`

---

## Período de Cálculo

- O sistema sempre calcula **12 meses retrocedendo** a partir do mês mais recente selecionado
- Exemplo: Se selecionar Dezembro/2025, calcula de Janeiro/2025 até Dezembro/2025 (12 meses)
- Cada mês é calculado independentemente, verificando a posição até o último dia daquele mês

---

## Observações Importantes

1. **Último dia do mês:** O cálculo sempre considera o último dia do mês (28/29 para fevereiro, 30/31 para os demais)
2. **Data atual (CURDATE()):** Usa a data atual do servidor/banco de dados
3. **Contagem distinta:** Usa `COUNT(DISTINCT id_beneficiario)` para evitar duplicatas
4. **Case-sensitive:** O status deve ser exatamente `'ativo'` (tudo minúsculo) - valores no banco: `'ativo'` e `'inativo'`

