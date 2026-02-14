-- ext-xcm: Track cross-chain XCM messages, transfers, and channels

-- ============================================================
-- XCM Messages — every XCM message sent or received
-- ============================================================
CREATE TABLE IF NOT EXISTS xcm_messages (
  id              SERIAL PRIMARY KEY,
  message_hash    VARCHAR(66),                 -- hash of the XCM message
  message_id      VARCHAR(66),                 -- unique id from PolkadotXcm.Sent
  direction       VARCHAR(10) NOT NULL,        -- 'outbound' | 'inbound'
  protocol        VARCHAR(10) NOT NULL,        -- 'HRMP' | 'UMP' | 'DMP'
  origin_para_id  INTEGER,                     -- source para ID (NULL = relay chain)
  dest_para_id    INTEGER,                     -- destination para ID (NULL = relay chain)
  sender          VARCHAR(66),                 -- sender account (decoded from origin multilocation)
  success         BOOLEAN,                     -- execution outcome
  block_height    BIGINT NOT NULL,
  extrinsic_id    TEXT,
  raw_message     TEXT,                        -- hex-encoded XCM program (outbound only)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_hash, block_height, direction)
);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_block ON xcm_messages(block_height);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_direction ON xcm_messages(direction);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_protocol ON xcm_messages(protocol);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_origin ON xcm_messages(origin_para_id);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_dest ON xcm_messages(dest_para_id);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_sender ON xcm_messages(sender);
CREATE INDEX IF NOT EXISTS idx_xcm_messages_hash ON xcm_messages(message_hash);

-- ============================================================
-- XCM Transfers — value transfers extracted from XCM messages
-- ============================================================
CREATE TABLE IF NOT EXISTS xcm_transfers (
  id              SERIAL PRIMARY KEY,
  xcm_message_id  INTEGER REFERENCES xcm_messages(id) ON DELETE CASCADE,
  direction       VARCHAR(10) NOT NULL,        -- 'outbound' | 'inbound'
  from_chain_id   INTEGER,                     -- source para ID (NULL = relay chain)
  to_chain_id     INTEGER,                     -- dest para ID (NULL = relay chain)
  from_address    VARCHAR(66),                 -- sender address
  to_address      VARCHAR(66),                 -- beneficiary address
  asset_id        TEXT,                        -- local asset id or multilocation string
  asset_symbol    VARCHAR(30),                 -- resolved human symbol (DOT, AJUN, USDC ...)
  amount          VARCHAR(40) NOT NULL DEFAULT '0',
  block_height    BIGINT NOT NULL,
  extrinsic_id    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_block ON xcm_transfers(block_height);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_from ON xcm_transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_to ON xcm_transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_direction ON xcm_transfers(direction);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_from_chain ON xcm_transfers(from_chain_id);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_to_chain ON xcm_transfers(to_chain_id);
CREATE INDEX IF NOT EXISTS idx_xcm_transfers_asset ON xcm_transfers(asset_symbol);

-- ============================================================
-- XCM Channels — aggregated HRMP channel statistics
-- ============================================================
CREATE TABLE IF NOT EXISTS xcm_channels (
  id               SERIAL PRIMARY KEY,
  from_para_id     INTEGER NOT NULL,
  to_para_id       INTEGER NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'active',
  message_count    BIGINT NOT NULL DEFAULT 0,
  transfer_count   BIGINT NOT NULL DEFAULT 0,
  first_seen_block BIGINT,
  last_seen_block  BIGINT,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_para_id, to_para_id)
);
CREATE INDEX IF NOT EXISTS idx_xcm_channels_from ON xcm_channels(from_para_id);
CREATE INDEX IF NOT EXISTS idx_xcm_channels_to ON xcm_channels(to_para_id);
