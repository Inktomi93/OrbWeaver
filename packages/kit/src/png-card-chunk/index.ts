// The ONE PNG character-card text-chunk codec — a pure string engine shared by import (read) and export
// (write). Character cards stash their JSON in a PNG `tEXt` chunk, base64-encoded, under a keyword
// (`ccv3` = V3, `chara` = V2). This module owns the byte surgery — chunk walk, CRC-32, the PNG
// signature — and nothing else: it takes/returns the card JSON as a STRING, so it never imports the
// card type and stays layer-cake-clean.
//
// READ also accepts `zTXt` (the same keyword+base64 payload, zlib-DEFLATE compressed) because some
// ecosystem exporters emit it; WRITE EMITS tEXt only, which is what SillyTavern and every other
// importer expects — but it SUPERSEDES both types, dropping a stale card chunk whichever way it was
// stored. Both halves of the vocabulary, one rule per direction: the write knows every kind of stale
// card, the read knows every kind of fresh one. zTXt is why the read seam is ASYNC: the dependency-free
// inflate is the WHATWG `DecompressionStream`, and it is stream-shaped.
//
// KIT-PURITY NOTE: neo's source used `node:buffer` (`Buffer`) for base64 + UTF-8. kit is isomorphic
// (tsconfig lib = es2025, types = []), so `Buffer`, `TextEncoder`/`TextDecoder`, and `atob`/`btoa` are
// all unavailable — and `Uint8Array.toBase64` needs `esnext`. So UTF-8 ↔ bytes goes through the
// ECMAScript built-ins `encode/decodeURIComponent`, and base64 is hand-packed. No node, no DOM, no
// global-environment assumptions: this runs unchanged in a browser or Node.

import { PNG_SIGNATURE } from "#image-sniff";

const SIGNATURE_LENGTH = PNG_SIGNATURE.length;
const LENGTH_FIELD_BYTES = 4;
const TYPE_FIELD_BYTES = 4;
const CRC_FIELD_BYTES = 4;
// A chunk header+footer = length(4) + type(4) + crc(4); its payload sits between.
const LENGTH_AND_TYPE = LENGTH_FIELD_BYTES + TYPE_FIELD_BYTES;
const CHUNK_OVERHEAD = LENGTH_FIELD_BYTES + TYPE_FIELD_BYTES + CRC_FIELD_BYTES;
const BIG_ENDIAN = false;

const TEXT_TYPE = "tEXt";
const ZTEXT_TYPE = "zTXt";
const IEND_TYPE = "IEND";
// zTXt body = keyword + NUL + compression-method(1) + the zlib stream; PNG defines method 0 (deflate).
const ZTEXT_METHOD_BYTES = 1;
const ZTEXT_DEFLATE_METHOD = 0;
// WHATWG "deflate" means ZLIB-wrapped deflate (RFC 1950) — precisely what zTXt carries, no header surgery.
const ZLIB_FORMAT = "deflate";
const CHARA_KEY = "chara";
const CCV3_KEY = "ccv3";

/** True when `data` starts with the 8-byte PNG signature. The byte-sniff every card upload runs
 *  (PNG-with-embedded-chunk vs bare JSON). The signature itself is `kit/image-sniff`'s
 *  {@link PNG_SIGNATURE} — the ONE spelling, imported rather than repeated, because the two modules
 *  disagreeing about what a PNG is (a 4-byte prefix there, all 8 here) sat on an upload boundary. */
export function isPng(data: Uint8Array): boolean {
  return data.length >= SIGNATURE_LENGTH && PNG_SIGNATURE.every((b, i) => data[i] === b);
}

/** One chunk whose keyword matched, in file order: a plain `tEXt` value (ASCII base64) or a `zTXt` zlib
 *  stream awaiting inflation. */
interface CardChunkCandidate {
  readonly compressed: boolean;
  readonly value: Uint8Array;
}

/** How many keyword-matching card chunks one read will TRY. A well-formed card carries one; the budget
 *  bounds the work a crafted upload can ask for (a 10 MB PNG can hold ~500k minimal `ccv3` zTXt chunks, and
 *  each attempt is an inflate). Past the budget the read answers with what it has — fail-soft, like every
 *  other malformation here. */
const CARD_CHUNK_CANDIDATES_MAX = 8;

/** Every chunk in `data` whose keyword matches `want`, in file order — the tEXt and zTXt arms collected by
 *  ONE walk so precedence is a single rule rather than a per-type accident. Bounds-checked: a declared length
 *  running past the buffer ends the walk (a truncated download fails soft). */
