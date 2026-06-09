CREATE TABLE IF NOT EXISTS indicadores_consolidado_valores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ano SMALLINT UNSIGNED NOT NULL,
  operadora VARCHAR(150) NOT NULL,
  tipo ENUM('operadora', 'consolidado') NOT NULL DEFAULT 'operadora',
  ordem_operadora SMALLINT UNSIGNED NOT NULL,
  indicador_key VARCHAR(80) NOT NULL,
  mes TINYINT UNSIGNED NOT NULL,
  valor DECIMAL(30, 12) NULL,
  fonte VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicadores_ano_operadora_indicador_mes (
    ano,
    operadora,
    indicador_key,
    mes
  ),
  KEY idx_indicadores_ano_ordem (ano, ordem_operadora),
  KEY idx_indicadores_ano_mes (ano, mes),
  CONSTRAINT chk_indicadores_mes CHECK (mes BETWEEN 1 AND 12)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Indicadores mensais por ano e operadora importados do consolidado';
