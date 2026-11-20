// kit/image-sniff — sniffMime: the pure magic-byte signature sniff shared by the assets domain and the
// vllm providers backend. Strict semantics: no match → `application/octet-stream`, never a guessed
// default — a caller wanting a fallback applies `?? 'image/png'` at its own call site.
// Kit-purity: no `node:buffer` (isomorphic); hex is hand-packed from raw bytes.
// No bitwise operators (repo rule): multi-byte int/bitfield parsing composes bytes with
// multiplication/addition and masks with modulo/division instead of `<<`/`|`/`&`.

const HEX_RADIX = 16;
const BYTE_HEX_WIDTH = 2;

// Leading hex signatures (lowercase). The trailing ASCII bytes spell the format tag in each case.
const JPEG_HEX = "ffd8ff";
const GIF87A_HEX = "474946383761"; // "GIF87a"
const GIF89A_HEX = "474946383961"; // "GIF89a"
const RIFF_HEX = "52494646"; // "RIFF" — the WebP container magic (bytes 0..3)
const WEBP_HEX = "57454250"; // "WEBP" — the form tag (bytes 8..11)

// The WebP tag sits after the 4-byte RIFF magic + 4-byte chunk size; the header we ever need is 12 bytes.
const WEBP_TAG_START = 8;
const HEADER_LEN = 12;

const PNG_MIME = "image/png";
const JPEG_MIME = "image/jpeg";
const GIF_MIME = "image/gif";
const WEBP_MIME = "image/webp";
const AVIF_MIME = "image/avif";
const OCTET_STREAM = "application/octet-stream";

/** The image types {@link sniffMime} recognizes by signature: the images the asset store accepts. */
export const SNIFFED_IMAGE_MIMES = [PNG_MIME, JPEG_MIME, GIF_MIME, WEBP_MIME] as const;
/** Animated PNG: it carries the PNG signature, so a claim of this type is accepted for bytes that sniff as PNG. */
export const APNG_MIME = "image/apng";
// Exported (contracts/types-in-contract doesn't apply to `kit` — it's the leaf below contracts, and
// callers in two different packages need this exact union to narrow on the result).
export type SniffedMime = (typeof SNIFFED_IMAGE_MIMES)[number] | typeof OCTET_STREAM;

/** `bytes[start..end)` as a lowercase hex string — the `Buffer.toString("hex")` equivalent, hand-packed
 *  so this module has no `node:buffer` dependency (kit-purity: browser + Node isomorphic). */
function hexSlice(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(HEX_RADIX).padStart(BYTE_HEX_WIDTH, "0");
  }
  return out;
}

/** THE PNG file signature — all EIGHT bytes (PNG spec §5.2), and THE authority for "is this a PNG" in this
 *  repo. `kit/png-card-chunk` imports this exact constant instead of re-spelling it: this module used to test
 *  a four-byte PREFIX while the card codec tested all eight, so a file opening `89 50 4e 47` + anything was a
 *  PNG to the sniff and not a PNG to the codec — a disagreement that sits on an UPLOAD boundary (the assets
 *  magic belt admits it, the card reader refuses it) and hands the mime table a format claim libpng would
 *  reject outright. */
// biome-ignore lint/style/noMagicNumbers: the fixed 8-byte PNG file signature (PNG spec §5.2).
export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_HEX = hexSlice(PNG_SIGNATURE, 0, PNG_SIGNATURE.length);

/** The detected image MIME from the leading magic bytes, or `application/octet-stream` when no known
 *  signature matches (PNG/JPEG/GIF/WebP only). Pure — never throws, never reads past the header; a buffer
 *  shorter than a signature simply fails to match (the hex prefix is too short). */
export function sniffMime(bytes: Uint8Array): SniffedMime {
  const lead = hexSlice(bytes, 0, HEADER_LEN);
  if (lead.startsWith(PNG_HEX)) {
    return PNG_MIME;
  }
  if (lead.startsWith(JPEG_HEX)) {
    return JPEG_MIME;
  }
  if (lead.startsWith(GIF87A_HEX) || lead.startsWith(GIF89A_HEX)) {
    return GIF_MIME;
  }
  if (lead.startsWith(RIFF_HEX) && hexSlice(bytes, WEBP_TAG_START, HEADER_LEN) === WEBP_HEX) {
    return WEBP_MIME;
  }
  return OCTET_STREAM;
}

