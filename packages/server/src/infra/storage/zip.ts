// Streaming zip codec (packZip for download, extractZip for upload). extractZip is the hostile-input
// boundary: reads a staged archive by position (or a memory/stream source held whole) under a cap, parses the
// central directory (never the local headers, which a crafted archive can desync), validates each entry before
// inflating, then stages inflated bytes to disk.

import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync, inflateRawSync, constants as zlibConstants } from "node:zlib";
import type { Logger } from "#foundation/observability";
import { createDetachedSupervision } from "#foundation/observability";
import type { ExtractOptions, StagedArchive, StagedEntry, ZipEntry, ZipSource } from "./contract.ts";

const SIG_LOCAL = 0x04_03_4b_50;
const SIG_CENTRAL = 0x02_01_4b_50;
const SIG_EOCD = 0x06_05_4b_50;

const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT = 0xff_ff;
const CENTRAL_FIXED_SIZE = 46;
const LOCAL_FIXED_SIZE = 30;

const EOCD_OFF_TOTAL_ENTRIES = 10;
const EOCD_OFF_CD_SIZE = 12;
const EOCD_OFF_CD_OFFSET = 16;

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

const U16_BYTES = 2;
const U32_BYTES = 4;
const ZIP_VERSION = 20;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const GP_ENCRYPTED = 0x00_01;
const GP_UTF8 = 0x08_00;

const U32_MAX = 0xff_ff_ff_ff;
const U16_MAX = 0xff_ff;

const DOS_DATE_1980_01_01 = 0x00_21;
const DOS_TIME_ZERO = 0x00_00;

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const MAX_ENTRY_MIB = 64;
const MAX_TOTAL_MIB = 512;
// Aggregate decompressed disk cap: per-entry + total-compressed caps don't bound the SUM across many
// highly-compressible entries, so this sums produced bytes and aborts staging the instant it's exceeded.
const MAX_TOTAL_DECOMPRESSED_MIB = 1024;
const DEFAULT_MAX_ENTRY_BYTES = MAX_ENTRY_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_TOTAL_BYTES = MAX_TOTAL_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_TOTAL_DECOMPRESSED_BYTES = MAX_TOTAL_DECOMPRESSED_MIB * BYTES_PER_MIB;
const DEFAULT_MAX_ENTRIES = 50_000;

const DRIVE_LETTER = /^[a-zA-Z]:/;

const ZIP_REJECT_KINDS = ["too-large", "too-many-entries", "bad-method", "zip-slip", "bomb", "unsupported", "malformed"] as const;

type ZipRejectKind = (typeof ZIP_REJECT_KINDS)[number];

/** Thrown by `extractZip`; never carries file bytes, only the machine-auditable rejection cause. */
class ZipRejectedError extends Error {
  readonly kind: ZipRejectKind;
  constructor(kind: ZipRejectKind, message: string, options?: ErrorOptions) {
    super(`zip rejected (${kind}): ${message}`, options);
    this.name = "ZipRejectedError";
    this.kind = kind;
  }
}

/** Random access over the archive. Every parse step reads only the bytes it needs, so a staged file is never
 *  loaded whole and a crafted offset past the end is a rejection, never a read beyond the archive. */
interface ArchiveReader {
  readonly size: number;
  readonly read: (at: number, length: number) => Promise<Uint8Array>;
}

function assertInArchive(size: number, at: number, length: number): void {
  if (at < 0 || length < 0 || at + length > size) {
    throw new ZipRejectedError("malformed", "read past end of archive");
  }
}

function memoryReader(buf: Uint8Array): ArchiveReader {
  return {
    size: buf.length,
    read: (at, length): Promise<Uint8Array> => {
      assertInArchive(buf.length, at, length);
      return Promise.resolve(buf.subarray(at, at + length));
    },
  };
}

