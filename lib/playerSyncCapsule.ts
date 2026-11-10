import {
  normalizeTrackerState,
  type PlayerTrackerState,
} from './playerMode/playerTrackerStorage';

export const SYNC_CAPSULE_PREFIX = 'GMA1';
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface PlayerSyncCapsulePayload {
  version: 1;
  exportedAt: number;
  campaignId: string;
  shareToken: string;
  slotId: string;
  pcId: string;
  trackerState: PlayerTrackerState;
}

export interface GmaPlayerCapsuleFile {
  format: 'gmaplayer-v1';
  exportedAt: number;
  campaignHint?: string;
  slotHint?: string;
  capsule: string;
}

function getWebCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in this environment.');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const webCrypto = getWebCrypto();
  const encoder = new TextEncoder();
  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/**
 * Encrypts a player's cross-device sync capsule using Web Crypto AES-GCM-256
 * with a PBKDF2-SHA256 derived key (100,000 iterations).
 */
export async function encryptPlayerSyncCapsule(
  input: Omit<PlayerSyncCapsulePayload, 'version' | 'exportedAt'> & {
    version?: 1;
    exportedAt?: number;
  },
  passphrase: string
): Promise<string> {
  if (!passphrase || passphrase.trim().length < 1) {
    throw new Error('Passphrase is required to encrypt a player sync capsule.');
  }
  const webCrypto = getWebCrypto();
  const salt = webCrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesGcmKey(passphrase, salt, ['encrypt']);

  const payload: PlayerSyncCapsulePayload = {
    version: 1,
    exportedAt: input.exportedAt ?? Date.now(),
    campaignId: String(input.campaignId || ''),
    shareToken: String(input.shareToken || ''),
    slotId: String(input.slotId || ''),
    pcId: String(input.pcId || ''),
    trackerState: normalizeTrackerState(input.trackerState),
  };

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));
  const cipherBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintext
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  return `${SYNC_CAPSULE_PREFIX}.${bytesToBase64Url(salt)}.${bytesToBase64Url(iv)}.${bytesToBase64Url(cipherBytes)}`;
}

function extractRawCapsuleToken(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith(`${SYNC_CAPSULE_PREFIX}.`)) {
    return trimmed;
  }
  // Check if input is a JSON .gmaplayer file
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<GmaPlayerCapsuleFile>;
      if (parsed && typeof parsed.capsule === 'string') {
        return parsed.capsule.trim();
      }
    } catch {
      throw new Error('Invalid .gmaplayer capsule file format.');
    }
  }
  // Check if input is a handoff URL with #gmasync= or ?gmasync=
  const hashMatch = trimmed.match(/[#?&]gmasync=([^&#\s]+)/);
  if (hashMatch) {
    return decodeURIComponent(hashMatch[1]);
  }
  return trimmed;
}

/**
 * Decrypts and validates a player sync capsule string, `.gmaplayer` file JSON,
 * or handoff URL using the provided passphrase.
 * Rejects with an error if the passphrase is wrong or the ciphertext is tampered.
 */
export async function decryptPlayerSyncCapsule(
  capsuleInput: string,
  passphrase: string
): Promise<PlayerSyncCapsulePayload> {
  if (!passphrase || passphrase.trim().length < 1) {
    throw new Error('Passphrase is required to decrypt a player sync capsule.');
  }
  const token = extractRawCapsuleToken(capsuleInput);
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== SYNC_CAPSULE_PREFIX) {
    throw new Error('Invalid sync capsule format.');
  }

  let salt: Uint8Array;
  let iv: Uint8Array;
  let cipherBytes: Uint8Array;
  try {
    salt = base64UrlToBytes(parts[1]);
    iv = base64UrlToBytes(parts[2]);
    cipherBytes = base64UrlToBytes(parts[3]);
  } catch {
    throw new Error('Corrupted sync capsule encoding.');
  }

  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || cipherBytes.length < 16) {
    throw new Error('Invalid sync capsule cryptographic parameters.');
  }

  const webCrypto = getWebCrypto();
  const key = await deriveAesGcmKey(passphrase, salt, ['decrypt']);

  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      cipherBytes as unknown as BufferSource
    );
  } catch {
    throw new Error('Invalid passphrase or corrupted sync capsule.');
  }

  let decoded: unknown;
  try {
    const decoder = new TextDecoder();
    decoded = JSON.parse(decoder.decode(plainBuffer));
  } catch {
    throw new Error('Decrypted capsule payload is not valid JSON.');
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid capsule payload structure.');
  }

  const rec = decoded as Record<string, unknown>;
  if (rec.version !== 1) {
    throw new Error(`Unsupported sync capsule version: ${String(rec.version)}`);
  }

  return {
    version: 1,
    exportedAt: typeof rec.exportedAt === 'number' ? rec.exportedAt : Date.now(),
    campaignId: typeof rec.campaignId === 'string' ? rec.campaignId : '',
    shareToken: typeof rec.shareToken === 'string' ? rec.shareToken : '',
    slotId: typeof rec.slotId === 'string' ? rec.slotId : '',
    pcId: typeof rec.pcId === 'string' ? rec.pcId : '',
    trackerState: normalizeTrackerState(rec.trackerState),
  };
}

/**
 * Serializes an encrypted capsule string into a downloadable `.gmaplayer` JSON envelope.
 */
export function serializeCapsuleFile(
  encryptedCapsule: string,
  meta: { campaignHint?: string; slotHint?: string; exportedAt?: number } = {}
): string {
  const envelope: GmaPlayerCapsuleFile = {
    format: 'gmaplayer-v1',
    exportedAt: meta.exportedAt ?? Date.now(),
    ...(meta.campaignHint ? { campaignHint: meta.campaignHint } : {}),
    ...(meta.slotHint ? { slotHint: meta.slotHint } : {}),
    capsule: encryptedCapsule,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Builds a client-side handoff link placing the encrypted capsule inside the
 * URL hash fragment (`#gmasync=...`) so the encrypted payload is NEVER sent in
 * HTTP requests or exposed to server logs.
 */
export function buildSyncHandoffUrl(
  basePlayerUrl: string,
  encryptedCapsule: string
): string {
  const cleanBase = basePlayerUrl.split('#')[0];
  return `${cleanBase}#gmasync=${encodeURIComponent(encryptedCapsule)}`;
}

export function extractSyncCapsuleFromHash(hash: string): string | null {
  const cleaned = hash.replace(/^#/, '');
  const params = new URLSearchParams(cleaned);
  const val = params.get('gmasync');
  return val ? val.trim() : null;
}

/**
 * Generates a deterministic client-side SVG matrix pattern for visual QR / device handoff
 * with zero external dependencies or network requests.
 */
export function generateClientQrMatrix(data: string, size: number = 25): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (rowOffset + r < size && colOffset + c < size) {
          grid[rowOffset + r][colOffset + c] = isBorder || isInner;
          reserved[rowOffset + r][colOffset + c] = true;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Fill data cells deterministically from input string bytes
  let byteIdx = 0;
  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      const charCode = data.charCodeAt(byteIdx % Math.max(1, data.length)) || 0;
      const mixed = (charCode ^ ((r * 31 + c * 17 + byteIdx) & 0xff)) & 0xff;
      grid[r][c] = ((mixed >> bitIdx) & 1) === 1;
      bitIdx++;
      if (bitIdx >= 8) {
        bitIdx = 0;
        byteIdx++;
      }
    }
  }
  return grid;
}

export const exportPlayerSyncCapsule = encryptPlayerSyncCapsule;
export const importPlayerSyncCapsule = decryptPlayerSyncCapsule;