// Pure chunk-signature inspection — no decode, no frame counting. GIF is always animated (frame-
// counting the image blocks costs a parser); APNG checks `acTL`; WebP checks the VP8X animation
// flag bit or an `ANIM`/`ANMF` chunk.

// A FourCC (four-character-code) chunk tag is 4 bytes — the RIFF/PNG/ISO-BMFF chunk-name width.
const FOURCC_LEN = 4;
// APNG's `acTL` / WebP's `ANIM`/`ANMF` / AVIF's brands live in the header; a 4 KiB window bounds the scan
// (the sig is far smaller in a real file, but a padded/annotated header stays covered without a whole-blob scan).
const ANIM_SCAN_WINDOW = 4096;
// The WebP first-chunk FourCC sits at byte 12 (after `RIFF` + 4-byte size + `WEBP`).
const WEBP_CHUNK_OFFSET = HEADER_LEN;
// VP8X flags byte is the first byte of the VP8X chunk payload (byte 20 = 12 + 4 FourCC + 4 size).
const VP8X_PAYLOAD_OFFSET = 20;
// The VP8X animation flag is bit 1 (value 2) of the flags byte: set iff `floor(flags / 2)` is odd.
const VP8X_ANIM_FLAG_BIT = 2;
const EVEN_ODD_MOD = 2;
const ODD = 1;

/** True iff `bytes[offset..]` equals the ASCII FourCC `tag` (no allocation). */
function fourccAt(bytes: Uint8Array, offset: number, tag: string): boolean {
  for (let i = 0; i < tag.length; i += 1) {
    if (bytes[offset + i] !== tag.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/** True iff the ASCII FourCC `tag` appears anywhere in `bytes[start, endExclusive)` (bounded scan). */
function containsFourcc(bytes: Uint8Array, tag: string, start: number, endExclusive: number): boolean {
  const last = Math.min(endExclusive, bytes.length) - tag.length;
  for (let i = start; i <= last; i += 1) {
    if (fourccAt(bytes, i, tag)) {
      return true;
    }
  }
  return false;
}

/** A WebP is animated when its VP8X extended header sets the animation flag, or an `ANIM`/`ANMF` chunk is
 *  present in the header window (a plain lossy `VP8 `/lossless `VP8L` WebP is always a single still frame). */
function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (fourccAt(bytes, WEBP_CHUNK_OFFSET, "VP8X")) {
    const flags = bytes[VP8X_PAYLOAD_OFFSET] ?? 0;
    if (Math.floor(flags / VP8X_ANIM_FLAG_BIT) % EVEN_ODD_MOD === ODD) {
      return true;
    }
  }
  return containsFourcc(bytes, "ANIM", HEADER_LEN, ANIM_SCAN_WINDOW) || containsFourcc(bytes, "ANMF", HEADER_LEN, ANIM_SCAN_WINDOW);
}

/** Whether `bytes` is an animated image (GIF / APNG / animated WebP). Pure byte inspection — never throws,
 *  never decodes. The variant pipeline calls this to BAIL on a downscale (sharp's webp encoder drops
 *  animation), and the asset store computes it ONCE so `AssetListItem.animated` is a stored fact rather
 *  than a per-list re-sniff.
 *
 *  THIS IS A DISPLAY HINT, NOT A TRUSTED FACT. The APNG/WebP arms scan a bounded byte WINDOW for the ASCII
 *  chunk tags, with no chunk-length validation — the four characters `acTL` inside an unrelated payload read
 *  as "animated". That is deliberate (frame counting costs a parser) and it is affordable because both
 *  consumers are cosmetic: a false positive skips a downscale or paints an "animated" badge. Never promote it
 *  into a security or admission decision — the structural arm of this module is {@link sniffImageBytes}'s
 *  dimension read, which is what a cap may trust. */
export function isAnimated(bytes: Uint8Array): boolean {
  const mime = sniffMime(bytes);
  if (mime === GIF_MIME) {
    return true;
  }
  if (mime === PNG_MIME) {
    return containsFourcc(bytes, "acTL", 0, ANIM_SCAN_WINDOW);
  }
  if (mime === WEBP_MIME) {
    return isAnimatedWebp(bytes);
  }
  return false;
}

// The pure byte-facts `infra/network/image-guard` composes over (magic-sniff + dimension caps on
// remote bytes). Dimensions parse from each format's header math (no decode); `null` when the
// header is present but truncated/unparseable.

export interface SniffedImage {
  readonly mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif";
  /** Header-parsed pixel dimensions; `null` when the header is present but truncated/unparseable. */
  readonly width: number | null;
  readonly height: number | null;
  /** GIF ⇒ true, APNG `acTL`, animated WebP — the {@link isAnimated} semantics. A display HINT (window-scanned,
   *  false positives possible), never an input to an admission decision. */
  readonly animated: boolean;
}

/** A parsed `(width, height)` pair, `null` fields when unreadable. */
interface Dimensions {
  readonly width: number | null;
  readonly height: number | null;
}

const NO_DIMENSIONS: Dimensions = { width: null, height: null };

// Header byte offsets — each literal IS the format spec's field position; grouped so the parsers below read
// as `OFF.pngWidth` rather than a bare number (noMagicNumbers-clean, spec-legible).
const OFF = {
  pngWidth: 16,
  pngHeight: 20,
  pngEnd: 24,
  gifWidth: 6,
  gifHeight: 8,
  gifEnd: 10,
  webpPayload: 20,
  vp8Width: 26,
  vp8Height: 28,
  vp8End: 30,
  vp8lB0: 21,
  vp8lB1: 22,
  vp8lB2: 23,
  vp8lB3: 24,
  vp8lEnd: 25,
  vp8xWidth: 24,
  vp8xHeight: 27,
  vp8xEnd: 30,
  jpegScanStart: 2,
  jpegMarker: 1,
  jpegLenField: 2,
  jpegSofHeight: 5,
  jpegSofWidth: 7,
  jpegSofEnd: 9,
  ispeVersionFlags: 4,
  ispeHeight: 4,
} as const;

// Byte-composition + bitfield factors, spelled as multiply/divide/modulo (no bitwise). `SHIFT_n` = 2^n as a
// multiplier; `*_MOD` masks the low k bits via `% 2^k`.
const SHIFT_8 = 256; // << 8
const SHIFT_16 = 65_536; // << 16
const U14_MOD = 16_384; // & 0x3fff (low 14 bits)
const LOW6_MOD = 64; // & 0x3f  (low 6 bits) — also the /64 for the high 2 bits
const NIBBLE_MOD = 16; // & 0x0f  (low 4 bits)
const SHIFT_2 = 4; // << 2
const SHIFT_10 = 1024; // << 10
const DIM_BIAS = 1; // VP8L/VP8X store dimension-minus-one

function u16LE(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) + (b[o + 1] ?? 0) * SHIFT_8;
}
function u16BE(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) * SHIFT_8 + (b[o + 1] ?? 0);
}
function u24LE(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) + (b[o + 1] ?? 0) * SHIFT_8 + (b[o + 2] ?? 0) * SHIFT_16;
}
function u32BE(b: Uint8Array, o: number): number {
  // Composed from two big-endian u16 reads (hi word * 2^16 + lo word) — avoids a literal byte-3 offset.
  return u16BE(b, o) * SHIFT_16 + u16BE(b, o + OFF.jpegLenField);
}

