/**
 * Chain State Queries — fetch live on-chain state via RPC.
 *
 * Uses `state_getStorage` with manually constructed storage keys
 * and lightweight SCALE decoding. This is the standard block-explorer
 * approach: always query the live chain for current account balances
 * rather than trying to reconstruct them from indexed events.
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { Twox128, Twox64Concat, Blake2128Concat } from "@polkadot-api/substrate-bindings";
import type { RpcPool } from "./rpc-pool.js";
import { hexToBytes, bytesToHex } from "./hex-utils.js";

// Pre-computed storage key prefix for System.Account:
//   twox128("System") + twox128("Account")
const SYSTEM_ACCOUNT_PREFIX =
  "26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9";

/**
 * Compute the full storage key for System.Account(accountId).
 *
 * Key hasher: Blake2_128Concat
 *   = blake2b_128(accountId) ++ accountId
 */
function systemAccountKey(accountIdHex: string): string {
  // accountIdHex is the 32-byte public key (hex, with or without 0x)
  const clean = accountIdHex.startsWith("0x") ? accountIdHex.slice(2) : accountIdHex;
  const accountBytes = hexToBytes(clean);

  // blake2b with 16-byte (128-bit) digest
  const hash = blake2b(accountBytes, { dkLen: 16 });

  // Blake2_128Concat = hash ++ raw_key
  return "0x" + SYSTEM_ACCOUNT_PREFIX + bytesToHex(hash) + clean;
}

/**
 * Read a little-endian u128 from a Uint8Array at the given offset.
 * Returns a bigint string (decimal) for JSON serialization.
 */
function readU128(bytes: Uint8Array, offset: number): string {
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[offset + i]!) << BigInt(i * 8);
  }
  return value.toString();
}

/**
 * Read a little-endian u32 from a Uint8Array at the given offset.
 */
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

export interface LiveAccountInfo {
  nonce: number;
  consumers: number;
  providers: number;
  sufficients: number;
  free: string;
  reserved: string;
  frozen: string;
  flags: string;
}

/**
 * Fetch the live account balance from the chain via `state_getStorage`.
 *
 * SCALE layout of AccountInfo<Index, AccountData>:
 *   nonce:       u32  (4 bytes)
 *   consumers:   u32  (4 bytes)
 *   providers:   u32  (4 bytes)
 *   sufficients: u32  (4 bytes)
 *   data.free:     u128 (16 bytes)
 *   data.reserved: u128 (16 bytes)
 *   data.frozen:   u128 (16 bytes)
 *   data.flags:    u128 (16 bytes)
 *   Total: 80 bytes
 */
export async function getLiveBalance(
  rpcPool: RpcPool,
  accountIdHex: string,
): Promise<LiveAccountInfo | null> {
  const storageKey = systemAccountKey(accountIdHex);

  const storageHex = await rpcPool.call<string | null>("state_getStorage", [storageKey]);
  if (!storageHex) return null;

  const bytes = hexToBytes(storageHex);
  if (bytes.length < 80) return null;

  return {
    nonce: readU32(bytes, 0),
    consumers: readU32(bytes, 4),
    providers: readU32(bytes, 8),
    sufficients: readU32(bytes, 12),
    free: readU128(bytes, 16),
    reserved: readU128(bytes, 32),
    frozen: readU128(bytes, 48),
    flags: readU128(bytes, 64),
  };
}

// ============================================================
// Assets.Account — live balances for non-native assets
// ============================================================

// Pre-computed prefix: twox128("Assets") + twox128("Account")
const ASSETS_ACCOUNT_PREFIX =
  bytesToHex(Twox128(new TextEncoder().encode("Assets"))) +
  bytesToHex(Twox128(new TextEncoder().encode("Account")));

export interface AssetInfo {
  assetId: number;
  name: string;
  symbol: string;
  decimals: number;
}

export interface AssetBalance {
  assetId: number;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  status: "Liquid" | "Frozen" | "Blocked";
}

