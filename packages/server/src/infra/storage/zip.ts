// biome-ignore-all lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian
// header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically
// shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).

// infra/storage/zip — the ONE streaming zip home for the portability delivery core
// (export-import-portability.md §3). A SEALED I/O-free adapter: `node:zlib` (the audited DEFLATE primitive)
// plus `@orb/kit` only — NEVER `@orb/db`, NEVER a domain (the infra sealed-executor invariant; `infra-no-db`).
// This is THE hostile-input boundary for the import path: an uploaded archive is 100 percent
// attacker-controlled bytes, so every field is treated as a lie until a belt proves otherwise.
//
// TWO halves that PAIR (never a second zip impl — the one-home principle, like the serde):
//   • packZip(entries)   — DOWNLOAD. Streams a valid store/deflate zip as a `ReadableStream`; one entry is
//                          held in memory at a time (the central directory records accumulate — 46 bytes
//                          plus name each — and flush at the end). Deterministic: a fixed DOS timestamp.
//   • extractZip(source) — UPLOAD. The security surface. Buffers the COMPRESSED archive under a HARD total
//                          cap, parses the CENTRAL DIRECTORY (the authoritative index — never the local
//                          headers, which a crafted archive can desync from the real data), validates EVERY
//                          entry against the belt battery BEFORE any inflate, then STAGES each inflated entry
//                          to a per-request temp dir on DISK (one decompressed entry in memory at a time).
//                          Returns a disposable StagedArchive: the caller reads each entry's bytes back
//                          lazily and MUST `dispose()` (a try/finally) to delete the staging dir. A
//                          fully-self-contained bundle (all blobs, incl. generated images) can hold far more
//                          than the aggregate cap's worth of decompressed bytes — so they live on DISK, not
//                          the heap, and a legit large bundle can't OOM the box. Any hostile entry REJECTS
//                          the whole archive (fail-closed) and removes any partial staging before throwing —
//                          the driver's per-file isolation is for benign/unroutable files, not for attacks.
//
// WHY buffer-then-central-directory instead of a streaming local-header state machine: a streaming parser
// must trust local-header sizes (or hunt the data-descriptor signature through attacker bytes) — the classic
// zip-parser wound. The central directory is the format's own authoritative index; buffering the COMPRESSED
// archive under the total cap makes the parse a pure in-memory walk with no partial-chunk ambiguity.
// "Streaming where feasible" (section 3) is honored on the PACK side (trusted output); on EXTRACT the
// compressed archive is bounded-buffered (safety), while the DECOMPRESSED output is streamed to disk (so the
// heap never holds the whole inflated bundle).
//
// DISK STAGING (the decompressed-output home):
//   • one temp dir PER extractZip call, `mkdtemp`'d under a controlled root (ExtractOptions.stagingRoot, else
//     the OS temp dir) — never a shared or predictable path.
//   • each staged file is named by its ENTRY INDEX ("0", "1", …), NEVER the archive's own (attacker-chosen)
//     path — even a belt-6-validated name never becomes a filesystem path here. The logical path rides in the
//     in-memory StagedEntry, decoupled from the on-disk name.
//   • writes use O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW and reads use O_RDONLY|O_NOFOLLOW into a freshly-minted
//     empty dir, so a symlink can never be created, followed, or overwritten.
//   • cleanup is GUARANTEED: a mid-stage belt failure removes the partial dir before rethrowing, and the
//     returned StagedArchive.dispose() (idempotent, force) removes it on the caller's success/error finally.
//
// THE BELT BATTERY (extract):
//   1. total pre-decompression cap    — the buffered archive may not exceed maxTotalBytes (PD-94; DoS plus
//                                        the zip-bomb outer bound). Enforced WHILE reading, before parse.
//   2. entry-count cap                — maxEntries (a millions-of-empty-entries DoS).
//   3. compression-method allowlist   — STORE (0) or DEFLATE (8) only; anything else (incl. any encrypted
//                                        entry — general-purpose bit 0) is rejected.
//   4. per-entry declared-size cap    — the central-directory uncompressed size must be within maxEntryBytes
//                                        BEFORE decompression (the lying-header's first line of defense).
//   5. declared-vs-actual counter     — inflate runs under maxOutputLength equal to the declared size (zlib
//                                        throws if the real stream produces more — the zip-bomb / lying-header
//                                        guard), and the produced length plus CRC-32 are re-checked after.
//   6. zip-slip guard                 — the entry name is rejected if absolute, drive-lettered, backslashed,
//                                        NUL-bearing, or carrying any parent-dir segment. (Defense in depth:
//                                        the driver routes by dir to a domain op — the name is NEVER a
//                                        filesystem path — but a traversal name is a hostile signal.)
//   7. no ZIP64                       — a 0xffffffff size / 0xffff count sentinel is rejected unsupported (an
//                                        untrusted ZIP64 parser is more surface than our caps ever need).
//   8. aggregate decompressed cap     — the SUM of produced (inflated) bytes across ALL entries, checked as
//                                        each entry is staged; the instant it exceeds maxTotalDecompressedBytes
//                                        staging aborts and the partial staging dir is removed. Now a
//                                        DISK-usage cap (the decompressed bytes are staged to disk, not held
//                                        in memory): belts 4+5 bound ONE entry, this bounds the sum, so many
//                                        small highly-compressible entries can't fill the staging disk.

import { constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync, inflateRawSync, constants as zlibConstants } from "node:zlib";

// ── Format signatures (little-endian 32-bit magics) ─────────────────────────────────────────────────────
const SIG_LOCAL = 0x04_03_4b_50;
const SIG_CENTRAL = 0x02_01_4b_50;
const SIG_EOCD = 0x06_05_4b_50;

// ── Fixed record sizes (the PKZIP APPNOTE layouts) ──────────────────────────────────────────────────────
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT = 0xff_ff;
const CENTRAL_FIXED_SIZE = 46;
const LOCAL_FIXED_SIZE = 30;

// ── End-of-central-directory field offsets (from the EOCD signature) ────────────────────────────────────
const EOCD_OFF_TOTAL_ENTRIES = 10;
const EOCD_OFF_CD_SIZE = 12;
const EOCD_OFF_CD_OFFSET = 16;

// ── Central-directory record field offsets (from the central signature) ─────────────────────────────────
const CDH_OFF_VERSION_MADE = 4;
const CDH_OFF_VERSION_NEEDED = 6;
const CDH_OFF_FLAGS = 8;
const CDH_OFF_METHOD = 10;
const CDH_OFF_TIME = 12;
const CDH_OFF_DATE = 14;
const CDH_OFF_CRC = 16;
const CDH_OFF_COMPRESSED = 20;
const CDH_OFF_UNCOMPRESSED = 24;
const CDH_OFF_NAME_LEN = 28;
const CDH_OFF_EXTRA_LEN = 30;
const CDH_OFF_COMMENT_LEN = 32;
const CDH_OFF_LOCAL_OFFSET = 42;

// ── Local-file-header field offsets (from the local signature) ──────────────────────────────────────────
const LFH_OFF_VERSION = 4;
const LFH_OFF_FLAGS = 6;
const LFH_OFF_METHOD = 8;
const LFH_OFF_TIME = 10;
const LFH_OFF_DATE = 12;
const LFH_OFF_CRC = 14;
const LFH_OFF_COMPRESSED = 18;
const LFH_OFF_UNCOMPRESSED = 22;
const LFH_OFF_NAME_LEN = 26;
const LFH_OFF_EXTRA_LEN = 28;

// ── Field widths + the version stamp ────────────────────────────────────────────────────────────────────
const U16_BYTES = 2;
const U32_BYTES = 4;
const ZIP_VERSION = 20;

// ── Compression methods (the allowlist) ─────────────────────────────────────────────────────────────────
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// ── General-purpose bit flags we care about ─────────────────────────────────────────────────────────────
const GP_ENCRYPTED = 0x00_01; // bit 0 — any encryption; rejected.
const GP_UTF8 = 0x08_00; // bit 11 — UTF-8 filename (set on pack).

// ── ZIP64 sentinels (rejected — unsupported) ────────────────────────────────────────────────────────────
const U32_MAX = 0xff_ff_ff_ff;
const U16_MAX = 0xff_ff;

// ── Deterministic DOS timestamp for packed entries (1980-01-01 00:00:00 — no ambient clock) ─────────────
const DOS_DATE_1980_01_01 = 0x00_21;
const DOS_TIME_ZERO = 0x00_00;

// ── Default caps (section 3: 64 MiB/entry, 512 MiB total). The HTTP route may tighten maxTotalBytes. ────
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const MAX_ENTRY_MIB = 64;
const MAX_TOTAL_MIB = 512;
// The AGGREGATE decompressed cap (belt 8) — now a DISK-usage cap (the decompressed bytes are staged to disk,
// not held in memory). The per-entry (64 MiB) + total-compressed (512 MiB) belts do NOT bound the SUM of
// decompressed bytes across entries — a legal archive of many small-but-highly-compressible entries (all-zero
// DEFLATE ≈ 1000x) passes every other belt yet inflates to hundreds of GiB. This cap sums PRODUCED bytes
// across ALL entries and aborts staging the instant it is exceeded, so the staging disk stays bounded (and
// peak decompressed MEMORY stays at one 64 MiB entry, since only one entry is inflated at a time before it
// is flushed to disk). Because the ceiling is now disk (cheap) rather than heap, the untrusted-upload route
// may safely raise this for a genuine all-blobs full-account bundle without OOM risk.
const MAX_TOTAL_DECOMPRESSED_MIB = 1024;
const DEFAULT_MAX_ENTRY_BYTES = MAX_ENTRY_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_TOTAL_BYTES = MAX_TOTAL_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_TOTAL_DECOMPRESSED_BYTES = MAX_TOTAL_DECOMPRESSED_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_ENTRIES = 50_000;

