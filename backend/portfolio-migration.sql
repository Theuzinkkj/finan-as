-- Run this in your Supabase SQL Editor
-- Table: portfolio_entries

CREATE TABLE IF NOT EXISTS portfolio_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             DATE        NOT NULL,
  asset            TEXT        NOT NULL,
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  -- New columns (v2 — Investidor-style)
  asset_type       TEXT,
  transaction_type TEXT        NOT NULL DEFAULT 'compra',
  quantity         NUMERIC(16, 6),
  price            NUMERIC(16, 4),
  other_costs      NUMERIC(12, 2)
);

-- Row-Level Security: each user only sees their own entries
ALTER TABLE portfolio_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio: owner only"
  ON portfolio_entries
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups by user + date
CREATE INDEX IF NOT EXISTS idx_portfolio_user_date
  ON portfolio_entries (user_id, date DESC);

-- ── Migration: add new columns to existing table ──────────────────────────────
-- Run only if the table already exists without the new columns:
ALTER TABLE portfolio_entries
  ADD COLUMN IF NOT EXISTS asset_type       TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'compra',
  ADD COLUMN IF NOT EXISTS quantity         NUMERIC(16, 6),
  ADD COLUMN IF NOT EXISTS price            NUMERIC(16, 4),
  ADD COLUMN IF NOT EXISTS other_costs      NUMERIC(12, 2);
