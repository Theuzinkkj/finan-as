-- ================================================================
--  Atlas — Migrations completas
--  Execute no Supabase SQL Editor (projeto → SQL Editor → Run)
-- ================================================================


-- ================================================================
--  TABELA: transactions
-- ================================================================

-- 1. Ativa RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas (evita conflito ao re-executar)
DROP POLICY IF EXISTS "users_select_own" ON transactions;
DROP POLICY IF EXISTS "users_insert_own" ON transactions;
DROP POLICY IF EXISTS "users_delete_own" ON transactions;
DROP POLICY IF EXISTS "users_update_own" ON transactions;
DROP POLICY IF EXISTS "user sees own"    ON transactions;

-- 3. Recria políticas
CREATE POLICY "users_select_own" ON transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own" ON transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own" ON transactions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "users_update_own" ON transactions
  FOR UPDATE
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Colunas extras de transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fixed           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceItems"  JSONB;


-- ================================================================
--  TABELA: portfolio_entries
-- ================================================================

-- 1. Cria tabela (se não existir)
CREATE TABLE IF NOT EXISTS portfolio_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             DATE           NOT NULL,
  asset            TEXT           NOT NULL,
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  notes            TEXT,
  created_at       TIMESTAMPTZ    DEFAULT now(),
  asset_type       TEXT,
  transaction_type TEXT           NOT NULL DEFAULT 'compra',
  quantity         NUMERIC(16, 6),
  price            NUMERIC(16, 4),
  other_costs      NUMERIC(12, 2)
);

-- 2. Ativa RLS
ALTER TABLE portfolio_entries ENABLE ROW LEVEL SECURITY;

-- 3. Políticas
DROP POLICY IF EXISTS "portfolio: owner only" ON portfolio_entries;

CREATE POLICY "portfolio: owner only" ON portfolio_entries
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Índice para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_portfolio_user_date
  ON portfolio_entries (user_id, date DESC);

-- 5. Adiciona colunas novas na tabela existente (seguro re-executar)
ALTER TABLE portfolio_entries
  ADD COLUMN IF NOT EXISTS asset_type       TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'compra',
  ADD COLUMN IF NOT EXISTS quantity         NUMERIC(16, 6),
  ADD COLUMN IF NOT EXISTS price            NUMERIC(16, 4),
  ADD COLUMN IF NOT EXISTS other_costs      NUMERIC(12, 2);


-- ================================================================
--  LIMPEZA: remove campo 'photo' de metadados de usuários
-- ================================================================
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'photo'
WHERE raw_user_meta_data ? 'photo';