// A drive-letter prefix (C:, d:\ …) — hoisted so the zip-slip check does not recompile it per name.
const DRIVE_LETTER = /^[a-zA-Z]:/;

// Why an untrusted archive was rejected — the closed axis, declared ONCE as a tuple and derived (§7.5
// string-union dispatch / no-inline-union-redecl), so a new cause widens the union everywhere. All map to a
// 400-class reject; the kind is for logging plus tests, never a byte-leak.
//   too-large        — the total buffered size, or an entry's declared size, exceeded a cap
//   too-many-entries — the entry count exceeded the cap
//   bad-method       — a compression method outside the store/deflate allowlist (incl. encrypted)
//   zip-slip         — an absolute / traversing / drive-lettered / NUL-bearing entry name
//   bomb             — inflate produced more than the declared size, or the CRC-32 did not match
//   unsupported      — ZIP64, or a structurally malformed archive we will not guess at
//   malformed        — a truncated / signature-less archive
const ZIP_REJECT_KINDS = [
  "too-large",
  "too-many-entries",
  "bad-method",
  "zip-slip",
  "bomb",
  "unsupported",
  "malformed",
] as const;

/** One of the closed set of {@link ZIP_REJECT_KINDS}. */
type ZipRejectKind = (typeof ZIP_REJECT_KINDS)[number];

/** A byte source for `extractZip`: the whole archive as one buffer, or a stream/iterable of chunks (the
 *  Hono request body is a `ReadableStream`; a test hands a `Uint8Array`). */
type ZipByteSource = Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

/** A rejected untrusted archive. NEVER carries file bytes or a decoded payload — only the machine-auditable
 *  cause. Thrown by `extractZip`; a hostile entry rejects the WHOLE archive (fail-closed). */
export class ZipRejectedError extends Error {
  readonly kind: ZipRejectKind;
  constructor(kind: ZipRejectKind, message: string, options?: ErrorOptions) {
    super(`zip rejected (${kind}): ${message}`, options);
    this.name = "ZipRejectedError";
    this.kind = kind;
  }
}

/** One file to place into a packed archive: its FULL path within the zip (e.g. "characters/Aria.png") plus
 *  the raw bytes. The delivery core builds `path` by prefixing each entity's `dir` onto the portable
 *  filename; this layer treats `path` as an opaque name it writes verbatim (it does not route on it). */
export interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** One entry recovered from an untrusted archive, AFTER the belt battery passed AND it was staged to disk.
 *  Carries the stored `path` (the delivery core routes by its leading dir segment) plus a lazy `read()` that
 *  pulls the inflated bytes back off the staging disk — so the caller holds ONE entry's bytes at a time, not
 *  the whole decompressed bundle. Valid only until the owning {@link StagedArchive} is disposed. */
export interface StagedEntry {
  readonly path: string;
  /** Read this entry's staged bytes from disk (opened O_NOFOLLOW). One entry in memory per call. */
  readonly read: () => Promise<Uint8Array>;
}

/** The result of a successful {@link extractZip}: every validated entry as a disk-backed handle, plus a
 *  MANDATORY `dispose()`. The decompressed bytes live in a per-call temp dir; the caller MUST `dispose()`
 *  in a try/finally (success AND error) to remove it. `dispose()` is idempotent + force (a double call, or a
 *  call after a partial read, is safe). */
export interface StagedArchive {
  readonly entries: readonly StagedEntry[];
  readonly dispose: () => Promise<void>;
}

/** The extract belts, all tunable by the untrusted-upload route (the download side needs none). Omitted
 *  fields fall back to the section-3 defaults. */
export interface ExtractOptions {
  /** The hard cap on the buffered COMPRESSED archive size (bytes) — the DoS plus zip-bomb OUTER bound (PD-94). */
  readonly maxTotalBytes?: number;
  /** The hard cap on any single entry's DECLARED uncompressed size (bytes), checked before inflate. */
  readonly maxEntryBytes?: number;
  /** The hard cap on the AGGREGATE decompressed size (bytes) summed across ALL entries — the amplification
   *  belt (belt 8), now a DISK-usage cap. Enforced as each entry is staged: the instant the running produced
   *  total exceeds it, staging aborts and the partial staging dir is removed. */
  readonly maxTotalDecompressedBytes?: number;
  /** The hard cap on the entry count. */
  readonly maxEntries?: number;
  /** The controlled root the per-call staging dir is `mkdtemp`'d under (created if absent). Defaults to the
   *  OS temp dir. The route may point this at a dedicated import-staging volume. */
  readonly stagingRoot?: string;
}