/**
 * Construct the storage key for Assets.Account(assetId, accountId).
 *
 * DoubleMap hashers: Blake2_128Concat for both keys.
 *   key = prefix + Blake2_128Concat(asset_id as u32 LE) + Blake2_128Concat(account_id)
 */
function assetsAccountKey(assetId: number, accountIdHex: string): string {
  const clean = accountIdHex.startsWith("0x") ? accountIdHex.slice(2) : accountIdHex;

  // Encode asset_id as u32 little-endian
  const assetIdBytes = new Uint8Array(4);
  new DataView(assetIdBytes.buffer).setUint32(0, assetId, true);

  const accountBytes = hexToBytes(clean);

  return (
    "0x" +
    ASSETS_ACCOUNT_PREFIX +
    bytesToHex(Blake2128Concat(assetIdBytes)) +
    bytesToHex(Blake2128Concat(accountBytes))
  );
}

const ASSET_STATUS = ["Liquid", "Frozen", "Blocked"] as const;

/**
 * Fetch live balances for multiple assets for a given account.
 * Queries in parallel. Returns only assets with non-zero balance.
 *
 * SCALE layout of AssetAccount:
 *   balance: u128 (16 bytes)
 *   status:  enum (1 byte — 0=Liquid, 1=Frozen, 2=Blocked)
 *   reason:  enum (variable)
 *   extra:   T::Extra (unit on Ajuna)
 */
export async function getLiveAssetBalances(
  rpcPool: RpcPool,
  accountIdHex: string,
  assets: AssetInfo[],
): Promise<AssetBalance[]> {
  if (assets.length === 0) return [];

  // Query all asset balances in parallel
  const results = await Promise.allSettled(
    assets.map(async (asset) => {
      const key = assetsAccountKey(asset.assetId, accountIdHex);
      const hex = await rpcPool.call<string | null>("state_getStorage", [key]);
      return { asset, hex };
    }),
  );

  const balances: AssetBalance[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { asset, hex } = result.value;
    if (!hex) continue;

    const bytes = hexToBytes(hex);
    if (bytes.length < 17) continue; // at least balance(16) + status(1)

    const balance = readU128(bytes, 0);
    if (balance === "0") continue;

    const statusByte = bytes[16]!;
    const status = ASSET_STATUS[statusByte] ?? "Liquid";

    balances.push({
      assetId: asset.assetId,
      name: asset.name,
      symbol: asset.symbol,
      decimals: asset.decimals,
      balance,
      status,
    });
  }

  return balances;
}

// ============================================================
// Identity.IdentityOf — on-chain identity information
// ============================================================

// Pre-computed prefix: twox128("Identity") + twox128("IdentityOf")
const IDENTITY_OF_PREFIX =
  bytesToHex(Twox128(new TextEncoder().encode("Identity"))) +
  bytesToHex(Twox128(new TextEncoder().encode("IdentityOf")));

/**
 * Construct the storage key for Identity.IdentityOf(accountId).
 * Map hasher: Twox64Concat
 */
function identityOfKey(accountIdHex: string): string {
  const clean = accountIdHex.startsWith("0x") ? accountIdHex.slice(2) : accountIdHex;
  const accountBytes = hexToBytes(clean);
  return "0x" + IDENTITY_OF_PREFIX + bytesToHex(Twox64Concat(accountBytes));
}

export interface OnChainIdentity {
  display: string | null;
  legal: string | null;
  web: string | null;
  riot: string | null;
  email: string | null;
  pgpFingerprint: string | null;
  image: string | null;
  twitter: string | null;
  /** Custom additional fields set by the account (e.g. discord) */
  additional: Array<{ key: string; value: string }>;
  /** Judgement verdicts from registrars */
  judgements: Array<{ registrarIndex: number; judgement: string }>;
  /** Deposit locked for the identity */
  deposit: string;
}