function collectCardChunks(data: Uint8Array, want: string): CardChunkCandidate[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const found: CardChunkCandidate[] = [];
  let offset = SIGNATURE_LENGTH;
  while (offset + LENGTH_AND_TYPE <= data.length && found.length < CARD_CHUNK_CANDIDATES_MAX) {
    const length = view.getUint32(offset, BIG_ENDIAN);
    // chunk layout = length(4) + type(4) + data(length) + crc(4)
    if (offset + CHUNK_OVERHEAD + length > data.length) {
      break; // truncated → stop walking
    }
    const type = latin1Decode(data.subarray(offset + LENGTH_FIELD_BYTES, offset + LENGTH_AND_TYPE));
    // IEND is the LOGICAL END OF THE IMAGE (#1360 item 2). The walk used to run to the end of the byte
    // array, so a card chunk APPENDED PAST IEND — bytes no PNG decoder will ever look at, and the easiest
    // place for a hostile or merely broken producer to hide one — was read as if it were part of the file.
    // Stop here; a card that is not inside the image is not this image's card.
    if (type === IEND_TYPE) {
      break;
    }
    const candidate = cardCandidateAt({ data, view, offset, length, type }, want);
    if (candidate !== null) {
      found.push(candidate);
    }
    offset += CHUNK_OVERHEAD + length;
  }
  return found;
}

/** The card-chunk candidate at `offset`, or `null` when this chunk is not one: a wrong type, a wrong
 *  keyword, a missing NUL separator, an undefined zTXt compression method — or a FAILED CRC.
 *
 *  THE CRC ARM IS #1360 item 2: the reader ignored CRCs entirely, so corrupt metadata was collected as if
 *  it were authentic and then either exploded downstream or, worse, decoded into something that parses. A
 *  bad CRC makes the chunk not-a-candidate, exactly like an undecodable one — the precedence rule above
 *  already says a later intact `chara`/`ccv3` wins, so this just adds "corrupt bytes" to the list of
 *  things that stop a chunk counting. Only the chunks this module READS are verified; verifying IDAT would
 *  be image-integrity work it does not do and could not act on. */
function cardCandidateAt(at: ChunkCursor, want: string): CardChunkCandidate | null {
  const { data, offset, length, type } = at;
  if ((type !== TEXT_TYPE && type !== ZTEXT_TYPE) || !chunkCrcValid(at)) {
    return null;
  }
  const body = data.subarray(offset + LENGTH_AND_TYPE, offset + LENGTH_AND_TYPE + length);
  if (type === TEXT_TYPE) {
    const plain = plainValueFor(body, want);
    return plain === null ? null : { compressed: false, value: plain };
  }
  const deflated = compressedValueFor(body, want);
  return deflated === null ? null : { compressed: true, value: deflated };
}

/** Read a `tEXt` (plain) or `zTXt` (zlib-compressed) chunk value by keyword (case-insensitive),
 *  base64-DECODED to the original UTF-8 string. THE PRECEDENCE RULE, one for both chunk types: the first
 *  matching chunk in file order that actually DECODES wins; a matching chunk that doesn't (corrupt zlib,
 *  bad base64, invalid UTF-8) is skipped, not fatal. Bounds-checked so a truncated download fails soft →
 *  null. Returns null when the bytes aren't a PNG, the keyword is absent, or no candidate decodes. The
 *  card-JSON parse is the caller's job (string in → JSON out lives in the parser, not here).
 *
 *  WHY THE SKIP IS THE RULE AND NOT AN OPTIMISATION: a matching-but-corrupt `zTXt` used to END the walk, so
 *  a valid `chara`/`ccv3` `tEXt` sitting later in the same file was never reached and the whole read answered
 *  null — the write path's stale-`zTXt` bug (below) put exactly that pair in every re-exported card.
 *
 *  ASYNC because inflating zTXt goes through `DecompressionStream` — kit is isomorphic, so that WHATWG global
 *  is the only dependency-free inflate available. The await is over MATCHING candidates only (bounded by
 *  {@link CARD_CHUNK_CANDIDATES_MAX}, normally one), never per chunk: the "no await in the chunk walk"
 *  property the collect/decide split protects on a hot import path still holds. */