// ── Little-endian readers (a crafted archive can point an offset past the buffer — every read is bounded) ─
// DataView carries the byteOffset of a subarray source, so `at` stays archive-relative in both readers.
function u16(buf: Uint8Array, at: number): number {
  if (at < 0 || at + U16_BYTES > buf.length) {
    throw new ZipRejectedError("malformed", "read past end of archive");
  }
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint16(at, true);
}

function u32(buf: Uint8Array, at: number): number {
  if (at < 0 || at + U32_BYTES > buf.length) {
    throw new ZipRejectedError("malformed", "read past end of archive");
  }
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(at, true);
}

/**
 * Reject a hostile entry name (belt 6 — zip-slip). The name must be a plain relative path: no leading
 * separator (absolute), no drive prefix, no backslash (a Windows separator a naive slash-split would miss),
 * no embedded NUL (a truncation trick), and no parent-dir segment (the traversal itself). An empty name is
 * also rejected. This runs on the raw central-directory name BEFORE the entry is ever yielded.
 */
function assertSafeName(name: string): void {
  if (name.length === 0) {
    throw new ZipRejectedError("zip-slip", "empty entry name");
  }
  if (name.includes("\0")) {
    throw new ZipRejectedError("zip-slip", "entry name contains a NUL byte");
  }
  if (name.includes("\\")) {
    throw new ZipRejectedError("zip-slip", `entry name uses a backslash separator: ${name}`);
  }
  if (name.startsWith("/")) {
    throw new ZipRejectedError("zip-slip", `absolute entry name: ${name}`);
  }
  if (DRIVE_LETTER.test(name)) {
    throw new ZipRejectedError("zip-slip", `drive-lettered entry name: ${name}`);
  }
  for (const segment of name.split("/")) {
    if (segment === "..") {
      throw new ZipRejectedError("zip-slip", `traversing entry name: ${name}`);
    }
  }
}

// ── The parsed central-directory record we act on (the fields the belts plus the slice need) ────────────
interface CentralRecord {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
}

/** Find the End-Of-Central-Directory record by scanning back from the tail for its signature (the trailing
 *  comment can be up to 65535 bytes, so we bound the scan to that window plus the record itself). */
function findEocd(buf: Uint8Array): number {
  const minStart = Math.max(0, buf.length - EOCD_MIN_SIZE - EOCD_MAX_COMMENT);
  for (let at = buf.length - EOCD_MIN_SIZE; at >= minStart; at--) {
    if (u32(buf, at) === SIG_EOCD) {
      return at;
    }
  }
  throw new ZipRejectedError("malformed", "no end-of-central-directory record (not a zip)");
}

/** The location the central-directory walk needs: where it starts and how many records to expect. */
interface CentralDirLocation {
  readonly count: number;
  readonly cdOffset: number;
}

/** Parse the EOCD into the central-directory location plus entry count, rejecting ZIP64 sentinels. */
function readEocd(buf: Uint8Array, eocdAt: number): CentralDirLocation {
  const count = u16(buf, eocdAt + EOCD_OFF_TOTAL_ENTRIES);
  const cdSize = u32(buf, eocdAt + EOCD_OFF_CD_SIZE);
  const cdOffset = u32(buf, eocdAt + EOCD_OFF_CD_OFFSET);
  if (count === U16_MAX || cdOffset === U32_MAX || cdSize === U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 archive is not supported");
  }
  if (cdOffset + cdSize > buf.length) {
    throw new ZipRejectedError("malformed", "central directory extends past the archive");
  }
  return { count, cdOffset };
}

/** The per-entry belt limits threaded through the central-directory walk. */
interface EntryLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
}

/** Parse ONE central-directory record at `at`, enforcing the method / encryption / declared-size / zip-slip
 *  belts (all BEFORE any inflate). Returns the record plus the offset of the next record. */
