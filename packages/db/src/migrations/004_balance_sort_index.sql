-- ============================================================
-- Balance Sort & Extension Performance Indexes
-- ============================================================
-- 1. Expression index on account_balances.free for ORDER BY free::numeric DESC.
--    Without this, every accounts page request does a full-table sort.
--
-- 2. Composite indexes on asset_transfers for account-based lookups.
--    The OR condition (from_address = $1 OR to_address = $1) benefits from
--    separate indexes on each side, each covering block_height DESC.

-- Expression index for balance sort on accounts page
CREATE INDEX IF NOT EXISTS idx_account_balances_free_numeric
  ON account_balances ((free::numeric) DESC NULLS LAST);