function pngDimensions(b: Uint8Array): Dimensions {
  if (b.length < OFF.pngEnd) {
    return NO_DIMENSIONS;
  }
  return { width: u32BE(b, OFF.pngWidth), height: u32BE(b, OFF.pngHeight) };
}

function gifDimensions(b: Uint8Array): Dimensions {
  if (b.length < OFF.gifEnd) {
    return NO_DIMENSIONS;
  }
  return { width: u16LE(b, OFF.gifWidth), height: u16LE(b, OFF.gifHeight) };
}

/** WebP dimensions from the lossless `VP8L` bitstream: 14-bit width/height packed after the 0x2f signature
 *  byte. Extracted (not inlined into {@link webpDimensions}) purely to keep the bitfield arithmetic legible. */
function vp8lDimensions(b: Uint8Array): Dimensions {
  const b0 = b[OFF.vp8lB0] ?? 0;
  const b1 = b[OFF.vp8lB1] ?? 0;
  const b2 = b[OFF.vp8lB2] ?? 0;
  const b3 = b[OFF.vp8lB3] ?? 0;
  const width = DIM_BIAS + (b0 + (b1 % LOW6_MOD) * SHIFT_8);
  const height = DIM_BIAS + (Math.floor(b1 / LOW6_MOD) + b2 * SHIFT_2 + (b3 % NIBBLE_MOD) * SHIFT_10);
  return { width, height };
}