async function fileReader(handle: FileHandle, maxTotalBytes: number): Promise<ArchiveReader> {
  const { size } = await handle.stat();
  if (size > maxTotalBytes) {
    throw new ZipRejectedError("too-large", `archive is ${size} bytes, over ${maxTotalBytes}`);
  }
  return {
    size,
    read: async (at, length): Promise<Uint8Array> => {
      assertInArchive(size, at, length);
      const out = new Uint8Array(length);
      let filled = 0;
      while (filled < length) {
        const { bytesRead } = await handle.read(out, filled, length - filled, at + filled);
        if (bytesRead === 0) {
          throw new ZipRejectedError("malformed", "archive ended before its declared size");
        }
        filled += bytesRead;
      }
      return out;
    },
  };
}

/** A staged file is read by position under the cap; memory and stream sources are held whole under it. */
async function openArchive(source: ZipSource, maxTotalBytes: number): Promise<ArchiveReader> {
  if (source instanceof Uint8Array) {
    if (source.length > maxTotalBytes) {
      throw new ZipRejectedError("too-large", `archive is ${source.length} bytes, over ${maxTotalBytes}`);
    }
    return memoryReader(source);
  }
  // A Node read stream carries an `fd` too, so a stream is told apart by being iterable, never by its descriptor.
  if ("getReader" in source || Symbol.asyncIterator in source) {
    return memoryReader(await bufferCapped(source, maxTotalBytes));
  }
  return await fileReader(source, maxTotalBytes);
}

// Every header read is bounded — a crafted archive can point an offset past the buffer.
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

// Zip-slip guard: rejects absolute, drive-lettered, backslashed, NUL-bearing, or parent-dir-traversing names.
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

interface CentralRecord {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
}

interface CentralDirLocation {
  readonly count: number;
  readonly cdOffset: number;
}

/** The end-of-central-directory record sits within the archive's last 22 bytes plus its comment. */
async function readEocd(archive: ArchiveReader): Promise<CentralDirLocation> {
  const tailLength = Math.min(archive.size, EOCD_MIN_SIZE + EOCD_MAX_COMMENT);
  const tail = await archive.read(archive.size - tailLength, tailLength);
  let eocdAt = -1;
  for (let at = tail.length - EOCD_MIN_SIZE; at >= 0; at--) {
    if (u32(tail, at) === SIG_EOCD) {
      eocdAt = at;
      break;
    }
  }
  if (eocdAt === -1) {
    throw new ZipRejectedError("malformed", "no end-of-central-directory record (not a zip)");
  }
  const count = u16(tail, eocdAt + EOCD_OFF_TOTAL_ENTRIES);
  const cdSize = u32(tail, eocdAt + EOCD_OFF_CD_SIZE);
  const cdOffset = u32(tail, eocdAt + EOCD_OFF_CD_OFFSET);
  if (count === U16_MAX || cdOffset === U32_MAX || cdSize === U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 archive is not supported");
  }
  if (cdOffset + cdSize > archive.size) {
    throw new ZipRejectedError("malformed", "central directory extends past the archive");
  }
  return { count, cdOffset };
}

// zlib's conservative `deflateBound` for any windowBits/memLevel/strategy is the larger of two forms: fixed blocks
// with 9-bit literals, U + U/8 + U/256 + U/512 + 4 (about 13%), and 127-byte stored blocks at memLevel 1,
// U + U/32 + U/128 + U/2048 + 7 (about 4%). This bound, U + U/8 + U/64 + 16 (about 14%), sits above both; the
// default-parameter bound (about 0.1%) would refuse an honest low-memLevel archive. A record claiming more is a size lie, refused before its compressed bytes are
// read, so one entry never costs more memory than this multiple of its declared output. The slack also covers
// the 2-byte stream an empty entry deflates to.
const DEFLATE_BOUND_EIGHTH = 8;
const DEFLATE_BOUND_64TH = 64;
const DEFLATE_BOUND_SLACK = 16;

function maxDeflatedBytes(uncompressedSize: number): number {
  return uncompressedSize + Math.ceil(uncompressedSize / DEFLATE_BOUND_EIGHTH) + Math.ceil(uncompressedSize / DEFLATE_BOUND_64TH) + DEFLATE_BOUND_SLACK;
}

interface EntryLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
}

