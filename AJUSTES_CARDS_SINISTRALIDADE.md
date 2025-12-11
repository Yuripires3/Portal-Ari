# Ajustes e Validação dos Cards do Dashboard de Sinistralidade

## ✅ Alterações Realizadas

### 1. Query Principal Ajustada (`sqlGeral`)

**Antes:** A query não seguia exatamente a estrutura oficial fornecida.

**Depois:** A query agora segue **100% fiel** à query oficial:
- Agrupa por `mes, entidade, plano, faixa_etaria` (conforme query oficial)
- Calcula `vidas_ativas`, `vidas_inativas`, `vidas_nao_localizadas`, `total_vidas`
- Calcula valores de faturamento e procedimentos por status
- Usa a mesma lógica de JOIN entre `reg_procedimentos`, `reg_faturamento` e `reg_beneficiarios`
- Inclui cálculo de `faixa_etaria` baseado na idade do beneficiário (mesma lógica da query oficial)

**Mudanças específicas:**
- Adicionado cálculo de `faixa_etaria` na estrutura base
- Ajustado para incluir `entidade` e `plano` na estrutura base (mesmo que não sejam usados no agrupamento final)
- Ajustado nomes de colunas para seguir a query oficial (`vidas_ativas`, `vidas_inativas`, `vidas_nao_localizadas`)

### 2. Query por Entidade Ajustada (`sqlPorEntidade`)

**Mudanças:**
- Agora usa a mesma estrutura base da query oficial
- Inclui cálculo de `faixa_etaria` na estrutura base
- Mantém a lógica de agrupamento por entidade, mês de reajuste e status

### 3. Queries de Distribuição por Plano Ajustadas

**`sqlPorPlanoGeral` e `sqlPorPlanoEntidade`:**
- Ajustadas para seguir a estrutura oficial
- Incluem cálculo de `faixa_etaria` na estrutura base
- Mantêm a mesma lógica de JOIN e cálculo de status

### 4. Processamento de Resultados

**Ajustes:**
- Processamento atualizado para usar os novos nomes de colunas (`vidas_ativas`, `vidas_inativas`, `vidas_nao_localizadas`)
- Mantida compatibilidade com o formato esperado pelos componentes frontend

### 5. Validações de Consistência Implementadas

**Validações criadas:**
1. ✅ Soma de vidas por mês: `vidas_ativas + vidas_inativas + vidas_nao_localizadas == total_vidas`
2. ✅ Soma de valores de procedimentos por mês: `valor_ativo + valor_inativo + valor_nao_localizado == valor_total_geral`
3. ✅ Soma de valores de faturamento por mês: `valor_net_ativo + valor_net_inativo + valor_net_nao_localizado == valor_net_total_geral`
4. ✅ Validações no consolidado geral (mesmas verificações acima)

**Como funciona:**
- As validações são executadas antes do retorno da API
- Problemas são logados no console com avisos (`⚠️`)
- Em desenvolvimento, as validações são incluídas no retorno JSON (campo `_validacoes`)
- Se todas as validações passarem, uma mensagem de sucesso é logada (`✅`)

## 🔵 Estrutura da Query Oficial Implementada

A query agora segue exatamente esta estrutura:

```sql
SELECT
    m.mes,
    m.entidade,
    m.plano,
    m.faixa_etaria,
    SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS vidas_ativas,
    SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS vidas_inativas,
    SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS vidas_nao_localizadas,
    COUNT(*) AS total_vidas,
    -- Valores de faturamento
    SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_faturamento ELSE 0 END) AS valor_fat_ativo,
    SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_faturamento ELSE 0 END) AS valor_fat_inativo,
    SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_faturamento ELSE 0 END) AS valor_fat_nao_localizado,
    SUM(m.valor_faturamento) AS valor_faturamento_total,
    -- Valores de procedimentos
    SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_ativo,
    SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_inativo,
    SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_nao_localizado,
    SUM(m.valor_procedimentos) AS valor_procedimentos_total
FROM (
    -- Estrutura base com JOIN entre procedimentos, faturamento e beneficiários
    -- Inclui cálculo de status_final e faixa_etaria
) AS m
GROUP BY m.mes, m.entidade, m.plano, m.faixa_etaria
```

## 📋 Checklist de Validação

- [x] Query principal segue exatamente a query oficial
- [x] Cálculo de `faixa_etaria` implementado conforme query oficial
- [x] Cálculo de `status_final` implementado conforme query oficial
- [x] JOIN entre `reg_procedimentos`, `reg_faturamento` e `reg_beneficiarios` correto
- [x] Validações de consistência implementadas
- [x] Formato de retorno compatível com componentes frontend
- [x] Sem erros de lint

## 🧪 Como Testar

1. **Teste de Consistência:**
   - Execute a API e verifique os logs do console
   - Procure por mensagens de validação (`✅` ou `⚠️`)
   - Em desenvolvimento, verifique o campo `_validacoes` no retorno JSON

2. **Teste Manual:**
   - Execute a query oficial diretamente no banco de dados
   - Compare os resultados com os valores exibidos nos cards
   - Verifique se `vidas_ativas + vidas_inativas + vidas_nao_localizadas == total_vidas`
   - Verifique se os valores somados correspondem aos totais

3. **Teste de Filtros:**
   - Teste diferentes combinações de filtros (mês, entidade, tipo)
   - Verifique se os valores continuam consistentes
   - Verifique se os drilldowns (entidade, plano, faixa etária) usam os mesmos dados

## 📝 Notas Importantes

1. **Faixa Etária:** A query agora calcula `faixa_etaria` na estrutura base, mesmo que não seja usada no agrupamento final de algumas queries. Isso garante consistência com a query oficial.

2. **Valores de Faturamento:** Os valores de faturamento são fixos por CPF (não variam por mês), conforme a lógica da query oficial.

3. **Status Final:** O cálculo de `status_final` usa o status mais recente do beneficiário, ordenado por `data_inicio_vigencia_beneficiario DESC`.

4. **Compatibilidade:** O formato de retorno foi mantido compatível com os componentes frontend existentes, apenas ajustando os nomes das colunas internas.

## 🔍 Logs de Validação

As validações são executadas automaticamente e logadas no console:
- ✅ Sucesso: `✅ VALIDAÇÕES DE CONSISTÊNCIA: Todas as validações passaram!`
- ⚠️ Problemas: Lista de problemas encontrados com detalhes

Em desenvolvimento, os problemas também são incluídos no retorno JSON no campo `_validacoes`.