/** WebP dimensions dispatch on the first-chunk FourCC: `VP8 ` (lossy), `VP8L` (lossless), `VP8X` (extended). */
function webpDimensions(b: Uint8Array): Dimensions {
  if (fourccAt(b, WEBP_CHUNK_OFFSET, "VP8 ") && b.length >= OFF.vp8End) {
    return { width: u16LE(b, OFF.vp8Width) % U14_MOD, height: u16LE(b, OFF.vp8Height) % U14_MOD };
  }
  if (fourccAt(b, WEBP_CHUNK_OFFSET, "VP8L") && b.length >= OFF.vp8lEnd) {
    return vp8lDimensions(b);
  }
  if (fourccAt(b, WEBP_CHUNK_OFFSET, "VP8X") && b.length >= OFF.vp8xEnd) {
    return {
      width: u24LE(b, OFF.vp8xWidth) + DIM_BIAS,
      height: u24LE(b, OFF.vp8xHeight) + DIM_BIAS,
    };
  }
  return NO_DIMENSIONS;
}

// JPEG SOF (start-of-frame) markers carry the dimensions; C4/C8/CC are NOT frame markers (DHT/JPG/DAC).
const JPEG_SOF_MIN = 0xc0;
const JPEG_SOF_MAX = 0xcf;
const JPEG_DHT = 0xc4; // define-Huffman-table — not a frame marker
const JPEG_JPG = 0xc8; // reserved (JPG extension) — not a frame marker
const JPEG_DAC = 0xcc; // define-arithmetic-conditioning — not a frame marker
const JPEG_NON_SOF = new Set([JPEG_DHT, JPEG_JPG, JPEG_DAC]);
const JPEG_MARKER_PREFIX = 0xff;
// Standalone markers (RSTn 0xD0–0xD7, SOI 0xD8, EOI 0xD9, TEM 0x01) carry no length segment.
const JPEG_STANDALONE_MIN = 0xd0;
const JPEG_STANDALONE_MAX = 0xd9;
const JPEG_TEM = 0x01;
// Bound the marker walk to the first 64 KiB — a SOF deeper than that is a reject-by-null (D61 B5a §3).
const JPEG_SCAN_LIMIT = 65_536;

function isJpegSof(marker: number): boolean {
  return marker >= JPEG_SOF_MIN && marker <= JPEG_SOF_MAX && !JPEG_NON_SOF.has(marker);
}

function isJpegStandalone(marker: number): boolean {
  return (marker >= JPEG_STANDALONE_MIN && marker <= JPEG_STANDALONE_MAX) || marker === JPEG_TEM;
}

/** Scan JPEG segment markers for the first SOF and read its `(width, height)`; `null` when none is reached
 *  within the bounded window. */
function jpegDimensions(b: Uint8Array): Dimensions {
  const limit = Math.min(b.length, JPEG_SCAN_LIMIT);
  let p = OFF.jpegScanStart;
  while (p + OFF.jpegSofEnd <= limit) {
    if (b[p] !== JPEG_MARKER_PREFIX) {
      return NO_DIMENSIONS;
    }
    const marker = b[p + OFF.jpegMarker] ?? 0;
    if (marker === JPEG_MARKER_PREFIX) {
      p += OFF.jpegMarker;
      continue;
    }
    if (isJpegSof(marker)) {
      return { height: u16BE(b, p + OFF.jpegSofHeight), width: u16BE(b, p + OFF.jpegSofWidth) };
    }
    if (isJpegStandalone(marker)) {
      p += OFF.jpegLenField;
      continue;
    }
    const segLen = u16BE(b, p + OFF.jpegLenField);
    if (segLen < OFF.jpegLenField) {
      return NO_DIMENSIONS;
    }
    p += OFF.jpegLenField + segLen;
  }
  return NO_DIMENSIONS;
}

// ── AVIF: a STRUCTURAL ISO-BMFF walk, because this arm feeds a security cap ──────────────────────────────
//
// The AVIF dimensions reach `infra/network/image-guard`'s `isAllowedImageBuffer` — the DECOMPRESSION-BOMB
// defence on remote bytes. So they may not come from a byte scan: `ispe` is four ASCII characters, and any
// payload an attacker controls (an EXIF blob, an `mdat`, a `free` box) can carry those four bytes followed by
// a decoy 1×1 extent. Read against the previous window scan, a real 32000×32000 AVIF carrying such a decoy
// measured as 1×1 and walked straight through the cap.
//
// The dimensions are therefore read ONLY from an `ispe` FullBox reached by descending the boxes that are
// allowed to contain it — `meta` → `iprp` → `ipco` (ISO/IEC 23008-12 §6.5.3) — and a file whose structure
// cannot be validated yields NO dimensions, which the cap treats as a REJECT (the guard always
// requires them). Unknown dimensions must never read as "small enough".

