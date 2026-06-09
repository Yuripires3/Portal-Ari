# Indicadores no MySQL

Os indicadores consolidados sao armazenados na tabela
`indicadores_consolidado_valores`, usando as credenciais `DB_*` ja configuradas
no projeto.

As tabelas operacionais de origem sao alimentadas por processos executados fora
deste projeto. O portal apenas consulta essas tabelas, atualiza o snapshot usado
pelo front e registra abertura, projecao e fechamento das competencias nas
tabelas criadas para os indicadores.

Cada registro representa um valor mensal:

- ano
- operadora
- tipo do bloco
- ordem de exibicao
- chave do indicador
- mes
- valor
- fonte da importacao

## Primeira importacao

```bash
npm run indicadores:validar
npm run indicadores:importar
```

O importador cria a tabela automaticamente pela migration
`migrations/002_create_indicadores_consolidado.sql`.

## Atualizar depois de alterar o Excel

```bash
npm run indicadores:atualizar
```

Esse comando regenera `data/indicadores-consolidado.json` e substitui, dentro de
uma transacao, somente os anos presentes no arquivo. A chave unica impede
duplicacao por ano, operadora, indicador e mes.

Valores cuja fonte seja `banco_operacional` sao preservados durante uma nova
importacao do Excel.

As APIs consultam o MySQL primeiro. Se a tabela estiver indisponivel, o JSON
continua sendo usado como fallback para manter a tela funcionando.

## Regra de fechamento

- Ate o segundo dia util: atualiza o mes anterior e o mes atual.
- Ao atingir o segundo dia util: o mes anterior fica fechado.
- Do dia seguinte ao fechamento ate o dia 14: atualiza somente o mes atual.
- A partir do dia 15: atualiza o mes atual e a projecao do mes subsequente.
- Se o sistema nao rodar exatamente no segundo dia util, a primeira execucao
  posterior consolida e fecha o mes anterior.
- O front limita os meses exibidos ao ultimo mes registrado no controle de
  competencias, evitando mostrar meses futuros apenas porque existem linhas
  estaticas importadas.

Sincronizacao manual:

```bash
npm run indicadores:sincronizar
```

## Origem das linhas do front

| Linha | Origem | Regra |
| --- | --- | --- |
| Base Vidas | `registro_indicadores_df_ativos` | Contagem do snapshot `acumulado_mes` |
| Base Saude | `registro_indicadores_df_ativos` | `tipo_de_plano = 'Saude'` |
| Base Dental | `registro_indicadores_df_ativos` | `tipo_de_plano = 'Dental'` |
| Vendas | `registro_indicadores_df_ativos` | `classificacao_da_venda = 'Venda nova'` |
| Vidas canceladas | `registro_indicadores_df_inativos` | Exclusoes da competencia, sem inutilizados |
| Cancel. por inadimplencia | `registro_indicadores_df_inativos` | `motivo_canc_agrupado = 'Inad'` |
| Cancel. solicitacao cliente | `registro_indicadores_df_inativos` | `motivo_canc_agrupado = 'Solic. Cliente'` |
| Cancel. solicitado OPS | `registro_indicadores_df_inativos` | `motivo_canc_agrupado = 'Solic. OPS'` |
| Falecimento | `registro_indicadores_df_inativos` | `motivo_canc_agrupado = 'Obito'` |
| Outros | `registro_indicadores_df_inativos` | `motivo_canc_agrupado = 'Outros'` |
| Retencao | `registro_indicadores_df_atendimentos` | Soma de vidas com `rubrica_registro = 'Desconto'` |
| Faturamento Emitido | `consulta_faturamento` | Soma de `valor_cobranca` por competencia |
| Faturamento Recebido | `consulta_faturamento` | Soma de `valor_cobranca` com fatura paga |
| % cancelamento | Calculado no portal | Vidas canceladas / Base Vidas |
| Inadimplencia | Calculado no portal | 1 - Recebido / Emitido |
| Ticket medio | Calculado no portal | Emitido / Base Vidas |

Meta, comissoes, bonificacoes e rubricas de migracao continuam com o valor
importado do Excel enquanto nao houver uma fonte operacional definida.
