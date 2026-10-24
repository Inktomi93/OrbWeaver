// The upload extractor reads an archive by position from a staged file and whole from memory; both sources
// stage the same entries and refuse the same hostile shapes, leaving nothing staged.
// @subject packages/server/src/infra/storage/zip.ts

import { createCipheriv } from "node:crypto";
import { mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { extractZip, packZip } from "@orb/server/infra/storage/zip";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { onTestFinished } from "vitest";

// Offsets into the records this build's writer emits: a 22-byte end record with no comment.
const EOCD_BYTES = 22;
const EOCD_CD_OFFSET_AT = 16;
const CENTRAL_COMPRESSED_AT = 20;
const CENTRAL_NAME_AT = 46;
const LOCAL_NAME_AT = 30;
/** Same length as the first entry's path, so a rename leaves every offset intact. */
const ESCAPING_PATH = "../es/entry.txt";
const REJECTION_KIND = /zip rejected \((?<kind>[a-z-]+)\)/u;
// The ZIP record layout (APPNOTE 4.3), for archives another writer produces.
const ZIP_LOCAL_SIGNATURE = 0x04_03_4b_50;
const ZIP_CENTRAL_SIGNATURE = 0x02_01_4b_50;
const ZIP_EOCD_SIGNATURE = 0x06_05_4b_50;
const ZIP_VERSION_AT = 4;
const ZIP_VERSION = 20;
const DEFLATE_METHOD = 8;
const LOCAL_METHOD_AT = 8;
const LOCAL_CRC_AT = 14;
const LOCAL_COMPRESSED_AT = 18;
const LOCAL_UNCOMPRESSED_AT = 22;
const LOCAL_NAME_LENGTH_AT = 26;
const CENTRAL_METHOD_AT = 10;
const CENTRAL_CRC_AT = 16;
const CENTRAL_UNCOMPRESSED_AT = 24;
const CENTRAL_NAME_LENGTH_AT = 28;
const CENTRAL_LOCAL_OFFSET_AT = 42;
const EOCD_DISK_ENTRIES_AT = 8;
const EOCD_TOTAL_ENTRIES_AT = 10;
const EOCD_CD_SIZE_AT = 12;
const KEYSTREAM_CIPHER = "aes-128-ctr";
const KEYSTREAM_KEY_BYTES = 16;
const LOW_MEMORY_SAMPLE_BYTES = 8 * 1024 * 1024;
/** The expansion the previous size-lie bound allowed: one byte per KiB. */
const OLD_BOUND_RATIO = 1 + 1 / 1024;
/** Past what any encoder writes for the second entry's 14 bytes, yet short of the archive's end after its data. */
const INFLATED_CLAIM = 100;

const ENTRIES = [
  { path: "notes/entry.txt", bytes: new TextEncoder().encode("The keeper's ledger.".repeat(64)) },
  { path: "notes/second.txt", bytes: new TextEncoder().encode("A second page.") },
] as const;

const SOURCES = ["memory", "staged file"] as const;
type Source = (typeof SOURCES)[number];

interface Extraction {
  readonly entries: readonly { readonly path: string; readonly bytes: readonly number[] }[] | null;
  /** The rejection kind, or null when the archive staged. */
  readonly refused: string | null;
  /** The rejection's whole message, or null when the archive staged. */
  readonly reason: string | null;
  /** Files left under the staging root once the extraction settled and was disposed. */
  readonly leftovers: number;
}

async function packed(): Promise<Uint8Array> {
  async function* entries(): AsyncIterable<{ readonly path: string; readonly bytes: Uint8Array }> {
    yield* ENTRIES;
  }
  return new Uint8Array(await new Response(packZip(entries(), createTestLogger(), null)).arrayBuffer());
}

async function stagedFiles(root: string): Promise<number> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).length;
}