const JUDGEMENT_NAMES = [
  "Unknown",
  "FeePaid",
  "Reasonable",
  "KnownGood",
  "OutOfDate",
  "LowQuality",
  "Erroneous",
] as const;

/**
 * Decode a SCALE `Data` enum field from the Identity pallet.
 *
 *   0       => None
 *   1..=33  => Raw(Vec<u8>) with length = tag - 1
 *   34..=37 => Hash variants (BlakeTwo256, Sha256, Keccak256, ShaThree256)
 */
function decodeDataField(bytes: Uint8Array, offset: number): { value: string | null; len: number } {
  const tag = bytes[offset]!;
  if (tag === 0) return { value: null, len: 1 };
  if (tag >= 1 && tag <= 33) {
    const rawLen = tag - 1;
    if (rawLen === 0) return { value: "", len: 1 };
    const raw = bytes.slice(offset + 1, offset + 1 + rawLen);
    try {
      return { value: new TextDecoder("utf-8", { fatal: true }).decode(raw), len: 1 + rawLen };
    } catch {
      return { value: "0x" + bytesToHex(raw), len: 1 + rawLen };
    }
  }
  if (tag >= 34 && tag <= 37) {
    const hash = bytes.slice(offset + 1, offset + 1 + 32);
    return { value: "0x" + bytesToHex(hash), len: 1 + 32 };
  }
  return { value: null, len: 1 };
}

/**
 * Read a SCALE compact-encoded integer.
 * Returns value and number of bytes consumed.
 */
function readCompact(bytes: Uint8Array, offset: number): { value: number; len: number } {
  const first = bytes[offset]!;
  const mode = first & 0x03;
  if (mode === 0) return { value: first >> 2, len: 1 };
  if (mode === 1)
    return { value: ((bytes[offset]! | (bytes[offset + 1]! << 8)) >> 2), len: 2 };
  if (mode === 2)
    return {
      value:
        ((bytes[offset]! |
          (bytes[offset + 1]! << 8) |
          (bytes[offset + 2]! << 16) |
          (bytes[offset + 3]! << 24)) >>>
          2),
      len: 4,
    };
  // Big integer mode — unlikely for identity fields
  return { value: 0, len: 1 };
}

/**
 * Fetch the on-chain identity for an account via `state_getStorage`.
 *
 * SCALE layout of Registration:
 *   judgements: Vec<(u32 registrar_index, Judgement enum)>
 *   deposit:    u128
 *   info: IdentityInfo {
 *     additional: Vec<(Data, Data)>
 *     display:    Data
 *     legal:      Data
 *     web:        Data
 *     riot:       Data  (aka matrix)
 *     email:      Data
 *     pgpFingerprint: Option<[u8; 20]>
 *     image:      Data
 *     twitter:    Data
 *   }
 */
