// biome-ignore-all lint/suspicious/noBitwiseOperators: a PNG/CRC byte codec is defined in terms of
// shift/mask/xor — the base64 packer and the CRC-32 are intrinsically bitwise.

// The ONE PNG character-card tEXt codec — a pure string engine shared by import (read) and export
// (write). Character cards stash their JSON in a PNG `tEXt` chunk, base64-encoded, under a keyword
// (`ccv3` = V3, `chara` = V2). This module owns the byte surgery — chunk walk, CRC-32, the PNG
// signature — and nothing else: it takes/returns the card JSON as a STRING, so it never imports the
// card type and stays layer-cake-clean.
//
// KIT-PURITY NOTE: neo's source used `node:buffer` (`Buffer`) for base64 + UTF-8. kit is isomorphic
// (tsconfig lib = es2025, types = []), so `Buffer`, `TextEncoder`/`TextDecoder`, and `atob`/`btoa` are
// all unavailable — and `Uint8Array.toBase64` needs `esnext`. So UTF-8 ↔ bytes goes through the
// ECMAScript built-ins `encode/decodeURIComponent`, and base64 is hand-packed. No node, no DOM, no
// global-environment assumptions: this runs unchanged in a browser or Node.

const SIGNATURE_LENGTH = 8;
const LENGTH_FIELD_BYTES = 4;
const TYPE_FIELD_BYTES = 4;
const CRC_FIELD_BYTES = 4;
// A chunk header+footer = length(4) + type(4) + crc(4); its payload sits between.
const LENGTH_AND_TYPE = LENGTH_FIELD_BYTES + TYPE_FIELD_BYTES;
const CHUNK_OVERHEAD = LENGTH_FIELD_BYTES + TYPE_FIELD_BYTES + CRC_FIELD_BYTES;
const BIG_ENDIAN = false;

const TEXT_TYPE = "tEXt";
const IEND_TYPE = "IEND";
const CHARA_KEY = "chara";
const CCV3_KEY = "ccv3";

// biome-ignore lint/style/noMagicNumbers: the fixed 8-byte PNG file signature (PNG spec §5.2).
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** True when `data` starts with the 8-byte PNG signature. The byte-sniff every card upload runs
 *  (PNG-with-embedded-chunk vs bare JSON). */
export function isPng(data: Uint8Array): boolean {
  return data.length >= SIGNATURE_LENGTH && PNG_SIGNATURE.every((b, i) => data[i] === b);
}

/** Read a `tEXt` chunk value by keyword (case-insensitive), base64-DECODED to the original UTF-8
 *  string. Bounds-checked so a truncated download fails soft → null. Returns null when the bytes
 *  aren't a PNG, the keyword is absent, or the value doesn't base64/UTF-8-decode. The card-JSON parse
 *  is the caller's job (string in → JSON out lives in the parser, not here). */
export function readCardChunk(data: Uint8Array, keyword: string): string | null {
  if (!isPng(data)) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const want = keyword.toLowerCase();

  let offset = SIGNATURE_LENGTH;
  while (offset + LENGTH_AND_TYPE <= data.length) {
    const length = view.getUint32(offset, BIG_ENDIAN);
    // chunk layout = length(4) + type(4) + data(length) + crc(4)
    if (offset + CHUNK_OVERHEAD + length > data.length) {
      break; // truncated → stop walking
    }
    const type = latin1Decode(data.subarray(offset + LENGTH_FIELD_BYTES, offset + LENGTH_AND_TYPE));
    if (type === TEXT_TYPE) {
      const value = readTextValue(data, offset, length, want);
      if (value !== null) {
        return value;
      }
    }
    offset += CHUNK_OVERHEAD + length;
  }
  return null;
}

/** Pull the value of a single `tEXt` chunk if its keyword matches `want`; null otherwise (wrong key,
 *  no null separator, or undecodable base64/UTF-8). */
function readTextValue(
  data: Uint8Array,
  chunkStart: number,
  length: number,
  want: string,
): string | null {
  const chunk = data.subarray(chunkStart + LENGTH_AND_TYPE, chunkStart + LENGTH_AND_TYPE + length);
  const nullIdx = chunk.indexOf(0);
  if (nullIdx < 0) {
    return null;
  }
  const key = latin1Decode(chunk.subarray(0, nullIdx)).toLowerCase();
  if (key !== want) {
    return null;
  }
  const bytes = base64ToBytes(latin1Decode(chunk.subarray(nullIdx + 1)));
  if (bytes === null) {
    return null;
  }
  try {
    return bytesToUtf8(bytes);
  } catch {
    return null; // bytes weren't valid UTF-8 → fail soft, exactly as the null contract promises
  }
}