/** Box header = size(4) + type(4). */
const BOX_HEADER_LEN = 8;
/** `meta` is a FullBox: version(1) + flags(3) precede its children. */
const FULLBOX_VERSION_FLAGS = 4;
/** `ftyp` = header + major_brand(4) + minor_version(4); compatible brands follow in 4-byte steps. */
const FTYP_MIN_LEN = 16;
/** The `ftyp` offset holding the minor VERSION — a number, never a brand, so the brand scan skips it. */
const FTYP_MINOR_VERSION_OFFSET = 12;
/** How many sibling boxes one container walk will read. A header holds a few dozen; the budget keeps a
 *  crafted file from turning the walk into work proportional to its own size. */
const BOX_BUDGET = 256;
/** An `ispe` payload = version/flags(4) + width(4) + height(4). */
const ISPE_BODY_LEN = 12;
/** The one `ispe` version this parser reads; a future version may re-lay the fields, so it is a refusal. */
const ISPE_VERSION = 0;
/** A declared extent below this is not an image (0 would also pass every pixel cap for free). MODULE-WIDE
 *  {@link withDimensionFloor} applies it to every format arm, not just the `ispe` read that
 *  first needed it; it lives here because this is where it was first spelled. */
const MIN_DIMENSION = 1;

/** A child box's payload span — `[start, end)` of the bytes INSIDE its header. */
interface BoxSpan {
  readonly start: number;
  readonly end: number;
}

/** The first child box of `type` directly inside `[start, end)`, or null. The walk stops at the first box it
 *  cannot validate — a size below the header, a size running past the container, or the ISO-BMFF extended
 *  forms (size 0 = "to end of file", size 1 = 64-bit largesize), none of which this bounded header parse
 *  reads. Stopping yields "no box", never a guess. */
function findBox(b: Uint8Array, start: number, end: number, type: string): BoxSpan | null {
  let offset = start;
  for (let seen = 0; seen < BOX_BUDGET && offset + BOX_HEADER_LEN <= end; seen += 1) {
    const size = u32BE(b, offset);
    if (size < BOX_HEADER_LEN || offset + size > end) {
      return null;
    }
    if (fourccAt(b, offset + FOURCC_LEN, type)) {
      return { start: offset + BOX_HEADER_LEN, end: offset + size };
    }
    offset += size;
  }
  return null;
}

/** The LARGEST extent declared by any `ispe` box directly inside `[start, end)`. An `ipco` holds one property
 *  set per item (a thumbnail and its primary image both land here), and resolving which belongs to the primary
 *  item means parsing `pitm` + `ipma`. Taking the maximum is the fail-CLOSED answer for a bomb cap: a decoy
 *  small extent cannot lower what the cap sees, and an inflated one can only get the uploader's own bytes
 *  rejected. */
function largestIspe(b: Uint8Array, start: number, end: number): Dimensions {
  let best: Dimensions = NO_DIMENSIONS;
  let bestPixels = 0;
  let offset = start;
  for (let seen = 0; seen < BOX_BUDGET && offset + BOX_HEADER_LEN <= end; seen += 1) {
    const size = u32BE(b, offset);
    if (size < BOX_HEADER_LEN || offset + size > end) {
      return best;
    }
    const body = offset + BOX_HEADER_LEN;
    if (fourccAt(b, offset + FOURCC_LEN, "ispe") && offset + size - body >= ISPE_BODY_LEN && b[body] === ISPE_VERSION) {
      const width = u32BE(b, body + OFF.ispeVersionFlags);
      const height = u32BE(b, body + OFF.ispeVersionFlags + OFF.ispeHeight);
      if (width >= MIN_DIMENSION && height >= MIN_DIMENSION && width * height > bestPixels) {
        best = { width, height };
        bestPixels = width * height;
      }
    }
    offset += size;
  }
  return best;
}

/** AVIF dimensions from the `ispe` box the structure leads to (`meta` → `iprp` → `ipco`); `NO_DIMENSIONS`
 *  when any hop is absent or unvalidatable — which the image guard rejects rather than waves through. */
