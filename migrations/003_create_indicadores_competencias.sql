CREATE TABLE IF NOT EXISTS indicadores_competencias (
  ano SMALLINT UNSIGNED NOT NULL,
  mes TINYINT UNSIGNED NOT NULL,
  status ENUM('aberto', 'projecao', 'fechado') NOT NULL DEFAULT 'aberto',
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fechado_em TIMESTAMP NULL,
  PRIMARY KEY (ano, mes),
  CONSTRAINT chk_indicadores_competencias_mes CHECK (mes BETWEEN 1 AND 12)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Controle de abertura e fechamento das competencias de indicadores';