/** Extract `archive` from the named source; a staged file is written to a scratch dir and opened read-only. */
async function extract(source: Source, archive: Uint8Array, maxTotalBytes?: number): Promise<Extraction> {
  const dir = await mkdtemp(join(tmpdir(), "orb-zip-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const stagingRoot = join(dir, "stage");
  const options = { stagingRoot, ...(maxTotalBytes === undefined ? {} : { maxTotalBytes }) };
  const upload = join(dir, "upload.zip");
  await writeFile(upload, archive);
  await using handle = await open(upload, "r");
  try {
    const staged = await extractZip(source === "memory" ? archive : handle, options);
    try {
      const entries = await Promise.all(staged.entries.map(async (entry) => ({ path: entry.path, bytes: Array.from(await entry.read()) })));
      return { entries, refused: null, reason: null, leftovers: 0 };
    } finally {
      await staged.dispose();
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { entries: null, refused: REJECTION_KIND.exec(reason)?.groups?.["kind"] ?? reason, reason, leftovers: await stagedFiles(stagingRoot) };
  }
}

function centralAt(archive: Uint8Array): number {
  return new DataView(archive.buffer).getUint32(archive.length - EOCD_BYTES + EOCD_CD_OFFSET_AT, true);
}

/** The second entry's central record follows the first's fixed header and name. */
function secondCentralAt(archive: Uint8Array): number {
  return centralAt(archive) + CENTRAL_NAME_AT + new TextEncoder().encode(ENTRIES[0].path).length;
}

/** The writer's archive with its first entry's name rewritten in both headers, as a hostile writer would. */
function renamed(archive: Uint8Array, name: string): Uint8Array {
  const out = archive.slice();
  const encoded = new TextEncoder().encode(name);
  out.set(encoded, LOCAL_NAME_AT);
  out.set(encoded, centralAt(out) + CENTRAL_NAME_AT);
  return out;
}

function withU32(archive: Uint8Array, at: number, value: number): Uint8Array {
  const out = archive.slice();
  new DataView(out.buffer).setUint32(at, value, true);
  return out;
}

test.each(SOURCES)("an archive read from %s stages exactly the entries the writer packed", async (source) => {
  expect(await extract(source, await packed())).toEqual({
    entries: ENTRIES.map((entry) => ({ path: entry.path, bytes: Array.from(entry.bytes) })),
    refused: null,
    reason: null,
    leftovers: 0,
  });
});

test.each(SOURCES)("a hostile archive read from %s is refused with its kind and leaves nothing staged", async (source) => {
  const archive = await packed();
  const cases = {
    truncated: extract(source, archive.subarray(0, archive.length - 1)),
    "central directory past the end": extract(source, withU32(archive, archive.length - EOCD_BYTES + EOCD_CD_OFFSET_AT, archive.length)),
    "a name that escapes the staging root": extract(source, renamed(archive, ESCAPING_PATH)),
    // The second entry's data is followed by the central directory, so the inflated claim still lies inside the
    // archive: only the size bound, not the end of the file, can refuse it before its bytes are read.
    "more compressed bytes than any encoder writes": extract(source, withU32(archive, secondCentralAt(archive) + CENTRAL_COMPRESSED_AT, INFLATED_CLAIM)),
    "over the total cap": extract(source, archive, archive.length - 1),
  };
  const outcomes: Record<string, Pick<Extraction, "refused" | "leftovers">> = {};
  for (const [name, settled] of Object.entries(cases)) {
    const { refused, leftovers } = await settled;
    outcomes[name] = { refused, leftovers };
  }

  expect(outcomes).toEqual({
    truncated: { refused: "malformed", leftovers: 0 },
    "central directory past the end": { refused: "malformed", leftovers: 0 },
    "a name that escapes the staging root": { refused: "zip-slip", leftovers: 0 },
    "more compressed bytes than any encoder writes": { refused: "malformed", leftovers: 0 },
    "over the total cap": { refused: "too-large", leftovers: 0 },
  });
  expect((await cases["more compressed bytes than any encoder writes"]).reason).toMatch(`declares ${String(INFLATED_CLAIM)} compressed bytes`);
});

interface ForeignEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  /** The deflate stream another writer produced for `bytes`. */
  readonly deflated: Uint8Array;
}

/** A single-disk archive as another writer lays it out: every entry deflated, whatever its size. This build's
 *  writer stores an entry that deflate cannot shrink, so these shapes only arrive from elsewhere. */
function foreignZip(entries: readonly ForeignEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(LOCAL_NAME_AT + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, ZIP_LOCAL_SIGNATURE, true);
    lv.setUint16(ZIP_VERSION_AT, ZIP_VERSION, true);
    lv.setUint16(LOCAL_METHOD_AT, DEFLATE_METHOD, true);
    lv.setUint32(LOCAL_CRC_AT, crc, true);
    lv.setUint32(LOCAL_COMPRESSED_AT, entry.deflated.length, true);
    lv.setUint32(LOCAL_UNCOMPRESSED_AT, entry.bytes.length, true);
    lv.setUint16(LOCAL_NAME_LENGTH_AT, name.length, true);
    local.set(name, LOCAL_NAME_AT);
    const central = new Uint8Array(CENTRAL_NAME_AT + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, ZIP_CENTRAL_SIGNATURE, true);
    cv.setUint16(CENTRAL_METHOD_AT, DEFLATE_METHOD, true);
    cv.setUint32(CENTRAL_CRC_AT, crc, true);
    cv.setUint32(CENTRAL_COMPRESSED_AT, entry.deflated.length, true);
    cv.setUint32(CENTRAL_UNCOMPRESSED_AT, entry.bytes.length, true);
    cv.setUint16(CENTRAL_NAME_LENGTH_AT, name.length, true);
    cv.setUint32(CENTRAL_LOCAL_OFFSET_AT, offset, true);
    central.set(name, CENTRAL_NAME_AT);
    parts.push(local, entry.deflated);
    centrals.push(central);
    offset += local.length + entry.deflated.length;
  }
  const centralSize = centrals.reduce((sum, central) => sum + central.length, 0);
  const eocd = new Uint8Array(EOCD_BYTES);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, ZIP_EOCD_SIGNATURE, true);
  ev.setUint16(EOCD_DISK_ENTRIES_AT, entries.length, true);
  ev.setUint16(EOCD_TOTAL_ENTRIES_AT, entries.length, true);
  ev.setUint32(EOCD_CD_SIZE_AT, centralSize, true);
  ev.setUint32(EOCD_CD_OFFSET_AT, offset, true);
  const out = new Uint8Array(offset + centralSize + EOCD_BYTES);
  let at = 0;
  for (const part of [...parts, ...centrals, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Bytes deflate cannot shrink, the same every run: an AES-CTR keystream under a fixed key. */
function incompressible(size: number): Uint8Array {
  return new Uint8Array(
    createCipheriv(KEYSTREAM_CIPHER, new Uint8Array(KEYSTREAM_KEY_BYTES), new Uint8Array(KEYSTREAM_KEY_BYTES)).update(new Uint8Array(size)),
  );
}

test("a staged archive from a low-memory deflate writer, which expands what it cannot shrink, stages its entry", async () => {
  const random = incompressible(LOW_MEMORY_SAMPLE_BYTES);
  // memLevel 1 trades ratio for memory; on bytes it cannot shrink it writes about 4% more than it read.
  const lowMemory = { path: "notes/low-memory.bin", bytes: random, deflated: new Uint8Array(deflateRawSync(random, { memLevel: 1 })) };
  // Positive control: the fixture really expands, past the 0.1% bound this build used to apply.
  expect(lowMemory.deflated.length / random.length).toBeGreaterThan(OLD_BOUND_RATIO);

  const outcome = await extract("staged file", foreignZip([lowMemory]));

  expect(outcome.refused).toBeNull();
  expect(Buffer.compare(Buffer.from(outcome.entries?.[0]?.bytes ?? []), Buffer.from(random))).toBe(0);
});

test("a staged archive whose writer deflated an empty file stages it empty", async () => {
  // The 2-byte empty stream a Java ZipOutputStream writes for a zero-byte file.
  const empty = { path: "notes/empty.txt", bytes: new Uint8Array(0), deflated: new Uint8Array(deflateRawSync(new Uint8Array(0))) };

  const outcome = await extract("staged file", foreignZip([empty]));

  expect({ refused: outcome.refused, entries: outcome.entries }).toEqual({ refused: null, entries: [{ path: empty.path, bytes: [] }] });
});
