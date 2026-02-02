# Onde as propostas são retiradas por filtro (ordem de execução)

Referência para investigar por que uma proposta (ex.: ON0322014, ON0304522) não entra no cálculo de bonificação. Cada bloco abaixo é um **ponto de exclusão** no fluxo do `calculo_bonificacao_completo.py`.

---

## 0. Antes de entrar no pipeline (Elasticsearch)

- **Linha 877** – Só entram propostas que tenham **cobrança com data de pagamento** no período:
  - Índice: `qv-relatorio-listagem-cobranca`
  - Filtro: `cobrancadatapagamento` entre `data_inicial` e `data_final`
- Se a proposta **não tiver nenhuma cobrança paga** nesse intervalo, ela **nunca** aparece no `faturamento_raw` e, portanto, não chega aos filtros abaixo.

---

## 1. Beneficiários só para propostas com número de proposta

- **Linha 887** – Relatório de beneficiários é baixado apenas para propostas que têm `_source.contratonumeroproposta` **não nulo** em `faturamento_raw`.
- Propostas com número de proposta nulo na listagem de cobranças não terão beneficiários e podem ficar de fora do fluxo ao mesclar dados.

---

## 2. Filtros de exclusão em `df2` (linhas 1027–1062)

**Etapa "Aplicando filtros de exclusao..." (68)**

| Linha  | Condição | O que remove |
|--------|----------|--------------|
| 1028   | `operadora == 'INTEGRAL SAÚDE POP RIO'` | Operadora Integral Saúde Pop Rio |
| 1029   | `beneficiario_cancelado == True` | Beneficiário cancelado |
| **1030** | **`numero_da_parcela != 1`** | **Qualquer parcela que não seja 1ª** |
| 1031–1039 | `concessionaria_nova` em lista (A2, BRISE, MB2, FAST, FAST-PORT, FAST-TLV, A2_PME, MIGRACAO, A2-TLV, FAST-TLV) | Concessionárias excluídas |
| 1041–1045 | `plano` DENTAL, UNIMED DENTAL, DENTSIM 10/20 ou contém "DENT" | Planos odontológicos |
| 1046–1052 | `entidade` em AERO, AFAMA, AGERIO, UNASPLAERJ, UNEICEF, NUCLEP, ASMED | Entidades excluídas |
| 1059–1062 | `entidade_nova` ou `operadora_nova` ou `concessionaria_nova` ou `plano_novo` é NaN | Sem mapeamento (entidade/operadora/concessionária/plano novo) |

---

## 3. Faixa de pagamento (linha 1108)

- **Linha 1108** – Remove linhas com `faixa_pagamento == 'fora da faixa'`.
- Quem ficar "fora da faixa" (regra em `achar_faixa_idade` / `aux_faixa_idade`) é excluído aqui.

---

## 4. Migrações (linhas 1170–1185) – **muito comum**

**Etapa "Processando migracoes..." (78)**

- **Arquivo:** `faturas_migracao/faturas_migracao.xlsx`
- **Coluna de proposta:** `numero_contrato` (renomeada para `numero_da_proposta`).
- **Linha 1183** – Merge left de `df2` com a planilha de migrações por `numero_da_proposta`.
- **Linha 1185** – **Mantém apenas linhas em que `parcela` é NaN**, ou seja, **remove todas as propostas que constam no arquivo de migrações**.

Se ON0322014 ou ON0304522 estiverem listadas nesse Excel, elas são **retiradas aqui**.

---

## 5. Filtros em `df3` (linhas 1210–1215)

**Após "Preparando estrutura final..." (80)** – Apenas linhas que **passam** em todas as condições abaixo seguem para `df_corretor`/`df_supervisor`.

| Linha  | Condição | O que remove |
|--------|----------|--------------|
| 1210   | `chave_regra` contém `'Não Elegível'` | Não elegível |
| 1211   | `bonificacao_corretor` in [1, 2, 3] | Códigos de erro na chave (1, 2, 3) |
| 1212   | `bonificacao_corretor` == 0 | Sem bonificação (zero) |
| 1213   | `chave_regra` contém `'nao achou'` | Regra não encontrada |
| 1214   | `chave_regra` contém `'Erro'` | Erro na regra |
| 1215   | `chave_regra` contém `'fora da faixa'` | Fora da faixa |

Ou seja: para seguir no cálculo, a proposta precisa ter **chave_regra** sem "Não Elegível", "nao achou", "Erro" ou "fora da faixa", e **bonificacao_corretor** diferente de 0, 1, 2 e 3.

---

## 6. Unificado “já pago” (linhas 1218–1230 e 1245–1246)

**Etapa "Processando unificado para evitar duplicatas..." (82)**

- Monta `unificado_paid` (propostas já consideradas pagas em execuções anteriores).
- **Linha 1230** – `df_corretor`: remove linhas cuja chave `numero_da_proposta + cpf_vendedor + cpf_beneficiario` está em `ids_unificado`.
- **Linha 1246** – `df_supervisor`: mesma lógica.

Se a proposta (com aquele corretor/supervisor e beneficiário) já constar como paga no histórico de unificado, ela é **retirada aqui** para não ser paga de novo.

---

## 7. Chave PIX (linha 1287)

- **Linha 1287** – `df4_com_pix = df4[~df4['chave_pix'].isna()]`: só segue para o cálculo de valor/pagamento quem tem **chave PIX** preenchida.
- Quem não tem PIX vai para `df4_sem_pix` (lista de sem PIX) e **não entra** no `calc_pag` / valor líquido.

---

## Resumo para investigar ON0322014 e ON0304522

1. **Elasticsearch** – Confirmar se há cobrança com `cobrancadatapagamento` no período e se é **1ª parcela**.
2. **Migrações** – Abrir `faturas_migracao/faturas_migracao.xlsx` e verificar se as duas propostas aparecem na coluna de número do contrato/proposta → se sim, são **retiradas no passo 4**.
3. **Filtros de exclusão (passo 2)** – Ver operadora, concessionária, plano e entidade das propostas; checar se não estão em nenhuma das listas de exclusão.
4. **Faixa e regra (passos 3 e 5)** – Se passaram dos passos anteriores, ver em qual execução elas caem em "fora da faixa", "Não Elegível", "nao achou" ou "Erro" (o dicionário `filtros` nas linhas 1437–1444 usa **df2**; propostas removidas por migrações já não estão mais em df2 nesse ponto, então não aparecerão em `filtros`).
5. **Unificado (passo 6)** – Ver se a combinação proposta+corretor/supervisor+beneficiário já está no unificado como paga.
6. **Chave PIX (passo 7)** – Ver se corretor/supervisor têm chave PIX; sem PIX não entram no valor pago.

O ponto mais frequente para propostas “sumirem” no período é o **arquivo de migrações (passo 4)** ou o **filtro de 1ª parcela (passo 2)**.
