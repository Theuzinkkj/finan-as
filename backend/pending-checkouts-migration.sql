-- Cadastros aguardando confirmação do Mercado Pago.
-- Execute uma vez no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS pending_checkouts (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL,
  encrypted_payload    TEXT,
  subscription_id      TEXT UNIQUE,
  status               TEXT NOT NULL DEFAULT 'pending',
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_checkouts ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy pública: somente o backend com service_role acessa esta tabela.
REVOKE ALL ON TABLE pending_checkouts FROM anon, authenticated;
GRANT ALL ON TABLE pending_checkouts TO service_role;

CREATE INDEX IF NOT EXISTS idx_pending_checkouts_expires
  ON pending_checkouts (expires_at);

CREATE INDEX IF NOT EXISTS idx_pending_checkouts_email
  ON pending_checkouts (lower(email));

CREATE OR REPLACE FUNCTION atlas_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

REVOKE ALL ON FUNCTION atlas_email_registered(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_email_registered(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION cleanup_pending_checkouts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM pending_checkouts
  WHERE expires_at < now() AND status <> 'completed';
$$;

REVOKE ALL ON FUNCTION cleanup_pending_checkouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_pending_checkouts() TO service_role;
