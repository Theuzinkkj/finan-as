-- ============================================================
-- Atlas Finance — Migração: novas colunas em transactions
-- Execute no Supabase Dashboard:
--   Database → SQL Editor → New Query → colar e executar
-- ============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fixed          BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "invoiceItems"  JSONB;