function avifDimensions(b: Uint8Array): Dimensions {
  const meta = findBox(b, 0, b.length, "meta");
  if (meta === null) {
    return NO_DIMENSIONS;
  }
  const iprp = findBox(b, meta.start + FULLBOX_VERSION_FLAGS, meta.end, "iprp");
  if (iprp === null) {
    return NO_DIMENSIONS;
  }
  const ipco = findBox(b, iprp.start, iprp.end, "ipco");
  if (ipco === null) {
    return NO_DIMENSIONS;
  }
  return largestIspe(b, ipco.start, ipco.end);
}

/** True iff `bytes` opens with an ISO-BMFF `ftyp` box DECLARING an AVIF-family brand (`avif`/`avis`) as its
 *  major or one of its compatible brands. Structural, not a window scan: the brands are exactly the bytes the
 *  `ftyp` box spans, so the four characters `avif` sitting in some later payload no longer name the format. */
function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < FTYP_MIN_LEN || !fourccAt(bytes, FOURCC_LEN, "ftyp")) {
    return false;
  }
  const end = Math.min(u32BE(bytes, 0), bytes.length);
  for (let offset = BOX_HEADER_LEN; offset + FOURCC_LEN <= end; offset += FOURCC_LEN) {
    if (offset !== FTYP_MINOR_VERSION_OFFSET && (fourccAt(bytes, offset, "avif") || fourccAt(bytes, offset, "avis"))) {
      return true;
    }
  }
  return false;
}

/** A parsed extent pair with the POSITIVITY floor applied: either dimension below {@link MIN_DIMENSION}
 *  collapses the PAIR to unknown.
 *
 *  The floor was applied in exactly ONE of the five format arms. `avifDimensions` refused a
 *  zero-extent `ispe` (see {@link MIN_DIMENSION}: "a declared extent below this is not an image"), while
 *  PNG/JPEG/GIF/WebP returned whatever their header math produced — so a COMPLETE, well-formed header
 *  DECLARING `0` sniffed to `{width: 0, height: 0}`. That is a measurement no image can have, and it
 *  travelled: `assets.storeAsset` writes `sniffed?.width ?? null` verbatim, where the `> 0` column CHECK
 *  rejected the whole INSERT and failed the upload outright. Reachable by any upload or fetched image.
 *
 *  APPLIED AT THE DISPATCH, not in four parsers: the format arms do header MATH and this is the one
 *  semantic rule about what a dimension may be, so it belongs where every arm passes through — one home,
 *  and a sixth format inherits it for free.
 *
 *  BOTH-OR-NEITHER, deliberately: a `100 × 0` image is no more measurable than a `0 × 0` one, and every
 *  consumer already branches on `width === null || height === null` as a pair (`isAllowedImageBuffer`'s
 *  dimensions-unknown arm, `imageBelowFloor`, the renderer's reservation). Returning one real number and
 *  one null would invent a third state all three would have to learn.
 *
 *  THE CONSEQUENCES, stated because they are behaviour changes at two seams and both are the right way:
 *   • `infra/network/image-guard`'s `isAllowedImageBuffer` now REJECTS a 0-extent remote image as
 *     `dimensions-unknown` (the guard always requires dimensions), where before the 0s passed every cap
 *     comparison. More fail-closed at a network boundary, which is that guard's stated posture.
 *   • `domain/embeddings`'s `imageBelowFloor` no longer classifies a 0-extent image as below-floor (its
 *     documented rule is that unknown dimensions are NOT below-floor), so a complete such file proceeds to
 *     embed. A file cut short is refused apart from the floor, by {@link isCompleteImage}. */
function withDimensionFloor(dimensions: Dimensions): Dimensions {
  const { width, height } = dimensions;
  if (width === null || height === null || width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return NO_DIMENSIONS;
  }
  return dimensions;
}

// ── Completeness: does the file reach its format's end? ─────────────────────────────────────────────────────
//
// A file cut short can keep its signature and even its dimension header (a 64-byte PNG prefix still holds IHDR),
// so the sniff above cannot tell it from a whole image. Each format states where it ends, and these walks follow
// that structure to the end without decoding: PNG to its IEND chunk, JPEG to its EOI marker, GIF to its trailer,
// WebP to the length its RIFF header declares, AVIF through every top-level box. Bytes after the end (an appended
// payload) do not make a PNG, JPEG, GIF or WebP incomplete. AVIF has no end marker, so bytes past its last box read
// as a box cut short: a truncated `mdat` and an appended payload look the same, and the walk refuses both. A walk
// that meets a field it cannot read answers "incomplete".

