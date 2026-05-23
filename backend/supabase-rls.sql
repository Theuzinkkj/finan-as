-- ============================================================
-- Atlas Finance — Row Level Security (RLS)
-- Execute este script no Supabase Dashboard:
--   Database → SQL Editor → New Query → colar e executar
-- ============================================================

-- 1. Ativa RLS na tabela de transações
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas (caso existam) para evitar conflito
DROP POLICY IF EXISTS "users_select_own"  ON transactions;
DROP POLICY IF EXISTS "users_insert_own"  ON transactions;
DROP POLICY IF EXISTS "users_delete_own"  ON transactions;
DROP POLICY IF EXISTS "users_update_own"  ON transactions;
DROP POLICY IF EXISTS "user sees own"     ON transactions;

-- 3. SELECT — usuário só vê suas próprias transações
CREATE POLICY "users_select_own" ON transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- 4. INSERT — usuário só pode inserir com o próprio user_id
CREATE POLICY "users_insert_own" ON transactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 5. DELETE — usuário só pode excluir suas próprias transações
CREATE POLICY "users_delete_own" ON transactions
  FOR DELETE
  USING (user_id = auth.uid());

-- 6. UPDATE — usuário só pode editar suas próprias transações
CREATE POLICY "users_update_own" ON transactions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Para verificar se as políticas foram criadas:
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE tablename = 'transactions';
-- ============================================================


-- ============================================================
-- Atlas Finance — Migração: novas colunas em transactions
-- Execute no Supabase Dashboard:
--   Database → SQL Editor → New Query → colar e executar
-- ============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fixed          BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "invoiceItems"  JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "benefitType"   TEXT;
