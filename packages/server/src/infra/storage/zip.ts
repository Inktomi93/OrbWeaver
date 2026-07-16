// biome-ignore-all lint/suspicious/noBitwiseOperators: a zip container is a byte format — little-endian
// header reads, general-purpose bit-flag masks, unsigned-32 coercions, and the CRC-32 are intrinsically
// shift/mask/xor (the same exemption the PNG card codec + the IP/CIDR math carry).

// Streaming zip codec (packZip for download, extractZip for upload). extractZip is the hostile-input
// boundary: buffers the compressed archive under a cap, parses the central directory (never the local
// headers, which a crafted archive can desync), validates each entry before inflating, then stages inflated bytes to disk.

import { constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync, inflateRawSync, constants as zlibConstants } from "node:zlib";

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

type ZipByteSource = Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

/** Thrown by `extractZip`; never carries file bytes, only the machine-auditable rejection cause. */
export class ZipRejectedError extends Error {
  readonly kind: ZipRejectKind;
  constructor(kind: ZipRejectKind, message: string, options?: ErrorOptions) {
    super(`zip rejected (${kind}): ${message}`, options);
    this.name = "ZipRejectedError";
    this.kind = kind;
  }
}

export interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** One entry recovered from an untrusted archive after the belt battery passed and it was staged to disk. */
export interface StagedEntry {
  readonly path: string;
  readonly read: () => Promise<Uint8Array>;
}

/** Result of a successful {@link extractZip}. Caller MUST `dispose()` in a try/finally to remove the staging dir. */
export interface StagedArchive {
  readonly entries: readonly StagedEntry[];
  readonly dispose: () => Promise<void>;
}

export interface ExtractOptions {
  readonly maxTotalBytes?: number;
  readonly maxEntryBytes?: number;
  readonly maxTotalDecompressedBytes?: number;
  readonly maxEntries?: number;
  readonly stagingRoot?: string;
}

// Every read is bounded — a crafted archive can point an offset past the buffer.
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

function findEocd(buf: Uint8Array): number {
  const minStart = Math.max(0, buf.length - EOCD_MIN_SIZE - EOCD_MAX_COMMENT);
  for (let at = buf.length - EOCD_MIN_SIZE; at >= minStart; at--) {
    if (u32(buf, at) === SIG_EOCD) {
      return at;
    }
  }
  throw new ZipRejectedError("malformed", "no end-of-central-directory record (not a zip)");
}

interface CentralDirLocation {
  readonly count: number;
  readonly cdOffset: number;
}

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

interface EntryLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
}

function parseCentralRecord(buf: Uint8Array, at: number, index: number, maxEntryBytes: number): { readonly record: CentralRecord; readonly nextAt: number } {
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
    throw new ZipRejectedError("too-large", `entry ${index} declares ${uncompressedSize} bytes, over the ${maxEntryBytes} per-entry cap`);
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

function readCentralDirectory(buf: Uint8Array, location: CentralDirLocation, limits: EntryLimits): CentralRecord[] {
  if (location.count > limits.maxEntries) {
    throw new ZipRejectedError("too-many-entries", `${location.count} entries exceeds the cap of ${limits.maxEntries}`);
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

// Data offset comes from the local header (its lengths can differ from the central copy); sizes always come from the already-validated central record.
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

function inflateEntry(buf: Uint8Array, rec: CentralRecord): Uint8Array {
  const compressed = locateData(buf, rec);
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
  if (crc32(out) >>> 0 !== rec.crc) {
    throw new ZipRejectedError("bomb", `entry ${rec.name} failed its CRC-32 integrity check`);
  }
  return out;
}

// zlib throws ERR_BUFFER_TOO_LARGE the instant output would exceed the declared size — maps to `bomb`; anything else is malformed.
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
          // biome-ignore lint/performance/noAwaitInLoops: draining a stream is inherently one awaited read per chunk.
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

async function bufferCapped(source: ZipByteSource, maxTotalBytes: number): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    if (source.length > maxTotalBytes) {
      throw new ZipRejectedError("too-large", `archive is ${source.length} bytes, over ${maxTotalBytes}`);
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

const STAGING_PREFIX = "orb-import-stage-";

// O_CREAT|O_EXCL|O_NOFOLLOW: never open an existing path, so a pre-planted symlink can't be followed or clobbered.
async function writeStaged(path: string, bytes: Uint8Array): Promise<void> {
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  const handle = await open(path, flags);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

async function readStaged(path: string): Promise<Uint8Array> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const data = await handle.readFile();
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    await handle.close();
  }
}

async function stageRecords(dir: string, buf: Uint8Array, records: readonly CentralRecord[], maxTotalDecompressedBytes: number): Promise<StagedEntry[]> {
  const entries: StagedEntry[] = [];
  let producedTotal = 0;
  for (const [i, rec] of records.entries()) {
    const bytes = inflateEntry(buf, rec);
    producedTotal += bytes.length;
    if (producedTotal > maxTotalDecompressedBytes) {
      throw new ZipRejectedError("bomb", `aggregate decompressed size exceeds ${maxTotalDecompressedBytes} bytes (amplification bomb)`);
    }
    // Staged filename is the entry INDEX, never the archive's own attacker-chosen path.
    const stagedPath = join(dir, String(i));
    // biome-ignore lint/performance/noAwaitInLoops: staging is inherently one awaited disk write per entry (and the whole point is to NOT hold the inflated bundle in memory).
    await writeStaged(stagedPath, bytes);
    entries.push({ path: rec.name, read: () => readStaged(stagedPath) });
  }
  return entries;
}

export async function extractZip(source: ZipByteSource, options?: ExtractOptions): Promise<StagedArchive> {
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntryBytes = options?.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalDecompressedBytes = options?.maxTotalDecompressedBytes ?? DEFAULT_MAX_TOTAL_DECOMPRESSED_BYTES;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const stagingRoot = options?.stagingRoot ?? tmpdir();

  const buf = await bufferCapped(source, maxTotalBytes);
  const eocdAt = findEocd(buf);
  const location = readEocd(buf, eocdAt);
  // Structural belts run here eagerly, before a single byte is inflated (fail-closed).
  const records = readCentralDirectory(buf, location, { maxEntries, maxEntryBytes });

  await mkdir(stagingRoot, { recursive: true });
  const dir = await mkdtemp(join(stagingRoot, STAGING_PREFIX));
  const dispose = (): Promise<void> => rm(dir, { recursive: true, force: true });
  try {
    const entries = await stageRecords(dir, buf, records, maxTotalDecompressedBytes);
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
  view.setUint16(at, value & U16_MAX, true);
}

function writeU32(view: DataView, at: number, value: number): void {
  view.setUint32(at, value >>> 0, true);
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
  const nameBytes = new TextEncoder().encode(entry.path);
  const crc = crc32(entry.bytes) >>> 0;
  const deflated = deflateRawSync(entry.bytes);
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

export function packZip(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const centrals: PackedCentral[] = [];
  let offset = 0;
  const iterator = entries[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
      const next = await iterator.next();
      if (next.done !== true) {
        offset += emitEntry(controller, next.value, offset, centrals);
        return;
      }
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
      void iterator.return?.(undefined);
    },
  });
}