const PNG_CHUNK_OVERHEAD = 12; // length(4) + type(4) + crc(4)
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_STUFFED = 0x00;
const JPEG_RST_MIN = 0xd0;
const JPEG_RST_MAX = 0xd7;
const GIF_SCREEN_END = 13; // signature(6) + logical screen descriptor(7)
const GIF_SCREEN_FLAGS = 10;
const GIF_IMAGE_FLAGS = 9; // offset of the packed field inside an image descriptor
const GIF_IMAGE_DESCRIPTOR_LEN = 10; // separator(1) + position and size(8) + packed field(1)
const GIF_EXTENSION = 0x21;
const GIF_EXTENSION_HEAD_LEN = 2; // introducer(1) + label(1), before the extension's sub-blocks
const GIF_IMAGE = 0x2c;
const GIF_TRAILER = 0x3b;
const GIF_COLOR_TABLE_FLAG = 128; // the packed field's high bit
const GIF_COLOR_TABLE_SIZE_MOD = 8; // the packed field's low three bits
const GIF_RGB = 3;
const RIFF_PAYLOAD_START = 8; // "RIFF"(4) + size(4)
const RIFF_SIZE_OFFSET = 4;
const BOX_SIZE_TO_END = 0;
const BOX_SIZE_LARGE = 1;
const BOX_LARGE_HEADER_LEN = 16; // size(4) + type(4) + largesize(8)
const SHIFT_32 = 4_294_967_296; // << 32

function u32LE(b: Uint8Array, o: number): number {
  return u16LE(b, o) + u16LE(b, o + OFF.jpegLenField) * SHIFT_16;
}

function pngComplete(b: Uint8Array): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + PNG_CHUNK_OVERHEAD <= b.length) {
    const next = offset + PNG_CHUNK_OVERHEAD + u32BE(b, offset);
    if (next > b.length) {
      return false;
    }
    if (fourccAt(b, offset + FOURCC_LEN, "IEND")) {
      return true;
    }
    offset = next;
  }
  return false;
}

/** The offset just past an entropy-coded scan: the next marker that is neither a stuffed `FF 00` nor a restart,
 *  or `null` when the bytes end inside the scan. */
function jpegScanEnd(b: Uint8Array, start: number): number | null {
  for (let p = start; p + 1 < b.length; p += 1) {
    const next = b[p + 1] ?? 0;
    if (b[p] === JPEG_MARKER_PREFIX && next !== JPEG_STUFFED && next !== JPEG_MARKER_PREFIX && (next < JPEG_RST_MIN || next > JPEG_RST_MAX)) {
      return p;
    }
  }
  return null;
}

/** One step of the JPEG marker walk from the marker at `p`: the next marker's offset, `true` at the end-of-image
 *  marker, or `false` where the bytes cannot be followed. A start-of-scan segment steps past its scan data. */
function jpegStep(b: Uint8Array, p: number): number | boolean {
  if (b[p] !== JPEG_MARKER_PREFIX) {
    return false;
  }
  const marker = b[p + OFF.jpegMarker] ?? 0;
  if (marker === JPEG_EOI) {
    return true;
  }
  if (marker === JPEG_MARKER_PREFIX) {
    return p + OFF.jpegMarker;
  }
  if (isJpegStandalone(marker)) {
    return p + OFF.jpegLenField;
  }
  if (p + OFF.jpegLenField + OFF.jpegLenField > b.length) {
    return false;
  }
  const segLen = u16BE(b, p + OFF.jpegLenField);
  if (segLen < OFF.jpegLenField) {
    return false;
  }
  const next = p + OFF.jpegLenField + segLen;
  return marker === JPEG_SOS ? (jpegScanEnd(b, next) ?? false) : next;
}

function jpegComplete(b: Uint8Array): boolean {
  let p: number | boolean = OFF.jpegScanStart;
  while (typeof p === "number" && p + OFF.jpegLenField <= b.length) {
    p = jpegStep(b, p);
  }
  return p === true;
}

/** Bytes a GIF color table takes, from the packed field that declares it. */
function gifColorTableLen(flags: number): number {
  return flags >= GIF_COLOR_TABLE_FLAG ? GIF_RGB * 2 ** ((flags % GIF_COLOR_TABLE_SIZE_MOD) + 1) : 0;
}

/** The offset past a run of GIF data sub-blocks (each a length byte and its data, ended by a zero length), or
 *  `null` when the bytes end first. */