async function parseCentralRecord(
  archive: ArchiveReader,
  at: number,
  index: number,
  maxEntryBytes: number,
): Promise<{ readonly record: CentralRecord; readonly nextAt: number }> {
  const buf = await archive.read(at, CENTRAL_FIXED_SIZE);
  if (u32(buf, 0) !== SIG_CENTRAL) {
    throw new ZipRejectedError("malformed", `central directory entry ${index} has a bad signature`);
  }
  const flags = u16(buf, CDH_OFF_FLAGS);
  const method = u16(buf, CDH_OFF_METHOD);
  const crc = u32(buf, CDH_OFF_CRC);
  const compressedSize = u32(buf, CDH_OFF_COMPRESSED);
  const uncompressedSize = u32(buf, CDH_OFF_UNCOMPRESSED);
  const nameLen = u16(buf, CDH_OFF_NAME_LEN);
  const extraLen = u16(buf, CDH_OFF_EXTRA_LEN);
  const commentLen = u16(buf, CDH_OFF_COMMENT_LEN);
  const localOffset = u32(buf, CDH_OFF_LOCAL_OFFSET);

  if (compressedSize === U32_MAX || uncompressedSize === U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 entry size is not supported");
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).
  if ((flags & GP_ENCRYPTED) !== 0) {
    throw new ZipRejectedError("bad-method", `entry ${index} is encrypted`);
  }
  if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
    throw new ZipRejectedError("bad-method", `entry ${index} uses compression method ${method}`);
  }
  if (uncompressedSize > maxEntryBytes) {
    throw new ZipRejectedError("too-large", `entry ${index} declares ${uncompressedSize} bytes, over the ${maxEntryBytes} per-entry cap`);
  }
  if (compressedSize > maxDeflatedBytes(uncompressedSize)) {
    throw new ZipRejectedError("malformed", `entry ${index} declares ${compressedSize} compressed bytes, more than any encoder writes for ${uncompressedSize}`);
  }
  const nameAt = at + CENTRAL_FIXED_SIZE;
  if (nameAt + nameLen > archive.size) {
    throw new ZipRejectedError("malformed", `entry ${index} name extends past the archive`);
  }
  const name = new TextDecoder("utf-8").decode(await archive.read(nameAt, nameLen));
  assertSafeName(name);
  return {
    record: { name, method, crc, compressedSize, uncompressedSize, localOffset },
    nextAt: nameAt + nameLen + extraLen + commentLen,
  };
}

async function readCentralDirectory(archive: ArchiveReader, location: CentralDirLocation, limits: EntryLimits): Promise<CentralRecord[]> {
  if (location.count > limits.maxEntries) {
    throw new ZipRejectedError("too-many-entries", `${location.count} entries exceeds the cap of ${limits.maxEntries}`);
  }
  const records: CentralRecord[] = [];
  let at = location.cdOffset;
  for (let i = 0; i < location.count; i++) {
    // Each record's length is in its own fixed header, so the walk is sequential by construction.
    const { record, nextAt } = await parseCentralRecord(archive, at, i, limits.maxEntryBytes);
    records.push(record);
    at = nextAt;
  }
  return records;
}

// Data offset comes from the local header (its lengths can differ from the central copy); sizes always come from the already-validated central record.
async function locateData(archive: ArchiveReader, rec: CentralRecord): Promise<Uint8Array> {
  const head = await archive.read(rec.localOffset, LOCAL_FIXED_SIZE);
  if (u32(head, 0) !== SIG_LOCAL) {
    throw new ZipRejectedError("malformed", `entry ${rec.name} has no local header`);
  }
  const nameLen = u16(head, LFH_OFF_NAME_LEN);
  const extraLen = u16(head, LFH_OFF_EXTRA_LEN);
  const dataAt = rec.localOffset + LOCAL_FIXED_SIZE + nameLen + extraLen;
  const dataEnd = dataAt + rec.compressedSize;
  if (dataEnd > archive.size) {
    throw new ZipRejectedError("malformed", `entry ${rec.name} data extends past the archive`);
  }
  return await archive.read(dataAt, rec.compressedSize);
}

