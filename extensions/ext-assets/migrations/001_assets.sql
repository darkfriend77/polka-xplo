-- ext-assets: Track assets created via the Assets pallet

-- ============================================================
-- Assets — master table for each registered asset
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
  asset_id          INTEGER PRIMARY KEY,
  owner             VARCHAR(66),
  admin             VARCHAR(66),
  issuer            VARCHAR(66),
  freezer           VARCHAR(66),
  name              TEXT,
  symbol            VARCHAR(20),
  decimals          SMALLINT NOT NULL DEFAULT 0,
  is_frozen         BOOLEAN NOT NULL DEFAULT FALSE,
  supply            VARCHAR(40) NOT NULL DEFAULT '0',
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  created_block     BIGINT NOT NULL,
  updated_block     BIGINT NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);

-- ============================================================
-- Asset Transfers — individual transfer events
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_transfers (
  id                SERIAL PRIMARY KEY,
  asset_id          INTEGER NOT NULL REFERENCES assets(asset_id),
  block_height      BIGINT NOT NULL,
  extrinsic_id      TEXT,
  from_address      VARCHAR(66) NOT NULL,
  to_address        VARCHAR(66) NOT NULL,
  amount            VARCHAR(40) NOT NULL DEFAULT '0',
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_asset ON asset_transfers(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_from ON asset_transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_to ON asset_transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_block ON asset_transfers(block_height);
