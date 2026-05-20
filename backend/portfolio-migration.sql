-- Run this in your Supabase SQL Editor
-- Table: portfolio_entries

CREATE TABLE IF NOT EXISTS portfolio_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  asset      TEXT        NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
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