export async function getLiveIdentity(
  rpcPool: RpcPool,
  accountIdHex: string,
): Promise<OnChainIdentity | null> {
  const storageKey = identityOfKey(accountIdHex);
  const storageHex = await rpcPool.call<string | null>("state_getStorage", [storageKey]);
  if (!storageHex) return null;

  const bytes = hexToBytes(storageHex);
  let off = 0;

  // --- judgements: Vec<(u32, Judgement)> ---
  const jCount = readCompact(bytes, off);
  off += jCount.len;
  const judgements: OnChainIdentity["judgements"] = [];
  for (let i = 0; i < jCount.value; i++) {
    const registrarIndex = readU32(bytes, off);
    off += 4;
    const jTag = bytes[off++]!;
    let judgement = JUDGEMENT_NAMES[jTag] ?? `Unknown(${jTag})`;
    if (jTag === 1) {
      // FeePaid includes a u128 balance
      off += 16;
    }
    judgements.push({ registrarIndex, judgement });
  }

  // --- deposit: u128 ---
  const deposit = readU128(bytes, off);
  off += 16;

  // --- info.additional: Vec<(Data, Data)> ---
  const aCount = readCompact(bytes, off);
  off += aCount.len;
  const additional: OnChainIdentity["additional"] = [];
  for (let i = 0; i < aCount.value; i++) {
    const k = decodeDataField(bytes, off);
    off += k.len;
    const v = decodeDataField(bytes, off);
    off += v.len;
    if (k.value && v.value) additional.push({ key: k.value, value: v.value });
  }

  // --- Standard identity info fields ---
  const display = decodeDataField(bytes, off);
  off += display.len;
  const legal = decodeDataField(bytes, off);
  off += legal.len;
  const web = decodeDataField(bytes, off);
  off += web.len;
  const riot = decodeDataField(bytes, off);
  off += riot.len;
  const email = decodeDataField(bytes, off);
  off += email.len;

  // --- pgpFingerprint: Option<[u8; 20]> ---
  let pgpFingerprint: string | null = null;
  const hasPgp = bytes[off++];
  if (hasPgp === 1) {
    pgpFingerprint = "0x" + bytesToHex(bytes.slice(off, off + 20));
    off += 20;
  }

  const image = decodeDataField(bytes, off);
  off += image.len;
  const twitter = decodeDataField(bytes, off);

  return {
    display: display.value,
    legal: legal.value,
    web: web.value,
    riot: riot.value,
    email: email.value,
    pgpFingerprint,
    image: image.value,
    twitter: twitter.value,
    additional,
    judgements,
    deposit,
  };
}

// ============================================================
// System Properties (cached)
// ============================================================

export interface SystemProperties {
  tokenDecimals: number;
  tokenSymbol: string;
  ss58Format: number;
}

let cachedSystemProperties: SystemProperties | null = null;

/**
 * Query `system_properties` via RPC and return token decimals, symbol,
 * and SS58 format. Cached for the process lifetime (values are baked
 * into the chain spec and never change at runtime).
 */
export async function getSystemProperties(rpcPool: RpcPool): Promise<SystemProperties> {
  if (cachedSystemProperties) return cachedSystemProperties;

  const raw = await rpcPool.call<Record<string, unknown>>("system_properties", []);

  cachedSystemProperties = {
    tokenDecimals:
      typeof raw.tokenDecimals === "number"
        ? raw.tokenDecimals
        : Array.isArray(raw.tokenDecimals)
          ? (raw.tokenDecimals[0] as number)
          : 10,
    tokenSymbol:
      typeof raw.tokenSymbol === "string"
        ? raw.tokenSymbol
        : Array.isArray(raw.tokenSymbol)
          ? (raw.tokenSymbol[0] as string)
          : "DOT",
    ss58Format:
      typeof raw.ss58Format === "number" ? raw.ss58Format : 42,
  };

  return cachedSystemProperties;
}

// ============================================================
// ParachainInfo.ParachainId (cached)
// ============================================================

let cachedParaId: number | null | undefined = undefined; // undefined = not yet queried

/**
 * Query the `ParachainInfo.ParachainId` storage value.
 * Returns the parachain ID as a number, or null if the pallet doesn't exist
 * (i.e. the chain is a relay chain). Cached for the process lifetime.
 *
 * Storage key: twox128("ParachainInfo") + twox128("ParachainId")
 * Value: u32 LE
 */
export async function getParachainId(rpcPool: RpcPool): Promise<number | null> {
  if (cachedParaId !== undefined) return cachedParaId;

  const prefix =
    bytesToHex(Twox128(new TextEncoder().encode("ParachainInfo"))) +
    bytesToHex(Twox128(new TextEncoder().encode("ParachainId")));

  const hex = await rpcPool.call<string | null>("state_getStorage", ["0x" + prefix]);
  if (!hex) {
    cachedParaId = null;
    return null;
  }

  const bytes = hexToBytes(hex);
  if (bytes.length < 4) {
    cachedParaId = null;
    return null;
  }

  // u32 little-endian
  cachedParaId =
    (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
  return cachedParaId;
}