async function inflateEntry(archive: ArchiveReader, rec: CentralRecord): Promise<Uint8Array> {
  const compressed = await locateData(archive, rec);
  let out: Uint8Array;
  if (rec.method === METHOD_STORE) {
    if (rec.compressedSize !== rec.uncompressedSize) {
      throw new ZipRejectedError("bomb", `stored entry ${rec.name} declares mismatched sizes`);
    }
    // Copy out of the shared archive buffer so the yielded bytes don't alias (and pin) the whole archive.
    out = compressed.slice();
  } else {
    out = inflateWithCap(compressed, rec);
  }
  if (out.length !== rec.uncompressedSize) {
    throw new ZipRejectedError("bomb", `entry ${rec.name} produced ${out.length} bytes, declared ${rec.uncompressedSize}`);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).
  if (crc32(out) >>> 0 !== rec.crc) {
    throw new ZipRejectedError("bomb", `entry ${rec.name} failed its CRC-32 integrity check`);
  }
  return out;
}

// zlib throws ERR_BUFFER_TOO_LARGE the instant output would exceed the declared size — maps to `bomb`; anything else is malformed.
function inflateWithCap(compressed: Uint8Array, rec: CentralRecord): Uint8Array {
  try {
    return inflateRawSync(compressed, {
      // zlib rejects a zero output cap outright, so an empty entry (the 2-byte stream Java writes) gets one
      // byte of room; any byte it really produces fails the declared-size check after this call.
      maxOutputLength: Math.max(rec.uncompressedSize, 1),
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

function toAsyncIterable(source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  // Discriminate on getReader (ReadableStream-only) — a Symbol.asyncIterator guard would collapse the else branch to never.
  if (!("getReader" in source)) {
    return source;
  }
  const stream = source;
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

async function bufferCapped(source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>, maxTotalBytes: number): Promise<Uint8Array> {
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

const STAGING_PREFIX = "orb-import-stage-";

// O_CREAT|O_EXCL|O_NOFOLLOW: never open an existing path, so a pre-planted symlink can't be followed or clobbered.
async function writeStaged(path: string, bytes: Uint8Array): Promise<void> {
  // biome-ignore lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  const handle = await open(path, flags);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

async function readStaged(path: string): Promise<Uint8Array> {
  // biome-ignore lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const data = await handle.readFile();
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    await handle.close();
  }
}

async function stageRecords(dir: string, archive: ArchiveReader, records: readonly CentralRecord[], maxTotalDecompressedBytes: number): Promise<StagedEntry[]> {
  const entries: StagedEntry[] = [];
  let producedTotal = 0;
  for (const [i, rec] of records.entries()) {
    const bytes = await inflateEntry(archive, rec);
    producedTotal += bytes.length;
    if (producedTotal > maxTotalDecompressedBytes) {
      throw new ZipRejectedError("bomb", `aggregate decompressed size exceeds ${maxTotalDecompressedBytes} bytes (amplification bomb)`);
    }
    // Staged filename is the entry INDEX, never the archive's own attacker-chosen path.
    const stagedPath = join(dir, String(i));
    await writeStaged(stagedPath, bytes);
    entries.push({ path: rec.name, read: () => readStaged(stagedPath) });
  }
  return entries;
}

/** Validate and stage an untrusted archive. A staged file handle stays its caller's to close. */
export async function extractZip(source: ZipSource, options?: ExtractOptions): Promise<StagedArchive> {
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntryBytes = options?.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalDecompressedBytes = options?.maxTotalDecompressedBytes ?? DEFAULT_MAX_TOTAL_DECOMPRESSED_BYTES;
  const maxEntries = Math.min(options?.maxEntries ?? DEFAULT_MAX_ENTRIES, DEFAULT_MAX_ENTRIES);
  const stagingRoot = options?.stagingRoot ?? tmpdir();

  const archive = await openArchive(source, maxTotalBytes);
  const location = await readEocd(archive);
  // Structural belts run here eagerly, before a single byte is inflated (fail-closed).
  const records = await readCentralDirectory(archive, location, { maxEntries, maxEntryBytes });

  await mkdir(stagingRoot, { recursive: true });
  const dir = await mkdtemp(join(stagingRoot, STAGING_PREFIX));
  const dispose = (): Promise<void> => rm(dir, { recursive: true, force: true });
  try {
    const entries = await stageRecords(dir, archive, records, maxTotalDecompressedBytes);
    return { entries, dispose };
  } catch (err) {
    await dispose();
    throw err;
  }
}

interface PackedCentral {
  readonly nameBytes: Uint8Array;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly method: number;
  readonly localOffset: number;
}

function writeU16(view: DataView, at: number, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > U16_MAX) {
    throw new ZipRejectedError("unsupported", `value ${value} cannot be represented in a ZIP U16 field`);
  }
  view.setUint16(at, value, true);
}

function writeU32(view: DataView, at: number, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new ZipRejectedError("unsupported", `value ${value} cannot be represented in a ZIP U32 field`);
  }
  view.setUint32(at, value, true);
}

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

function emitEntry(controller: ReadableStreamDefaultController<Uint8Array>, entry: ZipEntry, localOffset: number, centrals: PackedCentral[]): number {
  assertSafeName(entry.path);
  const nameBytes = new TextEncoder().encode(entry.path);
  if (nameBytes.length > U16_MAX) {
    throw new ZipRejectedError("unsupported", `entry name is ${nameBytes.length} bytes, over the ZIP U16 limit of ${U16_MAX}`);
  }
  if (entry.bytes.length > DEFAULT_MAX_ENTRY_BYTES) {
    throw new ZipRejectedError("too-large", `entry ${entry.path} is ${entry.bytes.length} bytes, over the ${DEFAULT_MAX_ENTRY_BYTES} per-entry cap`);
  }
  if (entry.bytes.length >= U32_MAX || localOffset >= U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 entry sizes and offsets are not supported");
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).
  const crc = crc32(entry.bytes) >>> 0;
  const deflated = deflateRawSync(entry.bytes);
  const stored = deflated.length >= entry.bytes.length;
  const body = stored ? entry.bytes : deflated;
  if (body.length >= U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 compressed entry sizes are not supported");
  }
  const central: PackedCentral = {
    nameBytes,
    crc,
    compressedSize: body.length,
    uncompressedSize: entry.bytes.length,
    method: stored ? METHOD_STORE : METHOD_DEFLATE,
    localOffset,
  };
  const head = localHeader(central);
  if (localOffset + head.length + body.length >= U32_MAX) {
    throw new ZipRejectedError("unsupported", "ZIP64 archive offsets are not supported");
  }
  controller.enqueue(head);
  controller.enqueue(body);
  centrals.push(central);
  return head.length + body.length;
}

/** Stream `entries` as a zip; a cancelled iterator's failed return reports through the root's `log`. */
export function packZip(entries: AsyncIterable<ZipEntry>, log: Logger): ReadableStream<Uint8Array> {
  const { superviseDetached } = createDetachedSupervision(log);
  const centrals: PackedCentral[] = [];
  let offset = 0;
  const iterator = entries[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
      const next = await iterator.next();
      if (next.done !== true) {
        if (centrals.length >= DEFAULT_MAX_ENTRIES) {
          throw new ZipRejectedError("too-many-entries", `archive exceeds the cap of ${DEFAULT_MAX_ENTRIES} entries`);
        }
        offset += emitEntry(controller, next.value, offset, centrals);
        return;
      }
      const cdOffset = offset;
      let cdSize = 0;
      for (const central of centrals) {
        const record = centralHeader(central);
        if (cdSize + record.length >= U32_MAX || cdOffset + cdSize + record.length >= U32_MAX) {
          throw new ZipRejectedError("unsupported", "ZIP64 central-directory sizes and offsets are not supported");
        }
        cdSize += record.length;
        controller.enqueue(record);
      }
      controller.enqueue(eocdRecord(centrals.length, cdOffset, cdSize));
      controller.close();
    },
    cancel(): void {
      if (iterator.return !== undefined) {
        superviseDetached(`zip-stream:iterator-return:${randomUUID()}`, "zip.stream.cancel", {}, () => iterator.return?.(undefined));
      }
    },
  });
}