function gifSubBlocksEnd(b: Uint8Array, start: number): number | null {
  let p = start;
  while (p < b.length) {
    const size = b[p] ?? 0;
    p += 1 + size;
    if (size === 0) {
      return p;
    }
  }
  return null;
}

function gifComplete(b: Uint8Array): boolean {
  if (b.length < GIF_SCREEN_END) {
    return false;
  }
  let p: number | null = GIF_SCREEN_END + gifColorTableLen(b[GIF_SCREEN_FLAGS] ?? 0);
  while (p !== null && p < b.length) {
    const block = b[p];
    if (block === GIF_TRAILER) {
      return true;
    }
    if (block === GIF_EXTENSION) {
      p = gifSubBlocksEnd(b, p + GIF_EXTENSION_HEAD_LEN);
    } else if (block === GIF_IMAGE && p + GIF_IMAGE_DESCRIPTOR_LEN <= b.length) {
      // The descriptor, its local color table, the LZW minimum code size byte, then the image data sub-blocks.
      p = gifSubBlocksEnd(b, p + GIF_IMAGE_DESCRIPTOR_LEN + gifColorTableLen(b[p + GIF_IMAGE_FLAGS] ?? 0) + 1);
    } else {
      return false;
    }
  }
  return false;
}

function webpComplete(b: Uint8Array): boolean {
  return b.length >= RIFF_PAYLOAD_START && b.length >= RIFF_PAYLOAD_START + u32LE(b, RIFF_SIZE_OFFSET);
}

function isoBmffComplete(b: Uint8Array): boolean {
  let offset = 0;
  while (offset < b.length) {
    if (offset + BOX_HEADER_LEN > b.length) {
      return false;
    }
    const size = u32BE(b, offset);
    if (size === BOX_SIZE_TO_END) {
      return true;
    }
    const boxLen =
      size === BOX_SIZE_LARGE && offset + BOX_LARGE_HEADER_LEN <= b.length
        ? u32BE(b, offset + BOX_HEADER_LEN) * SHIFT_32 + u32BE(b, offset + BOX_HEADER_LEN + FOURCC_LEN)
        : size;
    if (boxLen < BOX_HEADER_LEN || offset + boxLen > b.length) {
      return false;
    }
    offset += boxLen;
  }
  return true;
}

/** Whether `bytes` hold a whole image: a recognized format whose structure reaches its end inside the buffer.
 *  `false` for a file cut short, even one that keeps its signature and dimension header, and for bytes no
 *  format claims. Pure, never decodes; unlike {@link sniffImageBytes} it walks the whole file, skipping chunk
 *  payloads where the format gives their lengths. */
export function isCompleteImage(bytes: Uint8Array): boolean {
  switch (sniffMime(bytes)) {
    case PNG_MIME:
      return pngComplete(bytes);
    case JPEG_MIME:
      return jpegComplete(bytes);
    case GIF_MIME:
      return gifComplete(bytes);
    case WEBP_MIME:
      return webpComplete(bytes);
    case OCTET_STREAM:
      return isAvif(bytes) && isoBmffComplete(bytes);
  }
}

/** The full byte-facts of an image buffer — `{mime, width, height, animated}` — or `null` when no
 *  known signature matches (PNG/JPEG/GIF/WebP/AVIF). Pure: never throws, never decodes, never reads past the
 *  bounded header window. The remote `Content-Type` is NEVER consulted — these bytes are the truth.
 *
 *  Every arm's extents pass {@link withDimensionFloor}: a declared dimension below 1 is not a small image,
 *  it is a header saying something impossible, and that is the same fact as an unreadable header. */
export function sniffImageBytes(bytes: Uint8Array): SniffedImage | null {
  const animated = isAnimated(bytes);
  switch (sniffMime(bytes)) {
    case PNG_MIME:
      return { mime: PNG_MIME, ...withDimensionFloor(pngDimensions(bytes)), animated };
    case JPEG_MIME:
      return { mime: JPEG_MIME, ...withDimensionFloor(jpegDimensions(bytes)), animated };
    case GIF_MIME:
      return { mime: GIF_MIME, ...withDimensionFloor(gifDimensions(bytes)), animated };
    case WEBP_MIME:
      return { mime: WEBP_MIME, ...withDimensionFloor(webpDimensions(bytes)), animated };
    case OCTET_STREAM:
      if (isAvif(bytes)) {
        return { mime: AVIF_MIME, ...withDimensionFloor(avifDimensions(bytes)), animated };
      }
      return null;
  }
}