/**
 * Embed `cardJson` (a JSON STRING) as BOTH a `chara` (V2) and `ccv3` (V3) tEXt chunk in `basePng`,
 * dropping any existing chara/ccv3 tEXt so the card never carries stale copies. The dual-chunk write
 * is the convention for cross-tool compatibility: a V2-only importer reads `chara` and ignores
 * `ccv3`; a V3-aware importer prefers `ccv3`. Pure additive forward-compat.
 *
 * `cardJson` is expected V3-shaped (`{"spec":"chara_card_v3","spec_version":…,"data":…}`). The V2
 * chunk is the same blob with the top-level `spec`/`spec_version` keys removed (which V2 readers
 * tolerate); when `cardJson` doesn't parse as an object, the same string is written to both chunks.
 * Throws if `basePng` isn't a PNG or has no IEND.
 */
export function writeCardChunk(basePng: Uint8Array, cardJson: string): Uint8Array {
  if (!isPng(basePng)) {
    throw new Error("base image is not a PNG");
  }
  const { kept, iend } = splitChunks(basePng);
  if (iend === null) {
    throw new Error("PNG missing IEND chunk");
  }

  // V3 chunk: the rich blob with spec/spec_version. V2 chunk: the same blob minus those keys. Both
  // carry the SAME `data` payload, so an importer reading either gets the same character.
  const v2Chunk = makeTextChunk(CHARA_KEY, stripSpecKeys(cardJson));
  const v3Chunk = makeTextChunk(CCV3_KEY, cardJson);

  // ST's chunk order: V2 first, V3 second, both before IEND. A V3-aware reader scans all tEXt chunks
  // and prefers ccv3; a V2-only reader stops at chara.
  return concatChunks([PNG_SIGNATURE, ...kept, v2Chunk, v3Chunk, iend]);
}

/** Walk `png`, dropping stale `chara`/`ccv3` tEXt chunks, separating IEND from everything else kept. */
function splitChunks(png: Uint8Array): { kept: Uint8Array[]; iend: Uint8Array | null } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const kept: Uint8Array[] = [];
  let iend: Uint8Array | null = null;
  let offset = SIGNATURE_LENGTH;
  while (offset + LENGTH_AND_TYPE <= png.length) {
    const length = view.getUint32(offset, BIG_ENDIAN);
    if (offset + CHUNK_OVERHEAD + length > png.length) {
      break; // truncated → stop
    }
    const type = latin1Decode(png.subarray(offset + LENGTH_FIELD_BYTES, offset + LENGTH_AND_TYPE));
    const whole = png.slice(offset, offset + CHUNK_OVERHEAD + length);
    offset += CHUNK_OVERHEAD + length;
    if (type === TEXT_TYPE && isStaleCardChunk(whole, length)) {
      continue; // drop the stale card chunks
    }
    if (type === IEND_TYPE) {
      iend = whole;
    } else {
      kept.push(whole);
    }
  }
  return { kept, iend };
}

/** True when a tEXt chunk's keyword is `chara`/`ccv3` (a previously embedded card to be replaced). */
function isStaleCardChunk(whole: Uint8Array, length: number): boolean {
  const chunkData = whole.subarray(LENGTH_AND_TYPE, LENGTH_AND_TYPE + length);
  const nullIdx = chunkData.indexOf(0);
  if (nullIdx < 0) {
    return false;
  }
  const key = latin1Decode(chunkData.subarray(0, nullIdx)).toLowerCase();
  return key === CHARA_KEY || key === CCV3_KEY;
}

/** A `tEXt` chunk for `keyword`: `keyword\0<base64(utf8(value))>`, all latin1 (base64 + keyword are
 *  ASCII, so latin1 round-trips the keyword\0value layout byte-for-byte). */
function makeTextChunk(keyword: string, value: string): Uint8Array {
  const body = `${keyword}\0${bytesToBase64(utf8ToBytes(value))}`;
  return makeChunk(TEXT_TYPE, latin1ToBytes(body));
}

/** One PNG chunk: length(4 BE) + type(4) + data + crc(4 BE over type+data). */
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = latin1ToBytes(type);
  const out = new Uint8Array(CHUNK_OVERHEAD + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, BIG_ENDIAN);
  out.set(typeBytes, LENGTH_FIELD_BYTES);
  out.set(data, LENGTH_AND_TYPE);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  view.setUint32(LENGTH_AND_TYPE + data.length, crc32(crcInput), BIG_ENDIAN);
  return out;
}

