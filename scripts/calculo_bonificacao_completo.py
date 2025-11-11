#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script completo de cálculo de bonificação adaptado para execução via API.
Captura stdout e retorna resultados em JSON.
"""

import sys
import json
import io
import gc
from contextlib import redirect_stdout
from datetime import date, timedelta, datetime as dt
from time import time
from urllib.parse import quote_plus
import pandas as pd
import numpy as np
import locale

# Tentar importar orjson para serialização mais rápida
try:
    import orjson  # pyright: ignore[reportMissingImports]
    _json_dumps = lambda obj: orjson.dumps(
        obj,
        option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS | orjson.OPT_UTC_Z | orjson.OPT_INDENT_2
    ).decode("utf-8")
except Exception:
    # Fallback para json padrão
    def json_serializer(obj):
        """Serializa tipos especiais para JSON"""
        if obj is None:
            return None
        try:
            if isinstance(obj, (pd.Timestamp, dt)):
                return obj.isoformat() if obj is not None else None
            if isinstance(obj, (pd.Timedelta, timedelta)):
                return str(obj)
            if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
                return int(obj)
            if isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
                val = float(obj)
                return val if not (np.isnan(val) or np.isinf(val)) else None
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, np.bool_):
                return bool(obj)
            if isinstance(obj, (float, np.floating)) and pd.isna(obj):
                return None
        except (ValueError, TypeError, AttributeError):
            pass
        return str(obj)
    
    _json_dumps = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':'), default=json_serializer)

# Importações que serão necessárias quando o ambiente estiver configurado
ES_OK, SA_OK = True, True
try:
    from elasticsearch import Elasticsearch
except ImportError as e:
    ES_OK = False
    print(f"AVISO: Elasticsearch não disponível: {e}", file=sys.stderr)

try:
    from sqlalchemy import create_engine, text
except ImportError as e:
    SA_OK = False
    print(f"AVISO: SQLAlchemy não disponível: {e}", file=sys.stderr)

sys.stderr.flush()

# Configuração para capturar stdout
stdout_capture = io.StringIO()

def subtrair_dias_uteis(data, dias):
    """Subtrai dias úteis de uma data"""
    d = data
    while dias > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            dias -= 1
    return d

def calcular_datas(modo, data_inicial_override=None, data_final_override=None):
    """Calcula as datas conforme o modo especificado"""
    hoje = date.today()
    CUT = date(2025, 10, 1)
    
    if hoje < CUT:
        return {
            "erro": True,
            "mensagem": "Fora da data de virada;",
            "data_pagamento": None,
            "data_final": None,
            "data_inicial": None,
            "n_apur": None
        }
    
    if modo == "automatico":
        data_pagamento = hoje
        data_final = subtrair_dias_uteis(hoje, 1)
        data_inicial = data_final - timedelta(days=30)
        n_apur = hoje.day
    elif modo == "periodo":
        if not data_inicial_override or not data_final_override:
            return {
                "erro": True,
                "mensagem": "No modo período, data_inicial e data_final são obrigatórias",
                "data_pagamento": None,
                "data_final": None,
                "data_inicial": None,
                "n_apur": None
            }
        data_pagamento = hoje
        data_inicial = date.fromisoformat(data_inicial_override)
        data_final = date.fromisoformat(data_final_override)
        n_apur = hoje.day
    else:
        return {
            "erro": True,
            "mensagem": f"Modo inválido: {modo}",
            "data_pagamento": None,
            "data_final": None,
            "data_inicial": None,
            "n_apur": None
        }
    
    return {
        "erro": False,
        "data_pagamento": data_pagamento,
        "data_final": data_final,
        "data_inicial": data_inicial,
        "n_apur": n_apur
    }

def valor_para_texto(valor):
    """Converte valor numérico para texto formatado"""
    valor_texto = f'R$ {valor:_.2f}'
    valor_texto = valor_texto.replace('.', ',').replace('_', '.')
    return valor_texto

def corrigir_tamanho(num_tam, valor, tipo):
    """Corrige tamanho de string para formatação"""
    max_iterations = 100  # Prevenir recursão infinita
    iterations = 0
    
    if tipo == 'CR$':
        # Normalizar: garantir que começa com 'R$ '
        if not valor.startswith('R$ '):
            # Se não começa com 'R$ ', tentar extrair o valor numérico
            if valor.startswith('R$'):
                valor = 'R$ ' + valor[2:].lstrip()
            else:
                valor = 'R$ ' + valor
        
        # Extrair apenas a parte numérica (sem 'R$ ')
        valor_limpo = valor[3:] if valor.startswith('R$ ') else valor
        
        # Adicionar espaços à esquerda até atingir o tamanho desejado
        tamanho_anterior = len(valor)
        while len(valor) < num_tam and iterations < max_iterations:
            valor = 'R$ ' + valor_limpo
            # Se ainda não atingiu, adicionar espaço antes de 'R$ '
            if len(valor) < num_tam:
                valor = ' ' + valor
            
            iterations += 1
            
            # Proteção: se não está progredindo (tamanho não mudou), sair
            if len(valor) == tamanho_anterior:
                break
            tamanho_anterior = len(valor)
                
    elif tipo == 'SR$':
        # Adicionar espaços à esquerda até atingir o tamanho desejado
        tamanho_anterior = len(valor)
        while len(valor) < num_tam and iterations < max_iterations:
            valor = ' ' + valor
            iterations += 1
            
            # Proteção: se não está progredindo (tamanho não mudou), sair
            if len(valor) == tamanho_anterior:
                break
            tamanho_anterior = len(valor)
    
    return valor

# REMOVIDO: Função verificar_e_criar_colunas_staging
# As colunas devem ser criadas via migration SQL (001_add_staging_fields_to_descontos.sql)
# Esta função foi removida para otimização - não é mais necessária rodar a cada execução

def classificar_registros_antigos(conn, log_print):
    """
    Classifica registros antigos (sem status ou staging sem run_id) como 'finalizado' e is_active = TRUE.
    Otimizado: apenas atualiza registros que realmente precisam ser classificados.
    """
    try:
        # Atualizar registros antigos (sem verificação desnecessária de coluna)
        result = conn.execute(text("""
            UPDATE registro_bonificacao_descontos
            SET status = 'finalizado',
                is_active = TRUE,
                finalizado_at = COALESCE(registro, NOW()),
                dt_referencia = COALESCE(DATE(dt_apuracao), DATE(dt_movimentacao), CURDATE()),
                created_at = COALESCE(registro, NOW()),
                origem = COALESCE(origem, 'script_python')
            WHERE status IS NULL OR (status = 'staging' AND run_id IS NULL)
        """))
        
        total = result.rowcount if hasattr(result, 'rowcount') else 0
        conn.commit()
        
        if total > 0:
            log_print(f"[MIGRATION] {total} registro(s) antigo(s) classificado(s) como 'finalizado'")
        
    except Exception as e:
        log_print(f"[MIGRATION] Erro ao classificar registros antigos: {str(e)}")
        conn.rollback()
        # Não falhar o processo - apenas logar o erro


def main():
    """Função principal que processa entrada JSON e retorna saída JSON"""
    try:
        # Log inicial imediato para debug
        print("[DEBUG] Script iniciado", file=sys.stderr)
        sys.stderr.flush()
        
        # Ler parâmetros do stdin com fallback seguro
        print("[DEBUG] Lendo JSON do stdin...", file=sys.stderr)
        sys.stderr.flush()
        
        input_data = {}
        try:
            if not sys.stdin.isatty():
                # Ler stdin se não for TTY
                stdin_content = sys.stdin.read()
                if stdin_content:
                    input_data = json.loads(stdin_content)
                    print(f"[DEBUG] JSON recebido do stdin: {list(input_data.keys())}", file=sys.stderr)
                else:
                    print("[DEBUG] stdin vazio, usando valores padrão", file=sys.stderr)
            else:
                print("[DEBUG] stdin é TTY, usando valores padrão", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"[DEBUG] Erro ao decodificar JSON: {e}, usando valores padrão", file=sys.stderr)
            input_data = {}
        except Exception as e:
            print(f"[DEBUG] Erro ao ler stdin: {e}, usando valores padrão", file=sys.stderr)
            input_data = {}
        
        print(f"[DEBUG] Dados finais: modo={input_data.get('modo', 'automatico')}", file=sys.stderr)
        sys.stderr.flush()
        
        # Novos parâmetros de otimização
        return_mode = input_data.get("return_mode", "summary")
        max_rows_per_df = int(input_data.get("max_rows_per_df", 5000))
        include_logs = bool(input_data.get("include_logs", True))
        include_frames = input_data.get("include_frames", None)
        if include_frames is None:
            # Por padrão, não envia nenhuma tabela - apenas logs/prints
            include_frames = {
                "df5": False,  # Não envia tabelas por padrão
                "df4_sem_pix": False,
                "calc_pag": False,
                "unif_bonif": False,
                "unif_com": False,
                "desc": False,
                "bonificacao_analise": False
            }
        
        modo = input_data.get("modo", "automatico")
        data_inicial_override = input_data.get("data_inicial")
        data_final_override = input_data.get("data_final")
        
        # Caminho do arquivo de migrações (relativo ao diretório do projeto)
        import os
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        migracoes_path = os.path.join(project_root, "faturas_migracao", "faturas_migracao.xlsx")
        
        # Calcular datas
        resultado_datas = calcular_datas(modo, data_inicial_override, data_final_override)
        
        if resultado_datas["erro"]:
            # Salvar print original antes de usar (caso já não tenha sido salvo)
            import builtins
            if 'original_print' not in locals():
                original_print = builtins.print
            original_print(_json_dumps({
                "sucesso": False,
                "erro": resultado_datas["mensagem"],
                "logs": f"{resultado_datas['mensagem']}\n"
            }))
            sys.exit(0)
        
        data_pagamento = resultado_datas["data_pagamento"]
        data_final = resultado_datas["data_final"]
        data_inicial = resultado_datas["data_inicial"]
        n_apur = resultado_datas["n_apur"]
        
        # Capturar todos os prints
        logs_parts = []
        
        # Salvar print original antes de criar log_print
        import builtins
        original_print = builtins.print
        
        def log_print(*args, **kwargs):
            """Wrapper para print que captura logs"""
            msg = ' '.join(str(arg) for arg in args)
            logs_parts.append(msg)
            # Remover 'file' de kwargs se existir, pois sempre usamos stdout_capture
            kwargs.pop('file', None)
            # Usar original_print para evitar recursão (pois builtins.print será substituído)
            original_print(*args, **kwargs, file=stdout_capture)
        
        # Redirecionar print para captura
        builtins.print = log_print
        
        try:
            # Marcador de etapa para sincronização com frontend
            def etapa(mensagem, percentual=None):
                """Imprime etapa com marcador especial para parsing"""
                if percentual is not None:
                    log_print(f"[ETAPA:{percentual}%] {mensagem}")
                    # Também imprime no stderr para garantir captura (apenas para etapas com percentual)
                    # Usar original_print para evitar conflito com log_print
                    original_print(f"[ETAPA:{percentual}%] {mensagem}", file=sys.stderr)
                    sys.stderr.flush()  # Sempre flush para garantir que o frontend receba o progresso
                else:
                    log_print(f"[ETAPA] {mensagem}")
            
            etapa("Iniciando calculo...", 0)
            
            # Aqui viria o código completo do script fornecido pelo usuário
            # Por enquanto, vamos criar uma estrutura básica que pode ser expandida
            
            log_print("Data inicial    :", data_inicial)
            log_print("Data final      :", data_final)
            log_print("Data pagamento  :", data_pagamento)
            log_print("Numero da apuracao:", n_apur)
            log_print("Caminho migracoes:", migracoes_path)
            
            etapa("Conectando ao banco de dados MySQL...", 1)
            
            # ============================================
            # CÓDIGO COMPLETO DO SCRIPT DE BONIFICAÇÃO
            # ============================================
            
            try:
                if not SA_OK:
                    raise Exception("SQLAlchemy não está disponível. Instale o conector MySQL.")
                
                db_config_input = input_data.get("db_config") or {}
                db_host = str(db_config_input.get("host") or os.getenv("DB_HOST") or "201.76.177.134")
                db_port = int(db_config_input.get("port") or os.getenv("DB_PORT") or 3306)
                db_user = str(db_config_input.get("user") or os.getenv("DB_USER") or "Indicadores")
                db_password_raw = str(db_config_input.get("password") or os.getenv("DB_PASSWORD") or "xEth+vOHltr*c4Eju3+t")
                db_name = str(db_config_input.get("database") or os.getenv("DB_NAME") or "indicadores")

                encoded_password = quote_plus(db_password_raw)
                # Adicionar charset utf8mb4 na conexão para garantir encoding correto
                connection_string = f"mysql+mysqldb://{db_user}:{encoded_password}@{db_host}:{db_port}/{db_name}?charset=utf8mb4"
                log_print(f"[Conexao] Tentando conectar ao banco de dados em {db_host}:{db_port} com usuário {db_user}...")
                engine = create_engine(
                    connection_string,
                    connect_args={
                        "connect_timeout": 8,
                        "read_timeout": 15,
                        "write_timeout": 15,
                        "charset": "utf8mb4"
                    },
                    pool_pre_ping=True,
                    pool_recycle=300
                )
                etapa("Testando conexao...", 2)
                conn = engine.connect()
                # Definir charset UTF-8 na conexão
                if SA_OK:
                    conn.execute(text("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'"))
                    conn.execute(text("SET CHARACTER SET utf8mb4"))
                    conn.execute(text("SET character_set_connection=utf8mb4"))
                etapa("Conexao OK", 3)
                
                # Classificar registros antigos (apenas se houver registros sem status)
                # Otimização: verifica apenas uma vez e só executa se necessário
                try:
                    result = conn.execute(text("""
                        SELECT COUNT(*) as total
                        FROM registro_bonificacao_descontos
                        WHERE status IS NULL OR (status = 'staging' AND run_id IS NULL)
                        LIMIT 1
                    """))
                    total = result.fetchone()[0]
                    if total > 0:
                        etapa("Classificando registros antigos...", 3.5)
                        classificar_registros_antigos(conn, log_print)
                        etapa("Registros antigos classificados", 3.6)
                except Exception as e:
                    log_print(f"[AVISO] Erro ao verificar/classificar registros antigos: {str(e)}")
                    # Não falhar o processo se houver erro
            except Exception as e:
                erro_msg = f"Erro ao conectar ao banco de dados: {str(e)}"
                log_print(f"[ERRO] {erro_msg}")
                etapa("Erro na conexao com banco de dados", 5)
                sys.stderr.flush()  # Flush apenas em caso de erro
                raise Exception(erro_msg)
            
            etapa("Carregando tabelas auxiliares do banco...", 4)
            log_print('|==========================================================================================================================')
            
            etapa("Carregando auxiliar_entidades...", 4)
            log_print('| - SQL Entidade', end='   ')
            aux_entidade_raw = pd.read_sql('SELECT * FROM auxiliar_entidades', engine)
            log_print('(finalizado)')
            
            etapa("Carregando auxiliar_operadoras...", 5)
            log_print('| - SQL Operadora', end='   ')
            aux_operadora_raw = pd.read_sql('SELECT * FROM auxiliar_operadoras', engine)
            log_print('(finalizado)')
            
            etapa("Carregando auxiliar_concessionarias...", 6)
            log_print('| - SQL Concessionarias', end='   ')
            aux_concessionarias_raw = pd.read_sql('SELECT * FROM auxiliar_concessionarias_02', engine)
            log_print('(finalizado)')
            
            etapa("Carregando auxiliar_planos...", 7)
            log_print('| - SQL Planos', end='   ')
            aux_planos_raw = pd.read_sql('SELECT * FROM auxiliar_planos', engine)
            log_print('(finalizado)')
            
            etapa("Carregando faixas de idade...", 8)
            log_print('| - SQL Faixas Idades', end='   ')
            aux_faixa_idade_raw = pd.read_sql('SELECT * FROM registro_bonificacao_idades', engine)
            log_print('(finalizado)')
            
            etapa("Carregando valores de bonificacao...", 9)
            log_print('| - SQL Bonificacao Valores', end='   ')
            aux_bonificacao_raw = pd.read_sql('SELECT * FROM registro_bonificacao_valores_v2', engine)
            log_print('(finalizado)')
            
            etapa("Carregando descontos...", 10)
            log_print('| - SQL Bonificacao Descontos', end='   ')
            aux_descontos_raw = pd.read_sql('SELECT * FROM registro_bonificacao_descontos', engine)
            log_print('(finalizado)')
            
            etapa("Carregando dados unificados...", 11)
            log_print('| - SQL Unificado', end='   ')
            unificado = pd.read_sql('SELECT * FROM unificado_bonificacao', engine)
            log_print('(finalizado)')
            
            etapa("Carregando chaves PIX...", 12)
            log_print('| - SQL Pix', end='   ')
            aux_pix_raw = pd.read_sql('SELECT * FROM registro_chave_pix', engine)
            log_print('(finalizado)')
            log_print('|==========================================================================================================================')
            
            etapa("Conectando ao Elasticsearch...", 26)
            if not ES_OK:
                raise Exception("Elasticsearch não está disponível. Instale a biblioteca elasticsearch.")
            
            cloud_id = 'QV_HCommerce_01:dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRkZGViZGRiZGYxY2I0NTc1ODVkYTNjNjg4ODQ1NjU0ZCQwM2FlYzAwYjY1M2M0ZjY3YmVmMmNiMjQ0OTZkMTM4ZQ=='
            username = 'indicadores@qvsaude.com.br'
            password = '@2023yAt4@pRi&QV1nd1c4d0r35'
            
            es = Elasticsearch(
                cloud_id=cloud_id,
                basic_auth=(username, password),
                request_timeout=1200
            )
            
            # Funções auxiliares (do código original)
            def download_tabela(cursor, table_name):
                query = f"SELECT * FROM {table_name}"
                cursor.execute(query)
                results = cursor.fetchall()
                cols = [description[0] for description in cursor.description]
                return pd.DataFrame(results, columns=cols)
            
            def baixar_relatorio_listagem_cobrancas(client, dt_inicial, dt_final, processo, proposta=False, conf_tempo=False):
                MAX_ES_SIZE = 20000  # Proteção contra cargas muito grandes
                
                if processo == "normal":
                    query = {
                        "range": {
                            "cobrancadatapagamento": {
                                "gte": dt_inicial,
                                "lte": dt_final
                            }
                        }
                    }
                elif processo == "complemento":
                    query = {
                        "bool": {
                            "must": [
                                {
                                    "range": {
                                        "cobrancadatapagamento": {
                                            "gte": dt_inicial,
                                            "lte": dt_final
                                        }
                                    }
                                },
                                {
                                    "terms": {
                                        "contratonumeroproposta.keyword": proposta
                                    }
                                }
                            ]
                        }
                    }
                
                tempo = time()
                n_max_raw = client.count(index='qv-relatorio-listagem-cobranca', query=query)['count']
                n_max = min(n_max_raw, MAX_ES_SIZE)  # Limitar tamanho máximo
                if conf_tempo:
                    log_print(f'Buscando número máximo: {time()-tempo}s', end='   ')
                
                if n_max_raw > MAX_ES_SIZE:
                    log_print(f'[AVISO] Limite de {MAX_ES_SIZE} documentos aplicado (total: {n_max_raw})')
                
                tempo = time()
                results = client.search(index='qv-relatorio-listagem-cobranca', query=query, size=n_max, request_timeout=90)
                df = pd.json_normalize(results['hits']['hits'])
                if conf_tempo:
                    log_print(f'Baixando relatorio: {time()-tempo}s', end='   ')
                
                return df
            
            def baixar_relatorio_contratos(client, contratos):
                query = {
                    "terms": {
                        "contratonumero.keyword": contratos
                    }
                }
                results = client.search(index='qv-relatorio-contrato', query=query, size=10000, scroll='30s')
                scroll_id = results['_scroll_id']
                total_hits = results['hits']['total']['value']
                df_final = pd.DataFrame()
                i = 1
                max_iterations = 10000  # Proteção contra loop infinito
                while True:
                    if i > max_iterations:
                        log_print(f'\n[AVISO: Limite máximo de iterações ({max_iterations}) atingido! Encerrando.]')
                        break
                    if i % 10 == 0:
                        log_print(f'{i}: {total_hits}')
                    else:
                        log_print(f'{i}: {total_hits}', end=' ')
                    df = pd.json_normalize(results['hits']['hits'])
                    total_hits -= len(results['hits']['hits'])
                    df_final = pd.concat([df_final, df]).reset_index(drop=True)
                    if total_hits > 0:
                        results = client.scroll(scroll_id=scroll_id, scroll='30s')
                    else:
                        break
                    i += 1
                return df_final
            
            def baixar_relatorio_beneficiario(client, propostas, conf_tempo=False):
                query = {
                    "terms": {
                        "contratonumeroproposta.keyword": propostas
                    }
                }
                tempo = time()
                n_max = client.count(index='qv-relatorio-beneficiario', query=query)['count']
                if conf_tempo:
                    log_print(f'Buscando número máximo: {time()-tempo}s', end='   ')
                
                tempo = time()
                results = client.search(index='qv-relatorio-beneficiario', query=query, size=n_max)
                df = pd.json_normalize(results['hits']['hits'])
                if conf_tempo:
                    log_print(f'Baixando relatorio: {time()-tempo}s', end='   ')
                return df
            
            def baixar_relatorio_corretores(client):
                query = {
                    "match_all": {}
                }
                results = client.search(index='qv-relatorio-corretor', query=query, size=10000, scroll='30s')
                scroll_id = results['_scroll_id']
                total_hits = results['hits']['total']['value']
                df_final = pd.DataFrame()
                i = 1
                max_iterations = 10000  # Proteção contra loop infinito
                while True:
                    if i > max_iterations:
                        log_print(f'\n[AVISO: Limite máximo de iterações ({max_iterations}) atingido! Encerrando.]')
                        break
                    if i % 10 == 0:
                        log_print(f'{i}: {total_hits}')
                    else:
                        log_print(f'{i}: {total_hits}', end=' ')
                    df = pd.json_normalize(results['hits']['hits'])
                    total_hits -= len(results['hits']['hits'])
                    df_final = pd.concat([df_final, df]).reset_index(drop=True)
                    if total_hits > 0:
                        results = client.scroll(scroll_id=scroll_id, scroll='30s')
                    else:
                        break
                    i += 1
                return df_final
            
            def padronizar_corretores(df_inicial):
                old_cols = ['_source.corretorid', '_source.corretorcpf', '_source.corretornome', '_source.corretoremail', 
                           '_source.corretordatanascimento', '_source.corretordddtelefone', '_source.corretornumtelefone',
                           '_source.corretordddcelular', '_source.corretornumcelular', '_source.corretorindcolaborador', 
                           '_source.corretorindlgpd', '_source.corretorindexcluido', '_source.corretordataexclusao',
                           '_source.corretorenderecocep', '_source.corretorenderecologradouro', '_source.corretorendereconumero', 
                           '_source.corretorenderecocomplemento', '_source.corretorenderecobairro',
                           '_source.corretorenderecomunicipio', '_source.corretorenderecouf']
                new_cols = ['Id', 'CPF', 'Nome', 'Email', 'DataNascimento', 'DDDTelefone', 'NumeroTelefone',
                           'DDDCelular', 'NumeroCelular', 'IndColaborador', 'IndLGPD', 'IndExcluido', 'DataInclusao',
                           'CEP', 'Logradouro', 'Numero', 'Complemento', 'Bairro',
                           'Município', 'UF']
                df_final = df_inicial[old_cols].copy()
                df_final.columns = new_cols
                return df_final
            
            def snake_case(colunas):
                colunas_novas = []
                for coluna in colunas:
                    coluna = coluna.lower()
                    coluna = coluna.replace(' ', '_')
                    coluna = coluna.replace('á', 'a')
                    coluna = coluna.replace('ã', 'a')
                    coluna = coluna.replace('é', 'e')
                    coluna = coluna.replace('ê', 'e')
                    coluna = coluna.replace('í', 'i')
                    coluna = coluna.replace('ó', 'o')
                    coluna = coluna.replace('õ', 'o')
                    coluna = coluna.replace('ú', 'u')
                    coluna = coluna.replace('ç', 'c')
                    coluna = coluna.replace('!', '')
                    coluna = coluna.replace('?', '')
                    coluna = coluna.replace(')', '')
                    coluna = coluna.replace('(', '')
                    coluna = coluna.replace('-', '')
                    colunas_novas.append(coluna)
                return colunas_novas
            
            def descobrir_desc_prod(df_desc, df, col_cpf, col_valor, col_df):
                desc_prod = df_desc[[col_cpf, col_valor]].copy()
                desc_prod['bonificado_produziu'] = desc_prod[col_cpf].apply(
                    lambda x: 'sim' if df[df[col_df] == x].shape[0] != 0 else 'nao'
                )
                return desc_prod
            
            def tabela_ticket_vidas(df):
                tabela = pd.DataFrame({
                    'nome': ['TOTAL: '],
                    'valor': [valor_para_texto(round((df['Vlr bruto Corretor'].sum() + df['Vlr bruto Supervisor'].sum()) / len(df), 2))],
                    'qtd': [str(len(df))]
                })
                for oper in df['Operadora'].unique().tolist():
                    tabela.loc[len(tabela)] = [
                        oper + ': ',
                        valor_para_texto(round((df[df['Operadora'] == oper]['Vlr bruto Corretor'].sum() + 
                                               df[df['Operadora'] == oper]['Vlr bruto Supervisor'].sum()) / 
                                              len(df[df['Operadora'] == oper]), 2)),
                        str(len(df[df['Operadora'] == oper]))
                    ]
                
                tabela = pd.concat([tabela[0:1], tabela[1:].sort_values('nome')]).reset_index(drop=True)
                
                tabela['n_char_n'] = tabela['nome'].str.len()
                tabela['n_char_v'] = tabela['valor'].str.len()
                tabela['n_char_q'] = tabela['qtd'].str.len()
                
                tabela['nome'] = tabela['nome'].apply(lambda x: corrigir_tamanho(tabela['n_char_n'].max(), x, 'SR$'))
                tabela['valor'] = tabela['valor'].apply(lambda x: corrigir_tamanho(tabela['n_char_v'].max(), x, 'CR$'))
                tabela['qtd'] = tabela['qtd'].apply(lambda x: corrigir_tamanho(tabela['n_char_q'].max(), x, 'SR$'))
                
                return tabela
            
            def achar_chave_bonificacao(df, operadora, tipo_beneficiario, tipo_faixa, entidade, plano, produto, vigencia):
                # busca de chaves com entidade
                df_filtrado = (df[(df['operadora'] == operadora) & (df['entidade'] == entidade) & 
                                 (df['plano'] == plano) & (df['tipo_beneficiario'] == tipo_beneficiario) & 
                                 (df['tipo_faixa'] == tipo_faixa) & (df['produto'] == produto)]
                              .sort_values('vigencia', ascending=False).reset_index(drop=True))
                if len(df_filtrado) >= 1:
                    for i in range(len(df_filtrado)):
                        if df_filtrado.loc[i, 'vigencia'] <= vigencia:
                            df_filtrado = df_filtrado[df_filtrado['vigencia'] == df_filtrado.loc[i, 'vigencia']]
                            if len(df_filtrado) == 1:
                                return df_filtrado['bonificacao_corretor'].values[0], df_filtrado['bonificacao_supervisor'].values[0], df_filtrado['chave'].values[0]
                            else:
                                return 2, 2, 'duplicado'
                
                # busca de chaves sem entidade
                df_filtrado = (df[(df['operadora'] == operadora) & (df['entidade'] == '-') & 
                                 (df['plano'] == plano) & (df['tipo_beneficiario'] == tipo_beneficiario) & 
                                 (df['tipo_faixa'] == tipo_faixa) & (df['produto'] == produto)]
                              .sort_values('vigencia', ascending=False).reset_index(drop=True))
                if len(df_filtrado) >= 1:
                    for i in range(len(df_filtrado)):
                        if df_filtrado.loc[i, 'vigencia'] <= vigencia:
                            df_filtrado = df_filtrado[df_filtrado['vigencia'] == df_filtrado.loc[i, 'vigencia']]
                            if len(df_filtrado) == 1:
                                return df_filtrado['bonificacao_corretor'].values[0], df_filtrado['bonificacao_supervisor'].values[0], df_filtrado['chave'].values[0]
                            else:
                                return 2, 2, 'duplicado'
                
                return 1, 1, 'sem chave'
            
            def achar_faixa_idade(df, operadora, tipo_beneficiario, idade, entidade, plano, vigencia):
                df_filtrado = df[(df['operadora'] == operadora) & (df['entidade'] == entidade) & 
                                (df['tipo_beneficiario'] == tipo_beneficiario) & (df['plano'] == plano)].sort_values('vigencia', ascending=False).reset_index(drop=True)
                if len(df_filtrado) == 0:
                    df_filtrado = df[(df['operadora'] == operadora) & (df['entidade'] == entidade) & 
                                   (df['tipo_beneficiario'] == tipo_beneficiario) & (df['plano'] == '-')].sort_values('vigencia', ascending=False).reset_index(drop=True)
                    if len(df_filtrado) == 0:
                        df_filtrado = df[(df['operadora'] == operadora) & (df['entidade'] == '-') & 
                                       (df['tipo_beneficiario'] == tipo_beneficiario) & (df['plano'] == plano)].sort_values('vigencia', ascending=False).reset_index(drop=True)
                        if len(df_filtrado) == 0:
                            df_filtrado = df[(df['operadora'] == operadora) & (df['entidade'] == '-') & 
                                           (df['tipo_beneficiario'] == tipo_beneficiario) & (df['plano'] == '-')].sort_values('vigencia', ascending=False).reset_index(drop=True)
                for i in range(len(df_filtrado)):
                    if df_filtrado.loc[i, 'vigencia'] <= vigencia:
                        df_filtrado = df_filtrado[df_filtrado['vigencia'] == df_filtrado.loc[i, 'vigencia']]
                        break
                for i in range(len(df_filtrado)):
                    df_filtrado_2 = df_filtrado[(df_filtrado['idade_min'] <= idade) & (df_filtrado['idade_max'] >= idade)].reset_index(drop=True)
                    if len(df_filtrado_2) != 0:
                        return df_filtrado_2.loc[i, 'chave_faixa']
                return 'fora da faixa'
            
            def achar_dias_cancelamento(dt, df):
                for i in range(len(df)):
                    if dt >= df.loc[i, 'dt']:
                        return df.loc[i, 'dias']
                log_print(dt)
            
            def relatorio(df, calc, filtros, dicionario_sem_registros, em_branco, dicionario_merges, ticket_medio, propostas_iniciais, num_apur, dt, return_mode="summary"):
                # valor produzido
                vlr_bruto_cor = valor_para_texto(calc[calc['tipo_premiado'].str.contains('CORRETOR')]['vlr_bruto'].sum())
                vlr_bruto_sup = valor_para_texto(calc[calc['tipo_premiado'].str.contains('SUPERVISOR')]['vlr_bruto'].sum())
                vlr_bruto_total = valor_para_texto(calc['vlr_bruto'].sum())
                y = len(vlr_bruto_total) + 1 if len(vlr_bruto_total) > len(vlr_bruto_sup) and len(vlr_bruto_total) > len(vlr_bruto_cor) else len(vlr_bruto_sup) + 1 if len(vlr_bruto_sup) > len(vlr_bruto_total) and len(vlr_bruto_sup) > len(vlr_bruto_cor) else len(vlr_bruto_cor) + 1
                vlr_bruto_cor = corrigir_tamanho(y, vlr_bruto_cor, 'CR$')
                vlr_bruto_sup = corrigir_tamanho(y, vlr_bruto_sup, 'CR$')
                vlr_bruto_total = corrigir_tamanho(y, vlr_bruto_total, 'CR$')
                
                # descontos
                desc_cor = valor_para_texto(calc[calc['tipo_premiado'].str.contains('CORRETOR')]['desc'].sum())
                desc_sup = valor_para_texto(calc[calc['tipo_premiado'].str.contains('Supervisor')]['desc'].sum())
                desc_total = valor_para_texto(calc['desc'].sum())
                y = len(desc_total) + 1 if len(desc_total) > len(desc_sup) and len(desc_total) > len(desc_cor) else len(desc_sup) + 1 if len(desc_sup) > len(desc_total) and len(desc_sup) > len(desc_cor) else len(desc_cor) + 1
                desc_cor = corrigir_tamanho(y, desc_cor, 'CR$')
                desc_sup = corrigir_tamanho(y, desc_sup, 'CR$')
                desc_total = corrigir_tamanho(y, desc_total, 'CR$')
                
                # valor a pagar
                vlr_liquido_cor = valor_para_texto(calc[calc['tipo_premiado'].str.contains('CORRETOR')]['vlr_liquido'].sum())
                vlr_liquido_sup = valor_para_texto(calc[calc['tipo_premiado'].str.contains('SUPERVISOR')]['vlr_liquido'].sum())
                vlr_liquido_total = valor_para_texto(calc['vlr_liquido'].sum())
                y = len(vlr_liquido_total) + 1 if len(vlr_liquido_total) > len(vlr_liquido_sup) and len(vlr_liquido_total) > len(vlr_liquido_cor) else len(vlr_liquido_sup) + 1 if len(vlr_liquido_sup) > len(vlr_liquido_total) and len(vlr_liquido_sup) > len(vlr_liquido_cor) else len(vlr_liquido_cor) + 1
                vlr_liquido_cor = corrigir_tamanho(y, vlr_liquido_cor, 'CR$')
                vlr_liquido_sup = corrigir_tamanho(y, vlr_liquido_sup, 'CR$')
                vlr_liquido_total = corrigir_tamanho(y, vlr_liquido_total, 'CR$')
                
                log_print(f'''|====================================================  RELATORIO  =====================================================|
|======================================================  {num_apur} {dt.strftime("%b").upper()}  =======================================================|
|======================================================================================================================|
| Total        | Producao: \033[94m{vlr_bruto_total}\033[00m | Desconto: \033[91m{desc_total}\033[00m | Valor a pagar: \033[92m{vlr_liquido_total}\033[00m |
| Corretores   | Producao: {vlr_bruto_cor} | Desconto: {desc_cor} | Valor a pagar: {vlr_liquido_cor} |
| Supervisores | Producao: {vlr_bruto_sup} | Desconto: {desc_sup} | Valor a pagar: {vlr_liquido_sup} |
|======================================================================================================================|
| Vidas Faturadas: {propostas_iniciais} | Vidas Pagas: {len(df)} | Ticket Medio: {valor_para_texto(ticket_medio)}''')
                
                # print das informações de filtro
                x = 0
                for filtro in filtros:
                    if len(filtros[filtro]) != 0:
                        x = 1
                if x == 1:
                    log_print('|======================================================================================================================|')
                    log_print(f'| \033[93mFILTROS\033[00m')
                    for filtro in filtros:
                        if len(filtros[filtro]) != 0:
                            log_print('|----------------------------------------------------------------------------------------------------------------------|')
                            log_print(f'| {filtro}')
                            for item in filtros[filtro]:
                                log_print(f'| - {item}')
                
                # print dos erros de merges
                x = 0
                for merge in dicionario_merges:
                    if dicionario_merges[merge] == 'Erro':
                        x = 1
                if x == 1:
                    log_print('|======================================================================================================================|')
                    log_print(f'| \033[93mERRO DE MERGE\033[00m')
                    log_print('|----------------------------------------------------------------------------------------------------------------------|')
                    for merge in dicionario_merges:
                        if dicionario_merges[merge] == 'Erro':
                            log_print(f'| {merge}: \033[91m{dicionario_merges[merge]}\033[00m')
                        else:
                            log_print(f'| {merge}: \033[92m{dicionario_merges[merge]}\033[00m')
                
                # print dos nomes não registrados nas auxiliares
                x = 0
                for setor in dicionario_sem_registros:
                    if len(dicionario_sem_registros[setor]) != 0:
                        x = 1
                if x == 1:
                    log_print('|======================================================================================================================|')
                    log_print(f'| \033[93mINFORMAÇÕES NÃO REGISTRADAS NAS AUXILIARES\033[00m')
                    for setor in dicionario_sem_registros:
                        if len(dicionario_sem_registros[setor]) != 0:
                            log_print('|----------------------------------------------------------------------------------------------------------------------|')
                            log_print(f'| {setor}')
                            for item in dicionario_sem_registros[setor]:
                                log_print(f'| - {item}')
                
                # print da quantidade de valores em branco em cada coluna
                if len(em_branco) != 0:
                    log_print('''|======================================================================================================================|
| VALORES GERAIS EM BRANCO: 
|----------------------------------------------------------------------------------------------------------------------''')
                    for col, qtd in em_branco.items():
                        log_print(f'| - {col}: {qtd}')
                log_print('|======================================================================================================================|')
            
            etapa("Baixando relatorios do Elasticsearch...", 30)
            log_print('|==========================================================================================================================')
            
            etapa("Baixando relatorio de faturamento...", 32)
            log_print('| - Faturamento', end='   ')
            faturamento_raw = baixar_relatorio_listagem_cobrancas(es, data_inicial, data_final, "normal")
            log_print('                            (finalizado)')
            
            etapa("Baixando relatorio de contratos...", 40)
            log_print('| - Contratos', end='   ')
            contratos = baixar_relatorio_contratos(es, faturamento_raw['_source.contratonumero'].drop_duplicates().tolist())
            log_print('(finalizado)')
            
            etapa("Baixando relatorio de beneficiarios...", 50)
            log_print('| - Beneficiarios', end='   ')
            beneficiarios = baixar_relatorio_beneficiario(es, faturamento_raw[pd.isna(faturamento_raw['_source.contratonumeroproposta']) == False]['_source.contratonumeroproposta'].drop_duplicates().tolist())
            log_print('                          (finalizado)')
            
            etapa("Baixando relatorio de corretores...", 58)
            log_print('| - Corretores', end='   ')
            bonificados = baixar_relatorio_corretores(es)
            log_print('(finalizado)')
            log_print('|==========================================================================================================================')
            
            etapa("Processando e mesclando dados...", 60)
            # Removido locale.setlocale para evitar overhead - usar valor_para_texto diretamente
            
            df_beneficiarios = beneficiarios[['_source.contratonumero', '_source.contratonumeroproposta', '_source.filialgerencialnome', 
                                              '_source.operadoranomefantasia', '_source.contratocomercialmesbasereajuste',
                                              '_source.entidadesigla', '_source.planonome', '_source.contratodatainiciovigencia', 
                                              '_id', '_source.beneficiarioinddesligado', '_source.beneficiariocpf',
                                              '_source.beneficiarionome', '_source.beneficiariodatadenascimento', '_source.beneficiariosexo', 
                                              '_source.beneficiariotipodescricao',
                                              '_source.beneficiariodatadesligamento', '_source.beneficiariodescricaoreducaocarencia']].copy()
            df_beneficiarios.columns = ['numero_contrato', 'numero_da_proposta', 'filial_gerencial', 'operadora', 'mes_reajuste', 
                                       'entidade', 'plano', 'vigencia',
                                       'id_beneficiario', 'beneficiario_cancelado', 'cpf', 'nome', 'dt_nascimento', 'sexo', 'tipo',
                                       'data_exclusao', 'descricao_da_reducao_de_carencia']
            
            df_contratos = contratos[['_source.contratonumero', '_source.corretoracodigo', '_source.supervisorcpf', 
                                     '_source.supervisornome', '_source.corretorcpf', '_source.corretornome']].copy()
            df_contratos.columns = ['numero_contrato', 'codigo', 'cpf_supervisor', 'nome_supervisor', 'cpf_vendedor', 'nome_vendedor']
            
            df_faturamento = faturamento_raw[['_source.contratonumero', '_source.cobrancaciclo', '_source.cobrancacompetenciames', 
                                             '_source.cobrancacompetenciaano', '_source.contratostatusdescricao', '_source.cobrancadatapagamento']]
            df_faturamento.columns = ['numero_do_contrato', 'numero_da_parcela', 'mes_competencia', 'ano_competencia', 
                                     'status_da_fatura', 'data_do_pagamento_da_fatura']
            
            aux_bonificados = padronizar_corretores(bonificados)
            aux_bonificados.columns = snake_case(aux_bonificados.columns)
            
            df_unificado = unificado.copy()
            
            aux_bonificacao = aux_bonificacao_raw.copy()
            aux_bonificacao['vigencia'] = pd.to_datetime(aux_bonificacao['vigencia'])
            aux_bonificacao.rename(columns={'chave_sem_formula': 'chave'}, inplace=True)
            aux_bonificacao = aux_bonificacao.sort_values('vigencia', ascending=False)
            
            aux_operadora = aux_operadora_raw.copy()
            
            aux_entidade = aux_entidade_raw.copy()
            aux_entidade = aux_entidade.drop_duplicates('nome_antigo')
            
            aux_concessionarias = aux_concessionarias_raw[['codigo', 'nome_fantasia']].drop_duplicates('codigo').reset_index(drop=True)
            
            aux_faixa_idade = aux_faixa_idade_raw.copy()
            aux_faixa_idade['vigencia'] = pd.to_datetime(aux_faixa_idade['vigencia'])
            
            aux_planos = aux_planos_raw.copy().drop_duplicates('nome_antigo')
            
            aux_descontos = aux_descontos_raw.copy()
            aux_descontos['valor'] = aux_descontos['valor'].astype(float)
            
            aux_pix_corretor = aux_pix_raw[['cpf', 'chave_pix', 'tipo_chave']].copy().rename(
                columns={'cpf': 'cpf_vendedor', 'chave_pix': 'chave_pix_vendedor', 'tipo_chave': 'tipo_chave_vendedor'})
            aux_pix_supervisor = aux_pix_raw[['cpf', 'chave_pix', 'tipo_chave']].copy().rename(
                columns={'cpf': 'cpf_supervisor', 'chave_pix': 'chave_pix_supervisor', 'tipo_chave': 'tipo_chave_supervisor'})
            
            etapa("Aplicando transformacoes e calculos...", 62)
            df1 = df_beneficiarios.copy()
            df1['dt_nascimento'] = pd.to_datetime(df1['dt_nascimento']).dt.tz_localize(None)
            df1['data_exclusao'] = pd.to_datetime(df1['data_exclusao']).dt.tz_localize(None)
            df1['vigencia'] = pd.to_datetime(df1['vigencia']).dt.tz_localize(None)
            df1['idade'] = df1['dt_nascimento'].apply(
                lambda x: dt.now().year - x.year - 1 if dt.now().month < x.month else 
                          dt.now().year - x.year if dt.now().month > x.month else 
                          dt.now().year - x.year if dt.now().day >= x.day else dt.now().year - x.year - 1
            )
            df1['chave_id'] = df1[['numero_da_proposta', 'id_beneficiario']].apply(
                lambda x: x['numero_da_proposta'] + x['id_beneficiario'], axis=1
            )
            df1['beneficiario_cancelado'] = df1['beneficiario_cancelado'].fillna(False)
            
            df_faturamento['data_do_pagamento_da_fatura'] = pd.to_datetime(df_faturamento['data_do_pagamento_da_fatura']).dt.tz_localize(None)
            
            df_contratos = df_contratos.drop_duplicates('numero_contrato')
            
            etapa("Mesclando dados de contratos...", 64)
            n_row = df1.shape[0]
            df1 = df1.merge(df_contratos, 'left', 'numero_contrato')
            merge_contratos = 'Certo' if df1.shape[0] == n_row else 'Erro'
            
            df1 = df1.merge(df_faturamento, 'left', left_on='numero_contrato', right_on='numero_do_contrato').drop(columns='numero_do_contrato')
            
            df1['numero_da_parcela'] = df1['numero_da_parcela'].fillna(0)
            df1['numero_da_parcela'] = df1['numero_da_parcela'].astype('int64')
            df1['mes_competencia'] = df1['mes_competencia'].fillna(0)
            df1['mes_competencia'] = df1['mes_competencia'].astype('int64')
            df1['ano_competencia'] = df1['ano_competencia'].fillna(0)
            df1['ano_competencia'] = df1['ano_competencia'].astype('int64')
            df1['data_do_pagamento_da_fatura'] = pd.to_datetime(df1['data_do_pagamento_da_fatura']).dt.tz_localize(None)
            df1['vigencia'] = pd.to_datetime(df1['vigencia'], dayfirst=True)
            df1['data_exclusao'] = pd.to_datetime(df1['data_exclusao'], dayfirst=True)
            df1['nome_supervisor'] = df1['nome_supervisor'].str.upper()
            df1['nome_vendedor'] = df1['nome_vendedor'].str.upper()
            df1['nome'] = df1['nome'].str.upper()
            df1[['cpf_supervisor', 'cpf_vendedor']] = df1[['cpf_supervisor', 'cpf_vendedor']].apply(
                lambda x: x.astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)
            )
            
            aux_bonificacao['bonificacao_corretor'] = aux_bonificacao['bonificacao_corretor'].astype('int64')
            aux_bonificacao['bonificacao_supervisor'] = aux_bonificacao['bonificacao_supervisor'].astype('int64')
            
            aux_bonificados['email'] = aux_bonificados['email'].str.lower()
            aux_bonificados['nome'] = aux_bonificados['nome'].str.upper()
            aux_bonificados['celular'] = aux_bonificados['dddcelular'] + aux_bonificados['numerocelular']
            aux_bonificados = aux_bonificados[['cpf', 'nome', 'email', 'celular']]
            aux_bonificados = aux_bonificados.drop_duplicates('cpf').reset_index(drop=True)
            
            df_unificado['dt_registro'] = pd.to_datetime(df_unificado['dt_registro'])
            df_unificado['dt_exclusao'] = pd.to_datetime(df_unificado['dt_exclusao'])
            df_unificado['dt_analise'] = pd.to_datetime(df_unificado['dt_analise'])
            df_unificado['dt_pagamento'] = pd.to_datetime(df_unificado['dt_pagamento'])
            df_unificado['dt_inicio_vigencia'] = pd.to_datetime(df_unificado['dt_inicio_vigencia'])
            
            etapa("Mesclando tabelas auxiliares...", 66)
            df2 = df1.drop(columns='data_exclusao').copy()
            df2.rename(columns={'cpf': 'cpf_beneficiario', 'tipo': 'tipo_de_beneficiario'}, inplace=True)
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_entidade, 'left', left_on='entidade', right_on='nome_antigo', suffixes=('', '_nova')).drop(columns=['nome_antigo']).rename(columns={'nome_novo': 'entidade_nova'})
            merge_entidade = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_operadora, 'left', left_on='operadora', right_on='nome_antigo').drop(columns=['nome_antigo']).rename(columns={'nome_novo': 'operadora_nova'})
            merge_operadora = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_concessionarias, 'left', on='codigo').rename(columns={'nome_fantasia': 'concessionaria_nova'})
            merge_concessionaria = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_planos, 'left', left_on='plano', right_on='nome_antigo').drop(columns=['nome_antigo']).rename(columns={'nome_novo': 'plano_novo'})
            merge_plano = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            etapa("Aplicando filtros de exclusao...", 68)
            df2 = df2[(df2['operadora'] != 'INTEGRAL SAÚDE POP RIO') &
                     (df2['beneficiario_cancelado'] != True) &
                     (df2['numero_da_parcela'] == 1) &
                     (df2['concessionaria_nova'] != 'A2 CORRETORA') &
                     (df2['concessionaria_nova'] != 'BRISE CORRETORA') &
                     (df2['concessionaria_nova'] != 'MB2 CORRETORA') &
                     (df2['concessionaria_nova'] != 'FAST CORRETORA') &
                     (df2['concessionaria_nova'] != 'FAST-PORT CORRETORA') &
                     (df2['concessionaria_nova'] != 'FAST CORRETORA-TLV') &
                     (df2['concessionaria_nova'] != 'A2_PME CORRETORA') &
                     (df2['concessionaria_nova'] != 'MIGRACAO CORRETORA') &
                     (df2['concessionaria_nova'] != 'MIGRACAO - CORRETORA') &
                     (df2['concessionaria_nova'] != 'A2 CORRETORA-TLV CORRETORA') &
                     (df2['concessionaria_nova'] != 'FAST CORRETORA-TLV CORRETORA') &
                     (df2['plano'] != 'DENTAL') &
                     (df2['plano'] != 'UNIMED DENTAL') &
                     (df2['plano'] != 'DENTSIM 10') &
                     (df2['plano'] != 'DENTSIM 20') &
                     (df2['plano'].str.contains('DENT') == False) &
                     (df2['entidade'] != 'AERO') &
                     (df2['entidade'] != 'AFAMA') &
                     (df2['entidade'] != 'AGERIO') &
                     (df2['entidade'] != 'UNASPLAERJ') &
                     (df2['entidade'] != 'UNEICEF') &
                     (df2['entidade'] != 'NUCLEP') &
                     (df2['entidade'] != 'ASMED')].copy().reset_index(drop=True)
            
            entidades_novas = df2[pd.isna(df2['entidade_nova'])]['entidade'].to_list()
            planos_novos = df2[pd.isna(df2['plano_novo'])]['plano'].to_list()
            concessionarias_novas = df2[pd.isna(df2['concessionaria_nova'])]['codigo'].to_list()
            operadoras_novas = df2[pd.isna(df2['operadora_nova'])]['operadora'].to_list()
            
            df2 = df2[(pd.isna(df2['entidade_nova']) == False) & 
                     (pd.isna(df2['operadora_nova']) == False) & 
                     (pd.isna(df2['concessionaria_nova']) == False) & 
                     (pd.isna(df2['plano_novo']) == False)].reset_index(drop=True)
            
            etapa("Aplicando transformacoes de dados...", 70)
            df2['mes_reajuste'] = df2['mes_reajuste'].apply(
                lambda x: 'Janeiro' if x == 1 else
                         'Fevereiro' if x == 2 else
                         'Março' if x == 3 else
                         'Abril' if x == 4 else
                         'Maio' if x == 5 else
                         'Junho' if x == 6 else
                         'Julho' if x == 7 else
                         'Agosto' if x == 8 else
                         'Setembro' if x == 9 else
                         'Outubro' if x == 10 else
                         'Novembro' if x == 11 else
                         'Dezembro' if x == 12 else 'erro'
            )
            
            df2['numero_da_parcela'] = df2['numero_da_parcela'].apply(
                lambda x: '1ª Parcela' if x == 1 else '2ª Parcela' if x == 2 else 'erro'
            )
            
            df2['produto'] = np.where(df2['numero_da_proposta'].str.contains('PA', na=True), 'PME', 'ADESAO')
            
            etapa("Calculando faixas de pagamento...", 72)
            df2['faixa_pagamento'] = df2[['operadora_nova', 'tipo_de_beneficiario', 'idade', 'entidade_nova', 'plano_novo', 'vigencia']].apply(
                lambda x: achar_faixa_idade(aux_faixa_idade, x['operadora_nova'], x['tipo_de_beneficiario'], x['idade'], 
                                           x['entidade_nova'], x['plano_novo'], x['vigencia']), axis=1
            )
            
            mask = (
                (df2['operadora'] == 'NOVA SAUDE') &
                (df2['idade'].between(3, 18, inclusive='both')) &
                (df2['plano'].astype('string').str.contains('AD COPART', case=False, na=False, regex=False)) &
                (df2['entidade'].astype('string').str.contains('ABRAE', case=False, na=False, regex=False))
            )
            
            df2['faixa_pagamento'] = np.where(mask, 'Faixa 01', df2['faixa_pagamento'])
            
            mask2 = (
                (df2['operadora'] == 'NOVA SAUDE') &
                (df2['tipo_de_beneficiario'] == 'Dependente') &
                (df2['idade'].between(0, 18, inclusive='both'))
            )
            
            df2['faixa_pagamento'] = np.where(mask2, 'Faixa 01', df2['faixa_pagamento'])
            
            df2 = df2[~(df2['faixa_pagamento'] == 'fora da faixa')].copy().reset_index(drop=True)
            
            etapa("Calculando bonificacoes...", 74)
            df2[['bonificacao_corretor', 'bonificacao_supervisor', 'chave_regra']] = df2[['operadora', 'tipo_de_beneficiario', 'faixa_pagamento', 
                                                                                         'entidade', 'plano_novo', 'produto', 'vigencia']].apply(
                lambda x: achar_chave_bonificacao(aux_bonificacao, x['operadora'], x['tipo_de_beneficiario'], x['faixa_pagamento'],
                                                 x['entidade'], x['plano_novo'], x['produto'], x['vigencia']), axis=1
            ).apply(pd.Series)
            
            etapa("Mesclando dados de bonificados...", 76)
            n_row = df2.shape[0]
            df2 = df2.merge(aux_bonificados[['cpf', 'email', 'celular']], 'left', left_on='cpf_vendedor', right_on='cpf', suffixes=('', '_1')).drop(columns='cpf')
            merge_bonificados_cor = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_bonificados[['cpf', 'email', 'celular']], 'left', left_on='cpf_supervisor', right_on='cpf', suffixes=('', '_2')).drop(columns='cpf')
            merge_bonificados_sup = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_pix_corretor[['cpf_vendedor', 'chave_pix_vendedor', 'tipo_chave_vendedor']], 'left', on='cpf_vendedor')
            merge_pix_corretor = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            n_row = df2.shape[0]
            df2 = df2.merge(aux_pix_supervisor[['cpf_supervisor', 'chave_pix_supervisor', 'tipo_chave_supervisor']], 'left', on='cpf_supervisor')
            merge_pix_supervisor = 'Certo' if df2.shape[0] == n_row else 'Erro'
            
            df2['bonificacao_corretor'] = df2[['bonificacao_corretor', 'faixa_pagamento']].apply(
                lambda x: 0 if (pd.notna(x['bonificacao_corretor']) == False) & (x['faixa_pagamento'] == 'Não Elegível') else x['bonificacao_corretor'], axis=1
            )
            df2['bonificacao_supervisor'] = df2[['bonificacao_supervisor', 'faixa_pagamento']].apply(
                lambda x: 0 if (pd.notna(x['bonificacao_supervisor']) == False) & (x['faixa_pagamento'] == 'Não Elegível') else x['bonificacao_supervisor'], axis=1
            )
            
            chaves_novas = df2[df2['bonificacao_corretor'].isin([1, 2, 3])][['operadora', 'tipo_de_beneficiario', 'faixa_pagamento', 
                                                                              'entidade_nova', 'plano_novo', 'produto', 'vigencia', 'numero_da_parcela']].reset_index(drop=True)
            chaves_novas['chave'] = chaves_novas['vigencia'].dt.strftime('%b/%y') + ' - ' + chaves_novas['operadora'] + ' - ' + chaves_novas['entidade_nova'] + ' - ' + chaves_novas['numero_da_parcela'] + ' - ' + chaves_novas['plano_novo'] + ' - ' + chaves_novas['faixa_pagamento'] + ' - ' + chaves_novas['tipo_de_beneficiario'] + ' - ' + chaves_novas['produto']
            chaves_novas = chaves_novas['chave'].sort_values().unique().tolist()
            
            df2['regiao'] = df2['concessionaria_nova'].apply(
                lambda x: 'PE' if '(PE)' in str(x) else 'SP' if '(SP)' in str(x) else 'RJ'
            )
            
            df2['chave_regra'] = df2[['vigencia', 'chave_regra']].apply(
                lambda x: x['chave_regra'] + ' - ' + x['vigencia'].strftime('%b/%y'), axis=1
            )
            df2['bonificacao_supervisor'] = df2[['vigencia', 'bonificacao_supervisor', 'filial_gerencial']].apply(
                lambda x: 0 if (x['vigencia'] < pd.to_datetime('2024-01-01')) & (x['filial_gerencial'] != 'FILIAL SP') else x['bonificacao_supervisor'], axis=1
            )
            
            etapa("Processando migracoes...", 78)
            # Verificar se arquivo de migracoes existe antes de ler
            if not os.path.exists(migracoes_path):
                etapa("Arquivo de migracoes nao encontrado, seguindo sem migracoes", 78)
                log_print(f"[AVISO] Arquivo nao encontrado: {migracoes_path}")
                migracoes_raw = pd.DataFrame(columns=['numero_da_proposta', 'parcela'])
                df0migr = migracoes_raw.copy()
            else:
                migracoes_raw = pd.read_excel(migracoes_path, dtype={'numero_contrato': str}).rename(columns={'numero_contrato': 'numero_da_proposta'})
                df0migr = migracoes_raw.copy()
                df0migr = df0migr[['numero_da_proposta', 'parcela']].drop_duplicates('numero_da_proposta').reset_index(drop=True)
            
            n_row = len(df2)
            df2 = df2.merge(df0migr, 'left', 'numero_da_proposta')
            conf_merge = 0 if n_row == len(df2) else 1
            df2 = df2[df2['parcela'].isna()].copy().reset_index(drop=True)
            
            etapa("Preparando estrutura final...", 80)
            df3 = df2[['numero_contrato', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia', 'cpf_beneficiario', 
                      'nome', 'tipo_de_beneficiario', 'idade',
                      'numero_da_parcela', 'status_da_fatura', 'data_do_pagamento_da_fatura', 'concessionaria_nova', 
                      'cpf_vendedor', 'nome_vendedor', 'bonificacao_corretor', 'email',
                      'celular', 'cpf_supervisor', 'nome_supervisor', 'bonificacao_supervisor', 'email_2', 'celular_2', 
                      'id_beneficiario', 'regiao', 'codigo', 'chave_regra', 'chave_pix_vendedor',
                      'tipo_chave_vendedor', 'chave_pix_supervisor', 'tipo_chave_supervisor']].copy()
            
            df3 = df3[df3['chave_regra'].str.find('Não Elegível') == -1].reset_index(drop=True)
            df3 = df3[~(df3['bonificacao_corretor'].isin([1, 2, 3]))].reset_index(drop=True)
            df3 = df3[~(df3['bonificacao_corretor'].isin([0]))].reset_index(drop=True)
            df3 = df3[df3['chave_regra'].str.find('nao achou') == -1].reset_index(drop=True)
            df3 = df3[df3['chave_regra'].str.find('Erro') == -1].reset_index(drop=True)
            df3 = df3[df3['chave_regra'].str.find('Não Elegível') == -1].reset_index(drop=True)
            df3 = df3[df3['chave_regra'].str.find('fora da faixa') == -1].reset_index(drop=True)
            
            etapa("Processando unificado para evitar duplicatas...", 82)
            CUT = date(2025, 9, 25)
            
            unificado_before = unificado[unificado['dt_analise'] < CUT].copy().reset_index(drop=True)
            unificado_after = unificado[unificado['dt_analise'] > CUT].copy().reset_index(drop=True)
            unificado_corretor = unificado_before[['numero_proposta', 'cpf_corretor', 'cpf']].copy().rename(columns={'cpf_corretor': 'cpfP'})
            unificado_supervisor = unificado_before[['numero_proposta', 'cpf_supervisor', 'cpf']].copy().rename(columns={'cpf_supervisor': 'cpfP'})
            unificado_after = unificado_after[['numero_proposta', 'cpf_corretor', 'cpf']].copy().rename(columns={'cpf_corretor': 'cpfP'})
            unificado_paid = pd.concat([unificado_after, unificado_corretor, unificado_supervisor]).reset_index(drop=True)
            unificado_paid['chave_paid'] = unificado_paid['numero_proposta'] + unificado_paid['cpfP'] + unificado_paid['cpf']
            
            ids_unificado = (unificado_paid['chave_paid'].astype('string').str.strip().str.upper().dropna().drop_duplicates())
            
            etapa("Separando corretores e supervisores...", 84)
            df_corretor = df3[['numero_contrato', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia',
                              'cpf_beneficiario', 'nome', 'tipo_de_beneficiario', 'idade', 'numero_da_parcela',
                              'status_da_fatura', 'data_do_pagamento_da_fatura', 'concessionaria_nova', 'cpf_vendedor',
                              'nome_vendedor', 'bonificacao_corretor', 'email', 'celular', 'id_beneficiario', 'regiao',
                              'codigo', 'chave_regra', 'chave_pix_vendedor', 'tipo_chave_vendedor']].rename(
                columns={
                    'bonificacao_corretor': 'bonificacao',
                    'chave_pix_vendedor': 'chave_pix',
                    'tipo_chave_vendedor': 'tipo_chave'
                })
            df_corretor['_contrato_prop_norm'] = df_corretor['numero_da_proposta'] + df_corretor['cpf_vendedor'] + df_corretor['cpf_beneficiario']
            
            df_corretor = df_corretor[~df_corretor['_contrato_prop_norm'].isin(ids_unificado)].drop(columns=['_contrato_prop_norm'])
            
            df_supervisor = df3[['numero_contrato', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia',
                                'cpf_beneficiario', 'nome', 'tipo_de_beneficiario', 'idade', 'numero_da_parcela',
                                'status_da_fatura', 'data_do_pagamento_da_fatura', 'concessionaria_nova', 'cpf_supervisor',
                                'nome_supervisor', 'bonificacao_supervisor', 'email_2', 'celular_2', 'id_beneficiario',
                                'regiao', 'codigo', 'chave_regra', 'chave_pix_supervisor', 'tipo_chave_supervisor']].rename(
                columns={
                    'cpf_supervisor': 'cpf_vendedor',
                    'nome_supervisor': 'nome_vendedor',
                    'bonificacao_supervisor': 'bonificacao',
                    'chave_pix_supervisor': 'chave_pix',
                    'tipo_chave_supervisor': 'tipo_chave',
                    'email_2': 'email', 'celular_2': 'celular'
                })
            df_supervisor['_contrato_prop_norm'] = df_supervisor['numero_da_proposta'] + df_supervisor['cpf_vendedor'] + df_supervisor['cpf_beneficiario']
            df_supervisor = df_supervisor[~df_supervisor['_contrato_prop_norm'].isin(ids_unificado)].drop(columns=['_contrato_prop_norm'])
            
            etapa("Unificando corretores e supervisores...", 85)
            df4 = pd.concat([df_corretor.assign(tipo_vendedor='corretor'), df_supervisor.assign(tipo_vendedor='supervisor')], ignore_index=True)

            def _clean(series: pd.Series) -> pd.Series:
                return (
                    series.astype("string")
                    .fillna(pd.NA)
                    .str.strip()
                    .replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "NULL": pd.NA})
                )

            def coalesce(df: pd.DataFrame, cols: list[str]) -> pd.Series:
                existing = [c for c in cols if c in df.columns]
                if not existing:
                    return pd.Series([""] * len(df), dtype="string")
                temp = df[existing].apply(_clean)
                return temp.bfill(axis=1).iloc[:, 0].fillna("").astype("string")

            df4.columns = df4.columns.str.strip()
            df4['chave_pix'] = _clean(df4['chave_pix'])
            df4_sem_pix = df4[df4['chave_pix'].isna()].copy().reset_index(drop=True)
            df4_sem_pix = (
                df4_sem_pix.sort_values(by=["cpf_vendedor", "nome_vendedor"], ascending=[True, False])
                .drop_duplicates(subset="cpf_vendedor", keep="first")
                .reset_index(drop=True)
            )

            df4_sem_pix["NOME_RAZAO_SOCIAL"] = coalesce(df4_sem_pix, ["nome_vendedor", "nome"])
            df4_sem_pix["CPF_CNPJ"] = coalesce(df4_sem_pix, ["cpf_vendedor", "cpf"])
            df4_sem_pix["EMAIL"] = coalesce(df4_sem_pix, ["email", "email_vendedor", "email_2"])
            df4_sem_pix["CELULAR"] = coalesce(df4_sem_pix, ["celular", "celular_vendedor", "celular_2"])
            df4_sem_pix["VALOR"] = 0
            df4_sem_pix = df4_sem_pix[["NOME_RAZAO_SOCIAL", "CPF_CNPJ", "EMAIL", "CELULAR", "VALOR"]]

            print("[DBG] df4_sem_pix cols:", list(df4_sem_pix.columns))
            sample_rows = df4_sem_pix.head(3).to_dict(orient="records")
            print("[DBG] df4_sem_pix sample (3):", sample_rows)
            empty_names = df4_sem_pix["NOME_RAZAO_SOCIAL"].isna() | (df4_sem_pix["NOME_RAZAO_SOCIAL"] == "")
            print("[DBG] empty names:", int(empty_names.sum()))
            df4_com_pix = df4[~df4['chave_pix'].isna()].copy().reset_index(drop=True)
            
            etapa("Calculando descontos e valores finais...", 86)
            descontos = aux_descontos[['cpf', 'valor']].groupby('cpf', sort=False).sum().reset_index().sort_values('valor')
            pag_cor = (df4_com_pix.loc[df4_com_pix['tipo_vendedor'] == 'corretor', ['cpf_vendedor', 'nome_vendedor', 'bonificacao']]
                      .groupby(['cpf_vendedor', 'nome_vendedor'], as_index=False, sort=False)['bonificacao'].sum().sort_values('bonificacao', ascending=False))
            pag_cor.columns = ['cpf', 'nome', 'vlr_bruto']
            pag_cor = pag_cor.merge(descontos, how='left', on='cpf').rename(columns={'valor': 'saldo'})
            pag_cor['saldo'] = pag_cor['saldo'].fillna(0)
            # Substituir apply por operação vetorizada (muito mais rápido)
            # Cálculo: desc = saldo se -saldo <= vlr_bruto*0.45, senão -vlr_bruto*0.45
            max_desc_permitido = pag_cor['vlr_bruto'] * 0.45
            # Usar np.where para operação vetorizada (muito mais rápido que apply)
            pag_cor['desc'] = np.where(
                -pag_cor['saldo'] <= max_desc_permitido,
                pag_cor['saldo'],
                -max_desc_permitido
            )
            pag_cor['vlr_liquido'] = pag_cor['vlr_bruto'] + pag_cor['desc']
            pag_cor['tipo_premiado'] = 'QV. SAÚDE - BONIFICAÇÃO CORRETOR'
            
            pag_sup = (df4_com_pix.loc[df4_com_pix['tipo_vendedor'] == 'supervisor', ['cpf_vendedor', 'nome_vendedor', 'bonificacao']]
                      .groupby(['cpf_vendedor', 'nome_vendedor'], as_index=False, sort=False)['bonificacao'].sum().sort_values('bonificacao', ascending=False))
            pag_sup.columns = ['cpf', 'nome', 'vlr_bruto']
            pag_sup = pag_sup.merge(descontos, how='left', on='cpf').rename(columns={'valor': 'saldo'})
            pag_sup['saldo'] = pag_sup['saldo'].fillna(0)
            pag_sup['desc'] = 0
            pag_sup['vlr_liquido'] = pag_sup['vlr_bruto'] + pag_sup['desc']
            pag_sup['tipo_premiado'] = 'QV. SAÚDE - BONIFICAÇÃO SUPERVISOR'
            
            calc_pag = pd.concat([pag_cor, pag_sup]).drop(columns='saldo')
            
            # Preparar valores uma vez só (evita múltiplas chamadas de strftime)
            mes_apurado_str = data_pagamento.strftime('%b/%y')
            apuracao_str = f"{n_apur}ª - {data_pagamento.strftime('%b%y').capitalize()}"
            dt_pagamento_str = data_pagamento.strftime("%Y-%m-%d")
            dt_registro_str = dt.today().strftime("%Y-%m-%d")
            
            # Atribuir todas as colunas de uma vez (mais eficiente)
            calc_pag = calc_pag.assign(
                mes_apurado=mes_apurado_str,
                apuracao=apuracao_str,
                id_cartao='Pix',
                tipo_cartao='chave - Pix',
                tipo_carga='Carga',
                obs='Transferência realizada',
                premiacao='BONIFICAÇÃO',
                dt_pagamento=dt_pagamento_str,
                dt_registro=dt_registro_str
            )
            
            # Filtrar zeros e resetar índice
            calc_pag = calc_pag[calc_pag['vlr_bruto'] != 0].reset_index(drop=True)
            
            # Otimizar tipos ANTES da conversao (reduz memoria e acelera serializacao)
            if len(calc_pag) > 0:
                # Converter tipos numéricos para versões mais leves
                calc_pag['vlr_bruto'] = calc_pag['vlr_bruto'].astype('float32')
                calc_pag['desc'] = calc_pag['desc'].astype('float32')
                calc_pag['vlr_liquido'] = calc_pag['vlr_liquido'].astype('float32')
                # Strings já são otimizadas pelo pandas
                
                # Log diagnóstico antes da conversão
                log_print(f"[calc_pag] Preparado: {len(calc_pag)} linhas, {len(calc_pag.columns)} colunas")
                log_print(f"[calc_pag] Memoria aproximada: {calc_pag.memory_usage(deep=True).sum() / 1024 / 1024:.2f} MB")
                log_print(f"[calc_pag] Tipos: {dict(calc_pag.dtypes)}")
            
            etapa("Montando estrutura df5...", 87)
            df4_com_pix_corretor = df4_com_pix[df4_com_pix['tipo_vendedor'] == 'corretor'].copy().reset_index(drop=True).drop(columns=['tipo_vendedor', 'codigo']).rename(
                columns={'cpf_vendedor': 'CPF Corretor', 'bonificacao': 'Vlr bruto Corretor', 'email': 'E-mail Corretor', 
                        'celular': 'Telefone Corretor', 'nome_vendedor': 'Nome Corretor', 'chave_pix': 'chave_pix_vendedor', 
                        'tipo_chave': 'tipo_chave_vendedor'})
            df4_com_pix_corretor['CPF Supervisor'] = 'N/A'
            df4_com_pix_corretor['Nome Supervisor'] = 'N/A'
            df4_com_pix_corretor['Vlr bruto Supervisor'] = 0
            df4_com_pix_corretor['E-mail Supervisor'] = 'N/A'
            df4_com_pix_corretor['Telefone Supervisor'] = 'N/A'
            df4_com_pix_corretor['chave_pix_supervisor'] = 'N/A'
            df4_com_pix_corretor['tipo_chave_supervisor'] = 'N/A'
            df4_com_pix_corretor = df4_com_pix_corretor[['numero_contrato', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia', 
                                                          'cpf_beneficiario', 'nome', 'tipo_de_beneficiario',
                                                          'idade', 'numero_da_parcela', 'status_da_fatura', 'data_do_pagamento_da_fatura', 
                                                          'concessionaria_nova', 'CPF Corretor', 'Nome Corretor',
                                                          'Vlr bruto Corretor', 'E-mail Corretor', 'Telefone Corretor', 'CPF Supervisor', 
                                                          'Nome Supervisor', 'Vlr bruto Supervisor', 'E-mail Supervisor',
                                                          'Telefone Supervisor', 'chave_regra', 'id_beneficiario', 'regiao', 
                                                          'chave_pix_vendedor', 'tipo_chave_vendedor', 'chave_pix_supervisor', 'tipo_chave_supervisor']]
            
            df4_com_pix_supervisor = df4_com_pix[df4_com_pix['tipo_vendedor'] == 'supervisor'].copy().reset_index(drop=True).drop(columns=['tipo_vendedor', 'codigo']).rename(
                columns={'cpf_vendedor': 'CPF Supervisor', 'bonificacao': 'Vlr bruto Supervisor', 'email': 'E-mail Supervisor', 
                        'celular': 'Telefone Supervisor', 'nome_vendedor': 'Nome Supervisor', 'chave_pix': 'chave_pix_supervisor', 
                        'tipo_chave': 'tipo_chave_supervisor'})
            df4_com_pix_supervisor['CPF Corretor'] = 'N/A'
            df4_com_pix_supervisor['Nome Corretor'] = 'N/A'
            df4_com_pix_supervisor['Vlr bruto Corretor'] = 0
            df4_com_pix_supervisor['E-mail Corretor'] = 'N/A'
            df4_com_pix_supervisor['Telefone Corretor'] = 'N/A'
            df4_com_pix_supervisor['chave_pix_vendedor'] = 'N/A'
            df4_com_pix_supervisor['tipo_chave_vendedor'] = 'N/A'
            df4_com_pix_supervisor = df4_com_pix_supervisor[['numero_contrato', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia', 
                                                              'cpf_beneficiario', 'nome', 'tipo_de_beneficiario',
                                                              'idade', 'numero_da_parcela', 'status_da_fatura', 'data_do_pagamento_da_fatura', 
                                                              'concessionaria_nova', 'CPF Corretor', 'Nome Corretor',
                                                              'Vlr bruto Corretor', 'E-mail Corretor', 'Telefone Corretor', 'CPF Supervisor', 
                                                              'Nome Supervisor', 'Vlr bruto Supervisor', 'E-mail Supervisor',
                                                              'Telefone Supervisor', 'chave_regra', 'id_beneficiario', 'regiao', 
                                                              'chave_pix_vendedor', 'tipo_chave_vendedor', 'chave_pix_supervisor', 'tipo_chave_supervisor']]
            
            df4_com_pix_novo = pd.concat([df4_com_pix_corretor, df4_com_pix_supervisor], ignore_index=True)
            
            df5 = df4_com_pix_novo.copy()
            rename_cols = ['numero_contrato', 'Operadora', 'Entidade', 'Número da Proposta', 'Data do início da vigencia do beneficiario', 
                          'CPF', 'Nome', 'Tipo de beneficiário', 'Idade', 'Número da Parcela',
                          'Status da Fatura', 'Data do pagamento da fatura', 'Concessionária', 'CPF Corretor', 'Nome Corretor', 
                          'Vlr bruto Corretor', 'E-mail Corretor',
                          'Telefone Corretor', 'CPF Supervisor', 'Nome Supervisor', 'Vlr bruto Supervisor', 'E-mail Supervisor', 
                          'Telefone Supervisor',
                          'Chave', 'ID Beneficiário', 'Região', 'chave_pix_vendedor', 'tipo_chave_vendedor', 'chave_pix_supervisor', 
                          'tipo_chave_supervisor']
            
            df5.columns = rename_cols
            
            etapa("Gerando relatorio final...", 87.5)
            # verificar valores em branco
            em_branco_geral = df4_com_pix.isna().sum().to_dict()
            em_branco = dict(filter(lambda x: x[1] != 0, em_branco_geral.items()))
            
            # verificação de filtros
            filtros = {
                'nao_elegivel': df2[df2['chave_regra'].str.find('Não Elegível') != -1]['numero_da_proposta'].tolist(),
                'erro_na_chave': df2[(df2['bonificacao_corretor'].isin([1, 2, 3]))]['numero_da_proposta'].tolist(),
                'Sem Bonificação': df2[(df2['bonificacao_corretor'].isin([0]))]['chave_regra'].unique().tolist(),
                'nao_achou': df2[df2['chave_regra'].str.find('nao achou') != -1]['numero_da_proposta'].tolist(),
                'erro': df2[df2['chave_regra'].str.find('Erro') != -1]['numero_da_proposta'].tolist(),
                'faixa_fora': df2[df2['chave_regra'].str.find('fora da faixa') != -1]['numero_da_proposta'].tolist()
            }
            
            # sem registro
            sem_registro = {
                'OPERADORAS': operadoras_novas,
                'ENTIDADES': entidades_novas,
                'CONCESSIONARIAS': concessionarias_novas,
                'PLANOS': planos_novos,
                'CHAVES': chaves_novas
            }
            
            # erro de merge
            merges = {
                '(PREP) CONTRATOS': merge_contratos,
                '(BONIF) OPERADORA': merge_operadora,
                '(BONIF) ENTIDADE': merge_entidade,
                '(BONIF) CONCESSIONARIA': merge_concessionaria,
                '(BONIF) PLANO': merge_plano,
                '(BONIF) BONIF CORRETOR': merge_bonificados_cor,
                '(BONIF) BONIF SUPERVISOR': merge_bonificados_sup,
                '(BONIF) CHAVE PIX CORRETOR': merge_pix_corretor,
                '(BONIF) CHAVE PIX SUPERVISOR': merge_pix_supervisor
            }
            
            # propostas iniciais
            prop_inicial = len(df1[df1['numero_da_parcela'] == 1])
            
            # Gráficos apenas se necessário (otimização: não criar se não for usado)
            graf_1 = df5[['Operadora', 'Data do pagamento da fatura']].groupby('Data do pagamento da fatura', sort=False).count().reset_index()
            graf_1['Data'] = graf_1['Data do pagamento da fatura'].dt.strftime('%d/%m/%Y')
            
            graf = df5[['Operadora', 'Vlr bruto Corretor']].copy()
            graf['Vlr Total'] = graf['Vlr bruto Corretor']
            graf_2 = graf[['Operadora', 'Vlr Total']].groupby('Operadora', sort=False).mean().reset_index()
            graf_2['Vlr Total'] = graf_2['Vlr Total'].round(2)
            
            graf_3 = graf[['Operadora', 'Vlr Total']].groupby('Operadora', sort=False).sum().sort_values('Vlr Total', ascending=False).reset_index()
            graf_3['Vlr Total'] = graf_3['Vlr Total'].apply(
                lambda x: 'R$ {:,.2f}'.format(x).replace(',', '_').replace('.', ',').replace('_', '.')
            )
            
            graf_4 = df5[['Operadora', 'CPF']].groupby('Operadora', sort=False).count().reset_index()
            
            graf_5 = df5[['Operadora', 'Data do início da vigencia do beneficiario']].groupby('Data do início da vigencia do beneficiario', sort=False).count().reset_index()
            graf_5['Data'] = graf_5['Data do início da vigencia do beneficiario'].dt.strftime('%d/%m/%Y')
            
            # Calcular indicadores para o relatório
            vlr_bruto_total_calc = calc_pag['vlr_bruto'].sum()
            vlr_bruto_cor_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('CORRETOR')]['vlr_bruto'].sum()
            vlr_bruto_sup_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('SUPERVISOR')]['vlr_bruto'].sum()
            desc_total_calc = calc_pag['desc'].sum()
            desc_cor_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('CORRETOR')]['desc'].sum()
            desc_sup_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('Supervisor')]['desc'].sum()
            vlr_liquido_total_calc = calc_pag['vlr_liquido'].sum()
            vlr_liquido_cor_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('CORRETOR')]['vlr_liquido'].sum()
            vlr_liquido_sup_calc = calc_pag[calc_pag['tipo_premiado'].str.contains('SUPERVISOR')]['vlr_liquido'].sum()
            
            # Calcular ticket médio: valor total a pagar dividido pelas vidas pagas
            vidas_pagas_count = len(df5)
            if vidas_pagas_count > 0:
                media_geral = round(vlr_liquido_total_calc / vidas_pagas_count, 2)
            else:
                media_geral = 0.0
            
            relatorio(df5, calc_pag, filtros, sem_registro, em_branco, merges, media_geral, prop_inicial, n_apur, data_inicial, return_mode)
            
            etapa("Criando bonificacao_analise com descontos...", 88)
            # Criar DataFrame bonificacao_analise: groupby por cpf, nome, mesclar com descontos e abater
            # Partir do calc_pag e mesclar com descontos detalhados
            bonificacao_analise = calc_pag[['cpf', 'nome', 'vlr_bruto', 'desc', 'vlr_liquido', 'tipo_premiado']].copy()
            
            # Agrupar por cpf e nome para ter totalizadores
            bonificacao_analise_grouped = bonificacao_analise.groupby(['cpf', 'nome'], as_index=False, sort=False).agg({
                'vlr_bruto': 'sum',
                'desc': 'sum',
                'vlr_liquido': 'sum',
                'tipo_premiado': lambda x: ', '.join(x.unique())  # Concatenar tipos únicos
            })
            
            # Mesclar com descontos detalhados (se houver mais de um desconto por CPF)
            descontos_detalhados = aux_descontos[['cpf', 'valor']].copy()
            descontos_detalhados.columns = ['cpf', 'valor_desconto']
            descontos_detalhados = descontos_detalhados.groupby('cpf', sort=False)['valor_desconto'].sum().reset_index()
            
            bonificacao_analise = bonificacao_analise_grouped.merge(descontos_detalhados, how='left', on='cpf')
            bonificacao_analise['valor_desconto'] = bonificacao_analise['valor_desconto'].fillna(0)
            
            # Adicionar informações adicionais
            bonificacao_analise['mes_apurado'] = data_pagamento.strftime('%b/%y')
            bonificacao_analise['apuracao'] = f"{n_apur}ª - {data_pagamento.strftime('%b%y').capitalize()}"
            bonificacao_analise['dt_pagamento'] = data_pagamento.strftime("%Y-%m-%d")
            bonificacao_analise['dt_registro'] = dt.today().strftime("%Y-%m-%d %H:%M:%S")
            
            # Ordenar por valor líquido (maior para menor)
            bonificacao_analise = bonificacao_analise.sort_values('vlr_liquido', ascending=False).reset_index(drop=True)
            
            etapa("Preparando dados de descontos...", 88.5)
            desc = calc_pag[calc_pag['desc'] != 0][['dt_pagamento', 'cpf', 'nome', 'desc']].reset_index(drop=True)
            desc['desc'] = desc['desc'] * -1
            desc['dt_analise'] = data_inicial.strftime("%Y-%m-%d")
            desc['movimentacao'] = 'desconto realizado'
            desc['registro'] = dt.today().strftime('%Y-%m-%d %H:%M:%S')
            desc.columns = ['dt_movimentacao', 'cpf', 'nome', 'valor', 'dt_apuracao', 'tipo_movimentacao', 'registro']
            desc = desc[desc['valor'] != 0]
            # Adicionar campos de staging para novos registros
            # Obter run_id e session_id do input_data se disponíveis
            run_id = input_data.get('run_id')
            session_id = input_data.get('session_id')
            usuario_id = input_data.get('usuario_id')
            
            # Adicionar campos de staging
            desc['run_id'] = run_id if run_id else None
            desc['session_id'] = session_id if session_id else None
            desc['usuario_id'] = usuario_id if usuario_id else None
            desc['dt_referencia'] = data_inicial.strftime("%Y-%m-%d")  # Data de referência do cálculo
            desc['status'] = 'staging'  # Status inicial como staging
            desc['is_active'] = False  # Inativo até ser finalizado
            desc['origem'] = 'script_python'  # Origem do desconto
            
            # Gerar chave_negocio para cada registro (usando dt_referencia, cpf, proposta se houver)
            # Normalizar CPF
            desc['cpf_normalizado'] = desc['cpf'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)
            # Criar chave_negocio simples: dt_referencia|cpf|tipo_movimentacao
            desc['chave_negocio'] = desc['dt_referencia'].astype(str) + '|' + desc['cpf_normalizado'] + '|' + desc['tipo_movimentacao'].astype(str)
            desc = desc.drop('cpf_normalizado', axis=1)  # Remover coluna auxiliar
            
            # Registrar descontos no banco de dados automaticamente
            if len(desc) > 0:
                try:
                    etapa("Registrando descontos no banco de dados...", 88.6)
                    # Selecionar apenas as colunas que existem na tabela (incluindo staging)
                    colunas_para_inserir = [
                        'dt_movimentacao', 'cpf', 'nome', 'valor', 'dt_apuracao', 'tipo_movimentacao', 'registro',
                        'run_id', 'session_id', 'usuario_id', 'dt_referencia', 'status', 'is_active', 
                        'chave_negocio', 'origem'
                    ]
                    # Filtrar apenas colunas que existem no DataFrame
                    colunas_existentes = [col for col in colunas_para_inserir if col in desc.columns]
                    desc_final = desc[colunas_existentes]
                    
                    desc_final.to_sql('registro_bonificacao_descontos', con=engine, if_exists='append', index=False, method='multi')
                    log_print(f"[DESCONTOS] {len(desc)} registro(s) de desconto inserido(s) com sucesso (status: staging)")
                    etapa("Descontos registrados", 88.7)
                except Exception as e:
                    log_print(f"[ERRO] Falha ao registrar descontos: {str(e)}")
                    etapa("Erro ao registrar descontos", 88.65)
                    # Não interromper o processo se falhar o registro de descontos
            
            etapa("Preparando dados unificados...", 89)
            
            # Normalizar CPF antes de separar
            df4_com_pix['cpf_vendedor'] = (df4_com_pix['cpf_vendedor'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11))
            
            # Separar corretores e supervisores
            df4_com_pix_corretor = df4_com_pix[df4_com_pix['tipo_vendedor'] == 'corretor'].copy()
            df4_com_pix_supervisor = df4_com_pix[df4_com_pix['tipo_vendedor'] == 'supervisor'].copy()
            
            # Criar unif_bonif apenas com dados de corretores
            if len(df4_com_pix_corretor) > 0:
                unif_bonif = df4_com_pix_corretor[['data_do_pagamento_da_fatura', 'operadora_nova', 'entidade_nova', 'numero_da_proposta', 'vigencia', 
                                                 'cpf_beneficiario', 'nome', 'tipo_de_beneficiario', 'idade', 'numero_da_parcela', 'codigo', 
                                                 'cpf_vendedor', 'nome_vendedor', 'bonificacao', 'id_beneficiario', 'chave_regra']].copy()
                unif_bonif.columns = ['dt_pagamento', 'operadora', 'entidade', 'numero_proposta', 'dt_inicio_vigencia', 'cpf', 'nome', 
                                      'tipo_beneficiario', 'idade', 'parcela', 'cnpj_concessionaria', 'cpf_corretor', 'nome_corretor', 
                                      'vlr_bruto_corretor', 'id_beneficiario', 'chave_plano']
                unif_bonif['cpf_corretor'] = (unif_bonif['cpf_corretor'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11))
                
                # Buscar supervisor correspondente (se houver) usando cpf_supervisor do df3
                if len(df3) > 0 and 'cpf_supervisor' in df3.columns:
                    df3_supervisor_map = df3[['numero_da_proposta', 'cpf_supervisor', 'nome_supervisor']].drop_duplicates(subset='numero_da_proposta', keep='last').set_index('numero_da_proposta')
                    unif_bonif['cpf_supervisor'] = unif_bonif['numero_proposta'].map(df3_supervisor_map['cpf_supervisor']).fillna('')
                    unif_bonif['nome_supervisor'] = unif_bonif['numero_proposta'].map(df3_supervisor_map['nome_supervisor']).fillna('')
                    
                    # Buscar valor bruto do supervisor se existir na mesma proposta
                    if 'bonificacao_supervisor' in df3.columns:
                        df3_supervisor_bonif = df3[df3['bonificacao_supervisor'] > 0][['numero_da_proposta', 'cpf_beneficiario', 'bonificacao_supervisor']].copy()
                        if len(df3_supervisor_bonif) > 0:
                            df3_supervisor_bonif['chave_merge'] = df3_supervisor_bonif['numero_da_proposta'] + df3_supervisor_bonif['cpf_beneficiario'].astype(str)
                            unif_bonif['chave_merge'] = unif_bonif['numero_proposta'] + unif_bonif['cpf'].astype(str)
                            unif_bonif = unif_bonif.merge(df3_supervisor_bonif[['chave_merge', 'bonificacao_supervisor']], how='left', on='chave_merge')
                            unif_bonif['vlr_bruto_supervisor'] = unif_bonif['bonificacao_supervisor'].fillna(0)
                            unif_bonif = unif_bonif.drop(columns=['chave_merge', 'bonificacao_supervisor'])
                        else:
                            unif_bonif['vlr_bruto_supervisor'] = 0
                    else:
                        unif_bonif['vlr_bruto_supervisor'] = 0
                else:
                    unif_bonif['cpf_supervisor'] = ''
                    unif_bonif['nome_supervisor'] = ''
                    unif_bonif['vlr_bruto_supervisor'] = 0
                
                unif_bonif['dt_registro'] = dt.today().strftime('%Y-%m-%d %H:%M:%S')
                unif_bonif['descontado'] = 0
                unif_bonif['dt_analise'] = data_pagamento.strftime('%Y-%m-%d')
                unif_bonif['chave_id'] = unif_bonif['numero_proposta'] + unif_bonif['id_beneficiario']
            else:
                unif_bonif = pd.DataFrame()
            
            # Criar unif_com a partir de calc_pag (dados de pagamento comercial)
            if len(calc_pag) > 0:
                # Selecionar colunas necessárias de calc_pag
                cols_unif_com = ['cpf', 'nome', 'id_cartao', 'vlr_liquido', 'tipo_cartao', 'tipo_carga', 
                                'premiacao', 'tipo_premiado', 'mes_apurado', 'apuracao', 'obs', 'dt_pagamento']
                
                # Verificar quais colunas existem em calc_pag
                cols_disponiveis = [col for col in cols_unif_com if col in calc_pag.columns]
                
                if len(cols_disponiveis) == len(cols_unif_com):
                    unif_com = calc_pag[cols_unif_com].copy()
                    unif_com['dt_registro'] = dt.today().strftime('%Y-%m-%d')
                    unif_com['dt_envio'] = dt.today().strftime('%Y-%m-%d')
                    unif_com.columns = ['cpf', 'nome', 'id_cartao', 'valor_carga', 'tipo_cartao', 'tipo_carga', 
                                       'premiacao', 'tipo_premiado', 'mes_apurado', 'apuracao', 'obs', 'dt_pagamento', 
                                       'dt_registro', 'dt_envio']
                else:
                    log_print(f"[unif_com] Aviso: Algumas colunas nao encontradas em calc_pag. Colunas disponiveis: {list(calc_pag.columns)}")
                    unif_com = pd.DataFrame()
            else:
                unif_com = pd.DataFrame()
            
            etapa("Preparando estrutura de retorno...", 89.5)
            
            # Column pruning e otimização antes de converter
            # Converter colunas categóricas para string (evita objetos Python pesados)
            if len(df5) > 0:
                categorical_cols = ['Operadora', 'Entidade', 'Concessionária', 'Número da Parcela', 'Tipo de beneficiário']
                for col in categorical_cols:
                    if col in df5.columns:
                        df5[col] = df5[col].astype('string')
            
            # Converter indicadores calculados para formato de texto
            indicadores_dict = {
                "vlr_bruto_total": valor_para_texto(vlr_bruto_total_calc),
                "vlr_bruto_cor": valor_para_texto(vlr_bruto_cor_calc),
                "vlr_bruto_sup": valor_para_texto(vlr_bruto_sup_calc),
                "desc_total": valor_para_texto(desc_total_calc),
                "desc_cor": valor_para_texto(desc_cor_calc),
                "desc_sup": valor_para_texto(desc_sup_calc),
                "vlr_liquido_total": valor_para_texto(vlr_liquido_total_calc),
                "vlr_liquido_cor": valor_para_texto(vlr_liquido_cor_calc),
                "vlr_liquido_sup": valor_para_texto(vlr_liquido_sup_calc),
                "prop_inicial": prop_inicial,
                "ticket_medio": valor_para_texto(media_geral),
                "vidas_pagas": len(df5)
            }
            
            # Resumo numérico estruturado (valores sem formatação para cálculos)
            resumo_numerico = {
                "vlr_bruto_total": float(vlr_bruto_total_calc),
                "vlr_bruto_cor": float(vlr_bruto_cor_calc),
                "vlr_bruto_sup": float(vlr_bruto_sup_calc),
                "desc_total": float(desc_total_calc),
                "desc_cor": float(desc_cor_calc),
                "desc_sup": float(desc_sup_calc),
                "vlr_liquido_total": float(vlr_liquido_total_calc),
                "vlr_liquido_cor": float(vlr_liquido_cor_calc),
                "vlr_liquido_sup": float(vlr_liquido_sup_calc),
                "prop_inicial": prop_inicial,
                "ticket_medio": float(media_geral),
                "vidas_pagas": len(df5)
            }
            
            # Preparar estrutura de retorno base
            # Por padrão, não envia tabelas - apenas logs, indicadores e metadados
            resultado = {
                "sucesso": True,
                "logs": "",  # Será preenchido depois com logs completos
                "data_pagamento": data_pagamento.isoformat(),
                "data_final": data_final.isoformat(),
                "data_inicial": data_inicial.isoformat(),
                "n_apur": n_apur,
                "preview_df5": [],  # Preview pequeno apenas se solicitado
                "indicadores": indicadores_dict,  # Totais formatados para exibição
                "resumo_numerico": resumo_numerico,  # Valores numéricos sem formatação
                "filtros": filtros,  # Informações de filtros aplicados
                "sem_registro": sem_registro,  # Itens não encontrados nas auxiliares
                "merges": merges,  # Status dos merges realizados
                # Tabelas grandes não são enviadas por padrão (podem ser solicitadas via include_frames)
                "calc_pag": [],
                "df4_sem_pix": [],
                "df4_com_pix": [],
                "df5": [],
                "desc": [],
                "unif_bonif": [],
                "unif_com": [],
                "bonificacao_analise": [],
                "meta": {
                    "return_mode": return_mode,
                    "max_rows_per_df": max_rows_per_df,
                    "row_counts": {},
                    "tables_included": False  # Indica se tabelas foram incluídas
                }
            }
            
            etapa("Convertendo DataFrames para formato JSON...", 92)
            
            # Função auxiliar para converter DataFrame de forma otimizada
            def df_to_dict_optimized(df, limit=None, progress_callback=None):
                """Converte DataFrame para dict de forma otimizada"""
                if df is None or len(df) == 0:
                    return []
                
                if progress_callback:
                    progress_callback(95.1)
                
                # Aplicar limite antes de processar (evita criar cópia desnecessária)
                if limit is not None and len(df) > limit:
                    df_limited = df.iloc[:limit]
                else:
                    df_limited = df
                
                if progress_callback:
                    progress_callback(95.2)
                
                # Detectar colunas datetime via select_dtypes (mais rápido)
                datetime_cols = df_limited.select_dtypes(include=['datetime64[ns]']).columns.tolist()
                
                # Identificar colunas que precisam conversao de tipo (uma vez so)
                cols_to_convert_int = []
                cols_to_convert_float = []
                for col in df_limited.columns:
                    dtype = df_limited[col].dtype
                    if dtype == 'int64':
                        cols_to_convert_int.append(col)
                    elif dtype == 'float64':
                        cols_to_convert_float.append(col)
                
                if progress_callback:
                    progress_callback(95.3)
                
                # Só copiar se realmente precisar modificar
                needs_modification = bool(datetime_cols or cols_to_convert_int or cols_to_convert_float)
                
                if needs_modification:
                    df_limited = df_limited.copy()
                
                # Converter datetimes para string somente nessas colunas
                if datetime_cols:
                    for col in datetime_cols:
                        df_limited[col] = df_limited[col].dt.strftime('%Y-%m-%d %H:%M:%S')
                
                # Converter tipos numpy para Python nativo antes da serialização (apenas onde necessário)
                if cols_to_convert_int:
                    for col in cols_to_convert_int:
                        df_limited[col] = df_limited[col].astype('int32')
                if cols_to_convert_float:
                    for col in cols_to_convert_float:
                        df_limited[col] = df_limited[col].astype('float32')
                
                if progress_callback:
                    progress_callback(95.4)
                
                # Substituir valores não numéricos serializáveis (NaN/Inf) por None
                if df_limited.isnull().values.any():
                    df_limited = df_limited.where(pd.notnull(df_limited), None)

                # Usar to_dict('records') direto (otimizado pelo pandas)
                result = df_limited.to_dict('records')
                
                if progress_callback:
                    progress_callback(95.9)
                
                return result
            
            # Função específica otimizada para calc_pag (conversão rápida e leve)
            def df_to_dict_fast_chunked(df, limit=1000, chunk_size=500, progress_callback=None):
                """
                Converte DataFrame em chunks pequenos para evitar travamento.
                Mais eficiente para DataFrames grandes como calc_pag.
                """
                if df is None or len(df) == 0:
                    return []
                
                start_time = time()
                total_rows = len(df)
                rows_to_process = min(total_rows, limit) if limit else total_rows
                
                log_print(f"Iniciando conversao rapida: {total_rows} linhas totais, processando {rows_to_process}")
                
                # Detectar colunas datetime uma vez só (fora do loop)
                datetime_cols = df.select_dtypes(include=['datetime64[ns]']).columns.tolist()
                
                # Identificar colunas que precisam conversao de tipo (uma vez so)
                cols_to_convert_int = []
                cols_to_convert_float = []
                for col in df.columns:
                    dtype = df[col].dtype
                    if dtype == 'int64':
                        cols_to_convert_int.append(col)
                    elif dtype == 'float64':
                        cols_to_convert_float.append(col)
                
                # Converter em chunks pequenos para não travar
                result = []
                processed = 0
                num_chunks = (rows_to_process + chunk_size - 1) // chunk_size
                
                while processed < rows_to_process:
                    chunk_end = min(processed + chunk_size, rows_to_process)
                    chunk = df.iloc[processed:chunk_end].copy()
                    
                    # Converter datetimes (se houver)
                    if datetime_cols:
                        for col in datetime_cols:
                            if col in chunk.columns:
                                chunk[col] = chunk[col].dt.strftime('%Y-%m-%d %H:%M:%S')
                    
                    # Converter tipos numpy para Python nativo (apenas colunas que precisam)
                    if cols_to_convert_int:
                        for col in cols_to_convert_int:
                            if col in chunk.columns:
                                chunk[col] = chunk[col].astype('int32')
                    if cols_to_convert_float:
                        for col in cols_to_convert_float:
                            if col in chunk.columns:
                                chunk[col] = chunk[col].astype('float32')
                    
                    # Substituir valores não serializáveis (NaN/Inf) por None
                    if chunk.isnull().values.any():
                        chunk = chunk.where(pd.notnull(chunk), None)
                    
                    # Converter chunk para dict (mais eficiente que iterrows)
                    chunk_dict = chunk.to_dict('records')
                    result.extend(chunk_dict)
                    
                    # Liberar referência imediatamente
                    del chunk_dict, chunk
                    
                    processed = chunk_end
                    
                    # Progresso e callback de etapa
                    if progress_callback:
                        progress_pct = 95 + (processed / rows_to_process) * 4  # 95% a 99%
                        progress_callback(progress_pct)
                    
                    # Log de progresso a cada chunk ou a cada 500 linhas
                    if processed % 500 == 0 or processed >= rows_to_process:
                        elapsed = time() - start_time
                        pct = (processed / rows_to_process) * 100
                        log_print(f"Progresso: {processed}/{rows_to_process} linhas ({pct:.1f}%) convertidas em {elapsed:.2f}s")
                
                elapsed_total = time() - start_time
                rate = len(result) / elapsed_total if elapsed_total > 0 else 0
                log_print(f"Conversao concluida: {len(result)} linhas em {elapsed_total:.2f}s ({rate:.0f} linhas/s)")
                
                return result
            
            # Meta para tracking de linhas
            meta_rowcounts = {}
            
            # Converter DataFrames apenas se explicitamente solicitado via include_frames
            # Por padrão, não converte nenhuma tabela - apenas logs/prints são enviados
            etapa("Verificando tabelas para conversao...", 93)
            tables_included = False
            
            log_print(f"[Tabelas] Modo: apenas logs serao enviados por padrao")
            log_print(f"[Tabelas] Para incluir tabelas, use include_frames no input JSON")
            
            if include_frames.get("df5") and len(df5) > 0:
                etapa("Convertendo df5...", 93.1)
                tables_included = True
                sent = min(len(df5), max_rows_per_df)
                resultado["df5"] = df_to_dict_optimized(df5, limit=sent)
                meta_rowcounts["df5_total"] = len(df5)
                meta_rowcounts["df5_sent"] = sent
                log_print(f"[Tabelas] df5: {sent} de {len(df5)} linhas incluidas")
            else:
                log_print(f"[Tabelas] df5 nao incluido (total: {len(df5)} linhas disponiveis)")
            
            if include_frames.get("df4_sem_pix") and len(df4_sem_pix) > 0:
                etapa("Convertendo df4_sem_pix...", 94)
                tables_included = True
                sent = min(len(df4_sem_pix), max_rows_per_df)
                resultado["df4_sem_pix"] = df_to_dict_optimized(df4_sem_pix, limit=sent)
                meta_rowcounts["df4_sem_pix_total"] = len(df4_sem_pix)
                meta_rowcounts["df4_sem_pix_sent"] = sent
                log_print(f"[Tabelas] df4_sem_pix: {sent} de {len(df4_sem_pix)} linhas incluidas")
            else:
                log_print(f"[Tabelas] df4_sem_pix nao incluido")
            
            if include_frames.get("calc_pag") and len(calc_pag) > 0:
                etapa("Convertendo calc_pag...", 95)
                tables_included = True
                # Gate por tamanho e modo: não serializa se muito grande ou em modo summary
                if return_mode == "summary" or len(calc_pag) > 2000:
                    etapa("Pulando envio de calc_pag (grande/summary)", 95.9)
                    log_print(f"[calc_pag] Pulando serialização: modo={return_mode}, linhas={len(calc_pag)}")
                    resultado["calc_pag"] = []  # Não envia
                    meta_rowcounts["calc_pag_total"] = len(calc_pag)
                    meta_rowcounts["calc_pag_sent"] = 0
                    meta_rowcounts["calc_pag_skipped"] = True
                    log_print(f"[calc_pag] calc_pag não enviado (otimização: use apenas colunas essenciais ou aumente limite)")
                else:
                    try:
                        log_print(f"[calc_pag] Iniciando conversao: {len(calc_pag)} linhas disponiveis")
                        start_time_calc = time()
                        
                        # Callback para atualizar progresso durante conversao
                        def update_progress(pct):
                            etapa(f"Convertendo calc_pag...", pct)
                        
                        # Colunas essenciais para reduzir tamanho do JSON
                        COLS_CALC_PAG_MIN = ["cpf", "nome", "vlr_bruto", "desc", "vlr_liquido",
                                            "tipo_premiado", "apuracao", "dt_pagamento"]
                        
                        # Verificar quais colunas existem no DataFrame
                        cols_disponiveis = [col for col in COLS_CALC_PAG_MIN if col in calc_pag.columns]
                        if len(cols_disponiveis) == len(COLS_CALC_PAG_MIN):
                            # Usar apenas colunas essenciais (reduz muito o JSON)
                            etapa("Selecionando colunas essenciais...", 95.1)
                            calc_pag_min = calc_pag[COLS_CALC_PAG_MIN].copy()
                            log_print(f"[calc_pag] Usando apenas colunas essenciais ({len(cols_disponiveis)} colunas)")
                        else:
                            # Se faltar colunas, usar todas disponíveis
                            calc_pag_min = calc_pag.copy()
                            log_print(f"[calc_pag] Usando todas as colunas ({len(calc_pag.columns)} colunas)")
                        
                        # Limite conservador: máximo 1000 linhas
                        calc_pag_limit = min(len(calc_pag_min), max_rows_per_df, 1000)
                        
                        if len(calc_pag_min) <= 500:
                            # Dataset pequeno: converter tudo de uma vez (mais rápido)
                            log_print(f"[calc_pag] Dataset pequeno: convertendo todas as {len(calc_pag_min)} linhas")
                            resultado["calc_pag"] = df_to_dict_optimized(calc_pag_min, limit=None, progress_callback=update_progress)
                        else:
                            # Dataset médio/grande: usar limite e conversão otimizada
                            log_print(f"[calc_pag] Dataset medio: limitando a {calc_pag_limit} linhas")
                            resultado["calc_pag"] = df_to_dict_optimized(calc_pag_min, limit=calc_pag_limit, progress_callback=update_progress)
                        
                        etapa("Finalizando conversao calc_pag...", 95.95)
                        
                        elapsed_calc = time() - start_time_calc
                        meta_rowcounts["calc_pag_total"] = len(calc_pag)
                        meta_rowcounts["calc_pag_sent"] = len(resultado["calc_pag"])
                        meta_rowcounts["calc_pag_conversion_time"] = round(elapsed_calc, 2)
                        
                        log_print(f"[calc_pag] Conversao finalizada: {len(resultado['calc_pag'])} linhas enviadas de {len(calc_pag)} totais em {elapsed_calc:.2f}s")
                        
                        if len(resultado["calc_pag"]) < len(calc_pag):
                            omitted = len(calc_pag) - len(resultado["calc_pag"])
                            log_print(f"[calc_pag] AVISO: {omitted} linhas omitidas para otimizacao")
                    
                    except Exception as e:
                        # Fallback: nao enviar se der erro (melhor que travar)
                        log_print(f"[calc_pag] ERRO na conversao otimizada: {str(e)}")
                        log_print(f"[calc_pag] Pulando envio devido a erro")
                        resultado["calc_pag"] = []
                        meta_rowcounts["calc_pag_total"] = len(calc_pag)
                        meta_rowcounts["calc_pag_sent"] = 0
                        meta_rowcounts["calc_pag_error"] = str(e)
            
            if include_frames.get("unif_bonif") and len(unif_bonif) > 0:
                etapa("Convertendo unif_bonif...", 96)
                tables_included = True
                etapa("Preparando unif_bonif...", 96.1)
                # Enviar todas as linhas sem limite
                sent = len(unif_bonif)
                etapa("Convertendo unif_bonif...", 96.5)
                resultado["unif_bonif"] = df_to_dict_optimized(unif_bonif, limit=None)
                meta_rowcounts["unif_bonif_total"] = len(unif_bonif)
                meta_rowcounts["unif_bonif_sent"] = sent
                log_print(f"[Tabelas] unif_bonif: {sent} de {len(unif_bonif)} linhas incluidas")
            else:
                log_print(f"[Tabelas] unif_bonif nao incluido")
            
            if include_frames.get("unif_com") and len(unif_com) > 0:
                etapa("Convertendo unif_com...", 96.2)
                tables_included = True
                etapa("Preparando unif_com...", 96.3)
                # Enviar todas as linhas sem limite
                sent = len(unif_com)
                etapa("Convertendo unif_com...", 96.6)
                resultado["unif_com"] = df_to_dict_optimized(unif_com, limit=None)
                meta_rowcounts["unif_com_total"] = len(unif_com)
                meta_rowcounts["unif_com_sent"] = sent
                log_print(f"[Tabelas] unif_com: {sent} de {len(unif_com)} linhas incluidas")
            else:
                log_print(f"[Tabelas] unif_com nao incluido")
            
            if include_frames.get("desc") and len(desc) > 0:
                etapa("Convertendo desc...", 97)
                tables_included = True
                etapa("Preparando desc...", 97.1)
                sent = min(len(desc), max_rows_per_df)
                etapa("Convertendo desc...", 97.5)
                resultado["desc"] = df_to_dict_optimized(desc, limit=sent)
                meta_rowcounts["desc_total"] = len(desc)
                meta_rowcounts["desc_sent"] = sent
                log_print(f"[Tabelas] desc: {sent} de {len(desc)} linhas incluidas")
            else:
                log_print(f"[Tabelas] desc nao incluido")
            
            if include_frames.get("bonificacao_analise") and len(bonificacao_analise) > 0:
                etapa("Convertendo bonificacao_analise...", 98)
                tables_included = True
                etapa("Preparando bonificacao_analise...", 98.1)
                sent = min(len(bonificacao_analise), max_rows_per_df)
                etapa("Convertendo bonificacao_analise...", 98.5)
                resultado["bonificacao_analise"] = df_to_dict_optimized(bonificacao_analise, limit=sent)
                meta_rowcounts["bonificacao_analise_total"] = len(bonificacao_analise)
                meta_rowcounts["bonificacao_analise_sent"] = sent
                log_print(f"[Tabelas] bonificacao_analise: {sent} de {len(bonificacao_analise)} linhas incluidas")
            else:
                log_print(f"[Tabelas] bonificacao_analise nao incluido")
            
            etapa("Preparando logs e metadados...", 98.7)
            # Preparar logs completos (todos os prints do código)
            if not include_logs:
                resultado["logs"] = ""
            else:
                # Otimizar junção de logs: usar join com lista já criada (mais eficiente)
                etapa("Unindo logs...", 98.75)
                _logs = "\n".join(logs_parts)
                
                # Limitar tamanho dos logs para evitar travamento na serialização
                # Limite de 5MB de logs (aproximadamente 5 milhões de caracteres)
                MAX_LOG_SIZE = 5 * 1024 * 1024  # 5MB
                _logs_original_size = len(_logs)
                if len(_logs) > MAX_LOG_SIZE:
                    etapa("Logs muito grandes, truncando...", 98.77)
                    # Manter início e fim dos logs, removendo o meio
                    # Manter últimos 3MB (mais relevantes) e início de 500KB
                    inicio_size = 500 * 1024  # 500KB do início
                    fim_size = MAX_LOG_SIZE - inicio_size - 1000  # Resto do fim (menos espaço para mensagem)
                    chars_removidos = _logs_original_size - MAX_LOG_SIZE
                    _logs = (
                        _logs[:inicio_size] + 
                        f"\n\n... [LOGS TRUNCADOS: {chars_removidos} caracteres removidos do meio] ...\n\n" +
                        _logs[-fim_size:]
                    )
                    log_print(f"[Logs] Logs truncados: {len(_logs)} caracteres (original: {_logs_original_size} caracteres)")
                
                etapa("Atribuindo logs ao resultado...", 98.8)
                resultado["logs"] = _logs
                # Limpar referencia aos logs_parts para liberar memoria
                del _logs
                log_print(f"[Logs] Total de {len(logs_parts)} linhas de log incluidas, tamanho: {len(resultado['logs']) / 1024:.2f} KB")
            
            # Atualizar meta com row_counts e indicador de tabelas
            etapa("Atualizando metadados...", 98.85)
            resultado["meta"]["row_counts"] = meta_rowcounts
            resultado["meta"]["tables_included"] = tables_included
            log_print(f"[Tabelas] Tabelas incluidas: {tables_included}")
            log_print(f"[Resumo] Calculo concluido. Logs disponiveis para visualizacao.")
            
            # Liberar memoria antes do dump
            etapa("Liberando memoria...", 99)
            etapa("Removendo DataFrames grandes...", 99.1)
            # Deletar variaveis grandes que nao serao mais usadas
            try:
                del df1, df2, df3, df4, bonificados, beneficiarios, contratos, faturamento_raw
            except:
                pass
            etapa("Removendo DataFrames intermediários...", 99.2)
            try:
                del df4_com_pix_corretor, df4_com_pix_supervisor, df4_com_pix_novo
            except:
                pass
            try:
                del df_corretor, df_supervisor
            except:
                pass
            etapa("Removendo tabelas auxiliares...", 99.3)
            try:
                del aux_bonificados, aux_bonificacao, aux_operadora, aux_entidade
            except:
                pass
            try:
                del aux_concessionarias, aux_faixa_idade, aux_planos, aux_descontos
            except:
                pass
            try:
                del aux_pix_corretor, aux_pix_supervisor, aux_pix_raw, unificado
            except:
                pass
            try:
                del migracoes_raw, df0migr, unificado_before, unificado_after
            except:
                pass
            try:
                del unificado_corretor, unificado_supervisor, unificado_paid, ids_unificado
            except:
                pass
            etapa("Removendo DataFrames convertidos...", 99.4)
            # Deletar DataFrames já convertidos (após conversão para JSON)
            try:
                del df5, df4_sem_pix, df4_com_pix, calc_pag, unif_bonif, unif_com, desc, bonificacao_analise
            except:
                pass
            
            etapa("Executando garbage collection...", 99.45)
            gc.collect()
            
            # NOTA: Não deletamos logs_parts aqui porque etapa() ainda pode ser chamada
            # e usa log_print(). O Python fará garbage collection automaticamente após a serialização.
            
            etapa("Serializando JSON...", 99.5)
            etapa("Preparando dados para serialização...", 99.51)
            # Forçar flush antes de serializar
            sys.stderr.flush()
            
            # Verificar tamanho estimado do resultado antes de serializar
            etapa("Estimando tamanho do resultado...", 99.52)
            try:
                import sys as sys_module
                resultado_size = sys_module.getsizeof(resultado)
                logs_size = sys_module.getsizeof(resultado.get("logs", ""))
                # Não usar log_print aqui pois logs_parts já foi deletado
                # As informações serão incluídas no JSON de qualquer forma
            except:
                pass
            
            etapa("Convertendo para JSON...", 99.6)
            start_serial = time()
            
            # Serializar com tratamento de erro e progresso
            try:
                # Tentar serialização normal primeiro
                etapa("Serializando dados...", 99.7)
                json_str = _json_dumps(resultado)
                elapsed_serial = time() - start_serial
                etapa("JSON serializado com sucesso!", 99.8)
                # Não usar log_print aqui pois logs_parts já foi deletado
            except Exception as e:
                # Se falhar, tentar serializar sem logs primeiro
                etapa("Erro na serialização, tentando sem logs...", 99.75)
                try:
                    logs_backup = resultado.pop("logs", "")
                    json_str = _json_dumps(resultado)
                    # Adicionar logs como string truncada se necessário
                    if len(logs_backup) > 1000000:  # 1MB
                        logs_backup = logs_backup[-500000:]  # Últimos 500KB
                    resultado["logs"] = logs_backup
                    json_str = _json_dumps(resultado)
                    etapa("Serialização concluída após otimização", 99.78)
                except Exception as e2:
                    # Último recurso: retornar apenas estrutura básica
                    etapa("Usando fallback de serialização...", 99.8)
                    json_str = _json_dumps({
                        "sucesso": True,
                        "erro": f"Erro na serialização completa: {str(e2)}",
                        "logs": f"Erro na serialização: {str(e2)}\nLogs parciais disponíveis.",
                        "meta": resultado.get("meta", {})
                    })
            
            etapa("Enviando resultados...", 99.9)
            # Forçar flush do stderr antes de imprimir JSON
            sys.stderr.flush()
            # Usar original_print para garantir que o JSON vá para stdout real
            original_print(json_str)
            etapa("Concluido!", 100)
            sys.stderr.flush()
            
        finally:
            # Restaurar print original
            builtins.print = original_print
            
    except Exception as e:
        import traceback
        erro_completo = traceback.format_exc()
        original_print(f"[ERRO CRÍTICO] {str(e)}", file=sys.stderr)
        original_print(f"[TRACEBACK] {erro_completo}", file=sys.stderr)
        sys.stderr.flush()
        # Usar original_print para garantir que o JSON vá para stdout real
        original_print(_json_dumps({
            "sucesso": False,
            "erro": str(e),
            "logs": f"Erro ao processar: {str(e)}\n\nTraceback:\n{erro_completo}"
        }))
        sys.stderr.flush()
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
        # Garantir que o script termine corretamente após execução bem-sucedida
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n[INTERROMPIDO] Script interrompido pelo usuário", file=sys.stderr)
        sys.stderr.flush()
        sys.exit(130)
    except SystemExit:
        # Permitir que sys.exit() funcione normalmente
        raise
    except Exception as e:
        import traceback
        print(f"[ERRO FATAL] {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)