export async function readCardChunk(data: Uint8Array, keyword: string): Promise<string | null> {
  if (!isPng(data)) {
    return null;
  }
  for (const candidate of collectCardChunks(data, keyword.toLowerCase())) {
    const value = candidate.compressed ? await readCompressedTextValue(candidate.value) : decodeBase64Utf8(candidate.value);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

/** One position in a chunk walk — the whole file plus where this chunk starts and what it is. Bundled
 *  rather than passed as five positionals so the two readers below stay inside the parameter cap. */
interface ChunkCursor {
  readonly data: Uint8Array;
  readonly view: DataView;
  readonly offset: number;
  readonly length: number;
  readonly type: string;
}

/** True when the chunk at `offset` carries the CRC-32 the PNG spec says it must (computed over
 *  `type + data`, stored in the 4 bytes after the payload).
 *
 *  #1360 item 2: the reader IGNORED CRCs entirely, so a corrupt card chunk was handed back as if it were
 *  authentic — it then either exploded further downstream or, worse, decoded into something that parses.
 *  Only the chunks this module actually READS are verified: verifying IDAT would be image-integrity work
 *  this module does not do and could not act on. */
function chunkCrcValid(at: ChunkCursor): boolean {
  const { data, view, offset, length, type } = at;
  const crcInput = new Uint8Array(TYPE_FIELD_BYTES + length);
  crcInput.set(latin1ToBytes(type), 0);
  crcInput.set(data.subarray(offset + LENGTH_AND_TYPE, offset + LENGTH_AND_TYPE + length), TYPE_FIELD_BYTES);
  return view.getUint32(offset + LENGTH_AND_TYPE + length, BIG_ENDIAN) === crc32(crcInput);
}

/** Split a text-chunk body at its NUL separator, returning the lowercased keyword + the bytes after
 *  it; null when there is no separator (a malformed chunk the walk simply skips). */
function splitKeyword(body: Uint8Array): { key: string; rest: Uint8Array } | null {
  const nullIdx = body.indexOf(0);
  if (nullIdx < 0) {
    return null;
  }
  return { key: latin1Decode(body.subarray(0, nullIdx)).toLowerCase(), rest: body.subarray(nullIdx + 1) };
}

/** The raw (still base64) value bytes of a single `tEXt` chunk whose keyword matches `want`; null otherwise
 *  (wrong key, or no null separator). Decoding is the CALLER's step — collecting first and decoding after is
 *  what lets an undecodable match be skipped for the next candidate instead of ending the read. */
function plainValueFor(body: Uint8Array, want: string): Uint8Array | null {
  const split = splitKeyword(body);
  if (split === null || split.key !== want) {
    return null;
  }
  return split.rest;
}

/** The zlib stream of a `zTXt` chunk whose keyword matches `want`; null otherwise (wrong key, no null
 *  separator, or a compression method PNG doesn't define). */
function compressedValueFor(body: Uint8Array, want: string): Uint8Array | null {
  const split = splitKeyword(body);
  if (split === null || split.key !== want || split.rest[0] !== ZTEXT_DEFLATE_METHOD) {
    return null;
  }
  return split.rest.subarray(ZTEXT_METHOD_BYTES);
}

/** Inflate a matched `zTXt` payload, then decode it exactly like a `tEXt` value (base64 → UTF-8). */
async function readCompressedTextValue(compressed: Uint8Array): Promise<string | null> {
  const inflated = await inflate(compressed);
  return inflated === null ? null : decodeBase64Utf8(inflated);
}

/** Chunk value bytes (ASCII base64) → the original UTF-8 string; null on either decode failing — the
 *  fail-soft null contract every read path here shares. */
function decodeBase64Utf8(value: Uint8Array): string | null {
  const bytes = base64ToBytes(latin1Decode(value));
  if (bytes === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): documented — this module's shared fail-soft
  // null contract, consumed by every reader of decodeBase64Utf8 as "no value here". Ends if a caller
  // stops treating the null return as absent.
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
  const { kept, iend, trailing } = splitChunks(basePng);
  if (iend === null) {
    throw new Error("PNG missing IEND chunk");
  }

  // V3 chunk: the rich blob with spec/spec_version. V2 chunk: the same blob minus those keys. Both
  // carry the SAME `data` payload, so an importer reading either gets the same character.
  const v2Chunk = makeTextChunk(CHARA_KEY, stripSpecKeys(cardJson));
  const v3Chunk = makeTextChunk(CCV3_KEY, cardJson);

  // ST's chunk order: V2 first, V3 second, both before IEND. A V3-aware reader scans all tEXt chunks
  // and prefers ccv3; a V2-only reader stops at chara. Anything the source file carried AFTER IEND is
  // re-appended after IEND, never folded into the image stream — see `splitChunks`.
  return concatChunks([PNG_SIGNATURE, ...kept, v2Chunk, v3Chunk, iend, ...(trailing === null ? [] : [trailing])]);
}

/** Walk `png` up to IEND, dropping stale `chara`/`ccv3` card chunks of BOTH types and separating IEND from
 *  everything else kept. Anything AFTER IEND is returned VERBATIM as `trailing`.
 *
 *  #1360 item 2 — the walk used to run to the end of the byte array and push post-IEND chunks onto `kept`,
 *  which the rewrite then RELOCATED to before IEND. That takes bytes a PNG decoder ignores and splices them
 *  into the image stream, which is corruption rather than preservation; and a post-IEND `chara` chunk was
 *  promoted into a real card chunk on every rewrite. Preserving the tail WHERE IT ALREADY WAS is the honest
 *  arm: the file round-trips byte-for-byte outside the card chunks, and nothing outside the image ever
 *  becomes part of it. */
function splitChunks(png: Uint8Array): { kept: Uint8Array[]; iend: Uint8Array | null; trailing: Uint8Array | null } {
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
    if (type === IEND_TYPE) {
      iend = whole;
      break; // the logical end of the image — everything past here is `trailing`, not a chunk of ours
    }
    if ((type === TEXT_TYPE || type === ZTEXT_TYPE) && isStaleCardChunk(whole, length)) {
      continue; // drop the stale card chunks
    }
    kept.push(whole);
  }
  return { kept, iend, trailing: iend !== null && offset < png.length ? png.slice(offset) : null };
}

/** True when a text chunk's keyword is `chara`/`ccv3` (a previously embedded card to be replaced).
 *
 *  APPLIED TO `zTXt` AS WELL AS `tEXt`, and that is the whole of finding #1353's write half: a `zTXt` body is
 *  `keyword\0<method><zlib>`, so the keyword split is byte-identical and no inflation is needed to decide
 *  staleness — but the drop used to test `tEXt` only. A card imported from a compressing exporter therefore
 *  KEPT its old compressed card, which `writeCardChunk` re-emitted BEFORE the fresh chunks, and the read
 *  (first match in file order) answered with the card the export had just replaced. */
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
 *  ASCII, so latin1 round-trips the `keyword\0value` layout byte-for-byte). */
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
  // @orb-waive caught-failure-ownership(catch): documented — falls back to the original string
  // when it doesn't parse as an object, consumed by writeCardChunk's V2 chunk write. Ends if the fallback
  // stops being applied.
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