/** Concatenate byte parts into one contiguous Uint8Array. */
function concatChunks(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** The V2 chunk payload: the card JSON with the top-level `spec`/`spec_version` keys stripped (a V2
 *  reader expects the data at the root, not wrapped in the V3 envelope). Falls back to the original
 *  string when it doesn't parse as an object. */
function stripSpecKeys(cardJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cardJson);
  } catch {
    return cardJson;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return cardJson;
  }
  const entries = Object.entries(parsed).filter(([k]) => k !== "spec" && k !== "spec_version");
  return JSON.stringify(Object.fromEntries(entries));
}

// --- encoding primitives (pure ES2025; no node, no DOM) ---------------------------------------------

/** latin1 string → bytes (each char's low byte). Used for ASCII chunk types + the keyword\0value. */
function latin1ToBytes(s: string): Uint8Array {
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0) & BYTE_MASK);
}

/** bytes → latin1 string (one char per byte). Used to read ASCII chunk types/keywords/base64. */
function latin1Decode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return s;
}

/** UTF-8 string → bytes, via `encodeURIComponent` (which emits %XX UTF-8) — no bitwise, no globals. */
function utf8ToBytes(str: string): Uint8Array {
  const encoded = encodeURIComponent(str);
  const out: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const ch = encoded[i] ?? "";
    if (ch === "%") {
      out.push(Number.parseInt(encoded.slice(i + 1, i + 1 + HEX_DIGITS_PER_BYTE), HEX_RADIX));
      i += HEX_DIGITS_PER_BYTE;
    } else {
      out.push(ch.charCodeAt(0));
    }
  }
  return Uint8Array.from(out);
}

/** bytes → UTF-8 string, via `decodeURIComponent`. Throws on malformed UTF-8 (caller catches → null). */
function bytesToUtf8(bytes: Uint8Array): string {
  let percent = "";
  for (const b of bytes) {
    percent += `%${b.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0")}`;
  }
  return decodeURIComponent(percent);
}

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;
const BITS_PER_B64_DIGIT = 6;
const B64_DIGIT_MASK = 0x3f;
const B64_GROUP_CHARS = 4;
const B64_PAD = "=";
// biome-ignore lint/security/noSecrets: the standard RFC 4648 base64 alphabet, not a credential.
const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_REVERSE = new Map<string, number>(Array.from(B64_ALPHABET, (ch, i) => [ch, i]));

/** bytes → base64 (RFC 4648, `=`-padded). Bit-accumulator pack, MSB first. */
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << BITS_PER_BYTE) | b;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_B64_DIGIT) {
      bits -= BITS_PER_B64_DIGIT;
      out += B64_ALPHABET[(buffer >> bits) & B64_DIGIT_MASK] ?? "";
    }
  }
  if (bits > 0) {
    // flush the leftover bits, left-aligned into a final 6-bit digit
    out += B64_ALPHABET[(buffer << (BITS_PER_B64_DIGIT - bits)) & B64_DIGIT_MASK] ?? "";
  }
  while (out.length % B64_GROUP_CHARS !== 0) {
    out += B64_PAD;
  }
  return out;
}

/** base64 → bytes; null on any non-alphabet character (ASCII whitespace + `=` padding tolerated). */
function base64ToBytes(b64: string): Uint8Array | null {
  let buffer = 0;
  let bits = 0;
  const out: number[] = [];
  for (const ch of b64) {
    if (ch === B64_PAD) {
      break;
    }
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      continue;
    }
    const val = B64_REVERSE.get(ch);
    if (val === undefined) {
      return null;
    }
    buffer = (buffer << BITS_PER_B64_DIGIT) | val;
    bits += BITS_PER_B64_DIGIT;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      out.push((buffer >> bits) & BYTE_MASK);
    }
  }
  return Uint8Array.from(out);
}

// --- CRC-32 (PNG / IEEE 802.3) ---------------------------------------------------------------------

// Reversed polynomial 0xEDB88320 (canonical IEEE form), grouped for `useNumericSeparators`.
const CRC32_POLYNOMIAL = 0xed_b8_83_20;
// CRC register init/final-xor mask: all 32 bits set.
const CRC32_INIT = 0xff_ff_ff_ff;
const CRC_TABLE_SIZE = 256;

// Per-byte CRC table, built once. The reader ignores CRCs; a writer must compute them.
const CRC_TABLE: Uint32Array = ((): Uint32Array => {
  const table = new Uint32Array(CRC_TABLE_SIZE);
  for (let n = 0; n < CRC_TABLE_SIZE; n += 1) {
    let c = n;
    for (let k = 0; k < BITS_PER_BYTE; k += 1) {
      c = (c & 1) === 1 ? CRC32_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = CRC32_INIT;
  for (const b of bytes) {
    c = (CRC_TABLE[(c ^ b) & BYTE_MASK] ?? 0) ^ (c >>> BITS_PER_BYTE);
  }
  return (c ^ CRC32_INIT) >>> 0;
}
