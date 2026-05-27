-- Tabela de rate limiting compartilhada entre todas as instâncias do servidor
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT        PRIMARY KEY,
  count    INTEGER     NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

-- Desabilita RLS (tabela interna do servidor, não do usuário)
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;

-- Índice para limpeza eficiente de entradas expiradas
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at);

-- Função atômica: incrementa contador ou reseta janela se expirada.
-- Retorna TRUE se o IP está bloqueado (passou do limite).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key        TEXT,
  p_window_ms  BIGINT,
  p_max        INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_now       TIMESTAMPTZ := NOW();
  v_new_count INTEGER;
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_ms * INTERVAL '1 millisecond'))
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE
                 WHEN rate_limits.reset_at < v_now THEN 1
                 ELSE rate_limits.count + 1
               END,
    reset_at = CASE
                 WHEN rate_limits.reset_at < v_now
                 THEN v_now + (p_window_ms * INTERVAL '1 millisecond')
                 ELSE rate_limits.reset_at
               END
  RETURNING count INTO v_new_count;

  RETURN v_new_count > p_max;
END;
$$ LANGUAGE plpgsql;

-- Limpa entradas expiradas há mais de 1 hora (rodar via cron se quiser)
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