function parseCentralRecord(
  buf: Uint8Array,
  at: number,
  index: number,
  maxEntryBytes: number,
): { readonly record: CentralRecord; readonly nextAt: number } {
  if (u32(buf, at) !== SIG_CENTRAL) {
    throw new ZipRejectedError("malformed", `central directory entry ${index} has a bad signature`);
  }
  const flags = u16(buf, at + CDH_OFF_FLAGS);
  const method = u16(buf, at + CDH_OFF_METHOD);
  const crc = u32(buf, at + CDH_OFF_CRC);
  const compressedSize = u32(buf, at + CDH_OFF_COMPRESSED);
  const uncompressedSize = u32(buf, at + CDH_OFF_UNCOMPRESSED);
  const nameLen = u16(buf, at + CDH_OFF_NAME_LEN);
  const extraLen = u16(buf, at + CDH_OFF_EXTRA_LEN);
  const commentLen = u16(buf, at + CDH_OFF_COMMENT_LEN);
  const localOffset = u32(buf, at + CDH_OFF_LOCAL_OFFSET);

  if (compressedSize === U32_MAX || uncompressedSize === U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 entry size is not supported");
  }
  if ((flags & GP_ENCRYPTED) !== 0) {
    throw new ZipRejectedError("bad-method", `entry ${index} is encrypted`);
  }
  if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
    throw new ZipRejectedError("bad-method", `entry ${index} uses compression method ${method}`);
  }
  if (uncompressedSize > maxEntryBytes) {
    throw new ZipRejectedError(
      "too-large",
      `entry ${index} declares ${uncompressedSize} bytes, over the ${maxEntryBytes} per-entry cap`,
    );
  }
  const nameAt = at + CENTRAL_FIXED_SIZE;
  if (nameAt + nameLen > buf.length) {
    throw new ZipRejectedError("malformed", `entry ${index} name extends past the archive`);
  }
  const name = new TextDecoder("utf-8").decode(buf.subarray(nameAt, nameAt + nameLen));
  assertSafeName(name);
  return {
    record: { name, method, crc, compressedSize, uncompressedSize, localOffset },
    nextAt: nameAt + nameLen + extraLen + commentLen,
  };
}

/** Walk the central directory into `CentralRecord`s, enforcing the entry-count belt then each per-entry belt
 *  (all BEFORE any inflate — a structural attack never reaches decompression). */
function readCentralDirectory(
  buf: Uint8Array,
  location: CentralDirLocation,
  limits: EntryLimits,
): CentralRecord[] {
  if (location.count > limits.maxEntries) {
    throw new ZipRejectedError(
      "too-many-entries",
      `${location.count} entries exceeds the cap of ${limits.maxEntries}`,
    );
  }
  const records: CentralRecord[] = [];
  let at = location.cdOffset;
  for (let i = 0; i < location.count; i++) {
    const { record, nextAt } = parseCentralRecord(buf, at, i, limits.maxEntryBytes);
    records.push(record);
    at = nextAt;
  }
  return records;
}

/** Locate an entry's compressed payload by reading its LOCAL header (the local name/extra lengths can differ
 *  from the central copy, so the data offset must come from the local record — but the SIZES come from the
 *  already-validated central record, never the local header). Returns the compressed byte slice. */
function locateData(buf: Uint8Array, rec: CentralRecord): Uint8Array {
  if (u32(buf, rec.localOffset) !== SIG_LOCAL) {
    throw new ZipRejectedError("malformed", `entry ${rec.name} has no local header`);
  }
  const nameLen = u16(buf, rec.localOffset + LFH_OFF_NAME_LEN);
  const extraLen = u16(buf, rec.localOffset + LFH_OFF_EXTRA_LEN);
  const dataAt = rec.localOffset + LOCAL_FIXED_SIZE + nameLen + extraLen;
  const dataEnd = dataAt + rec.compressedSize;
  if (dataEnd > buf.length) {
    throw new ZipRejectedError("malformed", `entry ${rec.name} data extends past the archive`);
  }
  return buf.subarray(dataAt, dataEnd);
}

/** Decompress one already-validated entry under the declared-vs-actual belt (5). STORE entries must have
 *  matching sizes; DEFLATE entries inflate under maxOutputLength equal to the declared size so a bomb /
 *  lying header throws instead of allocating. The produced length plus CRC-32 are then re-checked against
 *  the declared values (a shrinking lie, or tampered bytes, is caught here). */
function inflateEntry(buf: Uint8Array, rec: CentralRecord): Uint8Array {
  const compressed = locateData(buf, rec);
  let out: Uint8Array;
  if (rec.method === METHOD_STORE) {
    if (rec.compressedSize !== rec.uncompressedSize) {
      throw new ZipRejectedError("bomb", `stored entry ${rec.name} declares mismatched sizes`);
    }
    // Copy out of the shared archive buffer so the yielded bytes do not alias (and pin) the whole archive.
    out = compressed.slice();
  } else {
    out = inflateWithCap(compressed, rec);
  }
  if (out.length !== rec.uncompressedSize) {
    throw new ZipRejectedError(
      "bomb",
      `entry ${rec.name} produced ${out.length} bytes, declared ${rec.uncompressedSize}`,
    );
  }
  if (crc32(out) >>> 0 !== rec.crc) {
    throw new ZipRejectedError("bomb", `entry ${rec.name} failed its CRC-32 integrity check`);
  }
  return out;
}