// --- inflate (WHATWG DecompressionStream; no node, no deps) -----------------------------------------

// kit's tsconfig carries no DOM/node lib, so the WHATWG stream globals are untyped here. These local
// (non-exported) shapes describe the EXACT slice of the API used below — the alternative would be
// pulling DOM types into an isomorphic package, which the kit-purity gates forbid.
interface InflateReader {
  readonly read: () => Promise<{ done: boolean; value?: Uint8Array }>;
}
interface InflateWriter {
  readonly write: (chunk: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
}
interface InflateStream {
  readonly readable: { readonly getReader: () => InflateReader };
  readonly writable: { readonly getWriter: () => InflateWriter };
}
type InflateStreamCtor = new (format: string) => InflateStream;

const DECOMPRESSION_STREAM_GLOBAL = "DecompressionStream";
const decompressionStream = (globalThis as Record<string, unknown>)[DECOMPRESSION_STREAM_GLOBAL] as InflateStreamCtor | undefined;

/** Inflate a ZLIB stream (RFC 1950) to bytes; null when the stream is corrupt/truncated — a bad card
 *  is data, not a crash, matching this module's fail-soft read contract. */
async function inflate(compressed: Uint8Array): Promise<Uint8Array | null> {
  if (decompressionStream === undefined) {
    return null;
  }
  const stream = new decompressionStream(ZLIB_FORMAT);
  const writer = stream.writable.getWriter();
  // Deliberately un-awaited: awaiting the write before draining the reader can deadlock on backpressure,
  // and on a corrupt stream BOTH sides reject — swallowing here leaves the reader as the one error path
  // (an unhandled rejection would take the process down).
  // @orb-waive caught-failure-ownership(writer.write): documented above — the reader is the sole
  // error path; a write rejection would also surface on the reader's read(). Ends if the reader stops
  // being the consumed error path.
  void writer.write(compressed).catch(swallow);
  // @orb-waive caught-failure-ownership(writer.close): same reasoning as the write above — the
  // reader is the sole error path. Ends if the reader stops being the consumed error path.
  void writer.close().catch(swallow);

  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  // @orb-waive caught-failure-ownership(catch): documented — corrupt zlib payload returns
  // null per this module's fail-soft read contract (see the function doc). Ends if the caller stops
  // treating null as "not a valid card".
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        parts.push(value);
      }
    }
  } catch {
    return null; // Z_DATA_ERROR &c — corrupt zlib payload
  }
  return concatChunks(parts);
}

function swallow(): void {
  // intentionally empty — see the un-awaited writer note above
}

// --- encoding primitives (pure ES2025; no node, no DOM) ---------------------------------------------

// biome-ignore-start lint/suspicious/noBitwiseOperators: a PNG/CRC byte codec is defined in terms of shift/mask/xor — the base64 packer and the CRC-32 are intrinsically bitwise.
/** latin1 string → bytes (each char's low byte). Used for ASCII chunk types + the `keyword\0value`. */
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

// Per-byte CRC table, built once. Used by the writer (every chunk it emits) AND, since #1360, by the
// reader's `chunkCrcValid` for the tEXt/zTXt chunks it actually consumes.
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
// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the block above