/** Raw-inflate under the per-entry output cap — zlib throws ERR_BUFFER_TOO_LARGE the instant output would
 *  exceed the declared size (the bomb belt), which maps to a `bomb` rejection; anything else is malformed. */
function inflateWithCap(compressed: Uint8Array, rec: CentralRecord): Uint8Array {
  try {
    return inflateRawSync(compressed, {
      maxOutputLength: rec.uncompressedSize,
      finishFlush: zlibConstants.Z_FINISH,
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ERR_BUFFER_TOO_LARGE") {
      // biome-ignore lint/style/useErrorCause: cause IS forwarded — ZipRejectedError passes its 3rd-arg ErrorOptions to super(); biome only inspects the 2nd constructor arg.
      throw new ZipRejectedError("bomb", `entry ${rec.name} inflates beyond its declared size`, {
        cause: err,
      });
    }
    // biome-ignore lint/style/useErrorCause: cause IS forwarded — ZipRejectedError passes its 3rd-arg ErrorOptions to super(); biome only inspects the 2nd constructor arg.
    throw new ZipRejectedError("malformed", `entry ${rec.name} is not valid deflate data`, {
      cause: err,
    });
  }
}

/** Normalize a `ReadableStream` or `AsyncIterable` of chunks into an `AsyncIterable` (a `ReadableStream` on
 *  Node 24 is itself async-iterable, but the explicit reader path keeps the type narrow plus cancel-safe). */
function toAsyncIterable(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
  // Discriminate on `getReader` (a ReadableStream-only member): a `ReadableStream` may itself be
  // async-iterable in the lib types, so a `Symbol.asyncIterator in source` guard collapses the else branch
  // to `never`. An AsyncIterable has no `getReader`, so it falls through unchanged.
  if (!("getReader" in source)) {
    return source;
  }
  const stream = source;
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      const reader = stream.getReader();
      try {
        for (;;) {
          // biome-ignore lint/performance/noAwaitInLoops: draining a stream is inherently one awaited read per chunk.
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          if (value !== undefined) {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

/** Drain a byte source into ONE buffer under the total cap (belt 1), rejecting the instant it is exceeded —
 *  the archive is never fully buffered past the cap, so a 10 GiB upload is aborted after maxTotalBytes. */
async function bufferCapped(source: ZipByteSource, maxTotalBytes: number): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    if (source.length > maxTotalBytes) {
      throw new ZipRejectedError(
        "too-large",
        `archive is ${source.length} bytes, over ${maxTotalBytes}`,
      );
    }
    return source;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of toAsyncIterable(source)) {
    total += chunk.length;
    if (total > maxTotalBytes) {
      throw new ZipRejectedError("too-large", `archive exceeds ${maxTotalBytes} bytes`);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// The per-call staging dir prefix (mkdtemp appends the random suffix). A stray dir left by a crash is
// recognizable + reapable by an operator; the `orb-` root keeps it out of the way of unrelated temp files.
const STAGING_PREFIX = "orb-import-stage-";

/** Write one inflated entry to its staging file. O_CREAT|O_EXCL means we NEVER open an existing path (so a
 *  pre-planted symlink can't be followed or clobbered); O_NOFOLLOW is the belt-and-suspenders on the final
 *  segment. The dir was just `mkdtemp`'d (empty, ours), and the name is our own index token, so neither can
 *  be attacker-influenced — this is defense in depth over an already-safe path. */
async function writeStaged(path: string, bytes: Uint8Array): Promise<void> {
  const flags =
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  const handle = await open(path, flags);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

/** Read one staged entry's bytes back off disk (O_NOFOLLOW — the file is a regular file we wrote, never a
 *  link). Returns a plain `Uint8Array` view over the read buffer (no extra copy). */
async function readStaged(path: string): Promise<Uint8Array> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const data = await handle.readFile();
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    await handle.close();
  }
}

/** Inflate every validated record and STAGE it to `dir` (one decompressed entry in memory at a time),
 *  enforcing the aggregate cap (belt 8) as a running disk-usage total. Returns the disk-backed handles.
 *  Any belt failure propagates — the caller (extractZip) removes the partial dir before rethrowing. */
async function stageRecords(
  dir: string,
  buf: Uint8Array,
  records: readonly CentralRecord[],
  maxTotalDecompressedBytes: number,
): Promise<StagedEntry[]> {
  const entries: StagedEntry[] = [];
  let producedTotal = 0;
  for (const [i, rec] of records.entries()) {
    const bytes = inflateEntry(buf, rec); // belts 3/5 + declared-vs-actual + CRC (throws on any mismatch)
    // Belt 8 — the aggregate accumulator, checked right after THIS entry inflates (each is already
    // per-entry-capped) so the running sum overshoots by at most one entry before the abort. Firing here,
    // before the disk write, keeps the staging disk bounded to this cap plus one entry.
    producedTotal += bytes.length;
    if (producedTotal > maxTotalDecompressedBytes) {
      throw new ZipRejectedError(
        "bomb",
        `aggregate decompressed size exceeds ${maxTotalDecompressedBytes} bytes (amplification bomb)`,
      );
    }
    // The staged filename is the ENTRY INDEX — never the archive's own (attacker-chosen) path. The logical
    // `path` rides in the handle, decoupled from the on-disk name.
    const stagedPath = join(dir, String(i));
    // biome-ignore lint/performance/noAwaitInLoops: staging is inherently one awaited disk write per entry (and the whole point is to NOT hold the inflated bundle in memory).
    await writeStaged(stagedPath, bytes);
    entries.push({ path: rec.name, read: () => readStaged(stagedPath) });
  }
  return entries;
}

/**
 * Extract an UNTRUSTED archive to a per-call DISK staging dir. Buffers the COMPRESSED archive under the total
 * cap, parses the central directory, and validates EVERY entry against the structural belt battery (count /
 * method / declared-size / zip-slip / ZIP64) BEFORE inflating anything — so a structural attack rejects the
 * whole archive up front, never mid-write. Each entry is then inflated (one at a time) under its per-entry
 * output belt + the aggregate belt and streamed to disk. Returns a {@link StagedArchive} whose entries read
 * their bytes back lazily; the caller MUST `dispose()` it in a try/finally. Any belt failure throws
 * `ZipRejectedError` and removes the partial staging dir before rethrowing (nothing leaks on the reject path).
 */
export async function extractZip(
  source: ZipByteSource,
  options?: ExtractOptions,
): Promise<StagedArchive> {
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntryBytes = options?.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalDecompressedBytes =
    options?.maxTotalDecompressedBytes ?? DEFAULT_MAX_TOTAL_DECOMPRESSED_BYTES;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const stagingRoot = options?.stagingRoot ?? tmpdir();

  const buf = await bufferCapped(source, maxTotalBytes);
  const eocdAt = findEocd(buf);
  const location = readEocd(buf, eocdAt);
  // ALL structural belts run here, eagerly — the archive is accepted or rejected as a whole before a single
  // byte is inflated or staged (fail-closed: no partial extraction of a hostile bundle). The per-entry
  // inflate belts + the aggregate belt (belt 8) run during staging, below.
  const records = readCentralDirectory(buf, location, { maxEntries, maxEntryBytes });

  await mkdir(stagingRoot, { recursive: true });
  const dir = await mkdtemp(join(stagingRoot, STAGING_PREFIX));
  const dispose = (): Promise<void> => rm(dir, { recursive: true, force: true });
  try {
    const entries = await stageRecords(dir, buf, records, maxTotalDecompressedBytes);
    return { entries, dispose };
  } catch (err) {
    await dispose(); // a mid-stage belt failure must leave NOTHING behind — clean up before rethrowing.
    throw err;
  }
}

// ── PACK (download) ─────────────────────────────────────────────────────────────────────────────────────
// The central-directory record accumulated per packed entry, to flush after the last entry's data.
interface PackedCentral {
  readonly nameBytes: Uint8Array;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly method: number;
  readonly localOffset: number;
}

function writeU16(view: DataView, at: number, value: number): void {
  view.setUint16(at, value & U16_MAX, true);
}

function writeU32(view: DataView, at: number, value: number): void {
  view.setUint32(at, value >>> 0, true);
}

/** Build ONE local file header plus name (the data bytes are emitted separately by the stream). */
function localHeader(central: PackedCentral): Uint8Array {
  const head = new Uint8Array(LOCAL_FIXED_SIZE + central.nameBytes.length);
  const view = new DataView(head.buffer);
  writeU32(view, 0, SIG_LOCAL);
  writeU16(view, LFH_OFF_VERSION, ZIP_VERSION);
  writeU16(view, LFH_OFF_FLAGS, GP_UTF8);
  writeU16(view, LFH_OFF_METHOD, central.method);
  writeU16(view, LFH_OFF_TIME, DOS_TIME_ZERO);
  writeU16(view, LFH_OFF_DATE, DOS_DATE_1980_01_01);
  writeU32(view, LFH_OFF_CRC, central.crc);
  writeU32(view, LFH_OFF_COMPRESSED, central.compressedSize);
  writeU32(view, LFH_OFF_UNCOMPRESSED, central.uncompressedSize);
  writeU16(view, LFH_OFF_NAME_LEN, central.nameBytes.length);
  writeU16(view, LFH_OFF_EXTRA_LEN, 0);
  head.set(central.nameBytes, LOCAL_FIXED_SIZE);
  return head;
}

/** Build ONE central-directory record for the trailing directory. */
function centralHeader(central: PackedCentral): Uint8Array {
  const rec = new Uint8Array(CENTRAL_FIXED_SIZE + central.nameBytes.length);
  const view = new DataView(rec.buffer);
  writeU32(view, 0, SIG_CENTRAL);
  writeU16(view, CDH_OFF_VERSION_MADE, ZIP_VERSION);
  writeU16(view, CDH_OFF_VERSION_NEEDED, ZIP_VERSION);
  writeU16(view, CDH_OFF_FLAGS, GP_UTF8);
  writeU16(view, CDH_OFF_METHOD, central.method);
  writeU16(view, CDH_OFF_TIME, DOS_TIME_ZERO);
  writeU16(view, CDH_OFF_DATE, DOS_DATE_1980_01_01);
  writeU32(view, CDH_OFF_CRC, central.crc);
  writeU32(view, CDH_OFF_COMPRESSED, central.compressedSize);
  writeU32(view, CDH_OFF_UNCOMPRESSED, central.uncompressedSize);
  writeU16(view, CDH_OFF_NAME_LEN, central.nameBytes.length);
  writeU16(view, CDH_OFF_EXTRA_LEN, 0);
  writeU16(view, CDH_OFF_COMMENT_LEN, 0);
  writeU32(view, CDH_OFF_LOCAL_OFFSET, central.localOffset);
  rec.set(central.nameBytes, CENTRAL_FIXED_SIZE);
  return rec;
}

/** Build the End-Of-Central-Directory record. */
function eocdRecord(count: number, cdOffset: number, cdSize: number): Uint8Array {
  const rec = new Uint8Array(EOCD_MIN_SIZE);
  const view = new DataView(rec.buffer);
  writeU32(view, 0, SIG_EOCD);
  writeU16(view, EOCD_OFF_TOTAL_ENTRIES - U16_BYTES, count); // entries on this disk
  writeU16(view, EOCD_OFF_TOTAL_ENTRIES, count);
  writeU32(view, EOCD_OFF_CD_SIZE, cdSize);
  writeU32(view, EOCD_OFF_CD_OFFSET, cdOffset);
  return rec;
}

/** Compress one entry, emit its local header plus body, and record the central-directory entry. Returns the
 *  bytes advanced (the new running offset delta) so the caller can track local-header offsets. */
function emitEntry(
  controller: ReadableStreamDefaultController<Uint8Array>,
  entry: ZipEntry,
  localOffset: number,
  centrals: PackedCentral[],
): number {
  const nameBytes = new TextEncoder().encode(entry.path);
  const crc = crc32(entry.bytes) >>> 0;
  const deflated = deflateRawSync(entry.bytes);
  // STORE when deflate did not shrink the payload (already-compressed PNGs), else DEFLATE.
  const stored = deflated.length >= entry.bytes.length;
  const body = stored ? entry.bytes : deflated;
  const central: PackedCentral = {
    nameBytes,
    crc,
    compressedSize: body.length,
    uncompressedSize: entry.bytes.length,
    method: stored ? METHOD_STORE : METHOD_DEFLATE,
    localOffset,
  };
  const head = localHeader(central);
  controller.enqueue(head);
  controller.enqueue(body);
  centrals.push(central);
  return head.length + body.length;
}

/**
 * Pack files into a valid DEFLATE zip, streamed as a `ReadableStream` of `Uint8Array` (the Hono download
 * response body). One entry is compressed plus emitted at a time (bounded memory across a large library);
 * the central directory plus EOCD flush after the final entry. Deterministic — a fixed 1980 DOS timestamp.
 * This is the trusted OUTPUT side; the belts live on `extractZip`.
 */
export function packZip(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const centrals: PackedCentral[] = [];
  let offset = 0;
  const iterator = entries[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
      const next = await iterator.next();
      if (!next.done) {
        offset += emitEntry(controller, next.value, offset, centrals);
        return;
      }
      // Final flush: the central directory, then the EOCD.
      const cdOffset = offset;
      let cdSize = 0;
      for (const central of centrals) {
        const record = centralHeader(central);
        controller.enqueue(record);
        cdSize += record.length;
      }
      controller.enqueue(eocdRecord(centrals.length, cdOffset, cdSize));
      controller.close();
    },
    cancel(): void {
      // The caller stopped pulling (a cancelled download) — release the source iterator so any wrapped
      // async work (the entity's exportAll) can unwind. Cancellation is the core's job (the contract has no
      // signal); this is the pack-side half of "stop pulling the async iterator".
      void iterator.return?.(undefined);
    },
  });
}
