// biome-ignore-all lint/suspicious/noBitwiseOperators: the adversarial fixtures craft zip bytes by hand
// (CRC-32 unsigned coercion + a payload-byte flip) — intrinsically bitwise, like the impl under test.

// infra/storage/zip — the untrusted-archive belt battery + the pack/extract round-trip (the security
// integration lane for the portability delivery core, export-import-portability.md §3). The happy-path
// tests pin that packZip → extractZip round-trips bytes + paths; the ADVERSARIAL tests hand-craft each
// attack (zip-slip, zip-bomb ratio, lying header, disallowed method, ZIP64, oversize, encrypted, too many
// entries) and assert the whole archive is REJECTED with the right cause — never a partial extraction.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";
import type { ExtractOptions, StagedArchive, ZipEntry } from "@orb/server/infra/storage";
import { extractZip, packZip } from "@orb/server/infra/storage";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const enc = new TextEncoder();

// A test async-iterable adapter — packZip's contract consumes an AsyncIterable.
// biome-ignore lint/suspicious/useAwait: the adapter yields synchronously; the async-iterable shape is the contract.
async function* asAsync(entries: readonly ZipEntry[]): AsyncGenerator<ZipEntry> {
  yield* entries;
}

/** Drive packZip's `ReadableStream` to one buffer. */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: draining a stream is one awaited read per chunk.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function packToBuffer(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  return drainStream(packZip(asAsync(entries)));
}

/** A staged entry read fully into memory — the shape every test asserts on directly. */
interface Extracted {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Read a staged archive fully into memory (path + bytes off the staging disk). */
async function collect(staged: StagedArchive): Promise<Extracted[]> {
  const out: Extracted[] = [];
  for (const entry of staged.entries) {
    // biome-ignore lint/performance/noAwaitInLoops: the test reads each staged entry off disk in turn (the prod driver does the same, one at a time — never the whole bundle in memory).
    out.push({ path: entry.path, bytes: await entry.read() });
  }
  return out;
}

/** The bytes of the i-th extracted entry, asserting it exists (keeps `noUncheckedIndexedAccess` honest). */
function bytesAt(entries: readonly Extracted[], i: number): Uint8Array {
  const entry = entries[i];
  if (entry === undefined) {
    throw new Error(`no extracted entry at index ${i}`);
  }
  return new Uint8Array(entry.bytes);
}

/** Extract fully to a resolved array (or a rejected promise), disposing the staging dir afterwards — the
 *  shape every test asserts on directly. A hostile archive rejects at `extractZip` (already self-cleaned). */
async function extractAll(
  archive: Uint8Array | ReadableStream<Uint8Array>,
  options?: ExtractOptions,
): Promise<Extracted[]> {
  const staged = await extractZip(archive, options);
  try {
    return await collect(staged);
  } finally {
    await staged.dispose();
  }
}

// ── A hand-built single-entry zip so the adversarial tests can poison ONE field at a time ───────────────
const SIG_LOCAL = 0x04_03_4b_50;
const SIG_CENTRAL = 0x02_01_4b_50;
const SIG_EOCD = 0x06_05_4b_50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const LFH_SIZE = 30;
const CDH_SIZE = 46;
const EOCD_SIZE = 22;
const ZIP_VERSION = 20;
const ZIP64_SENTINEL = 0xff_ff_ff_ff;
const BYTE_MASK = 0xff;

/** Everything a crafted single-entry archive can lie about. */
interface CraftSpec {
  readonly name: string;
  readonly method: number;
  readonly body: Uint8Array;
  readonly declaredCompressed: number;
  readonly declaredUncompressed: number;
  readonly crc: number;
  readonly flags?: number;
  readonly zip64Sizes?: boolean;
}

function crcOf(bytes: Uint8Array): number {
  return crc32(bytes) >>> 0;
}

/** Assemble a one-entry archive (local header + body + central directory + EOCD) with fully controllable
 *  header fields, so each adversarial test flips exactly one belt input. */
function craft(spec: CraftSpec): Uint8Array {
  const nameBytes = enc.encode(spec.name);
  const flags = spec.flags ?? 0;
  const sizeField = spec.zip64Sizes ? ZIP64_SENTINEL : undefined;

  const local = new Uint8Array(LFH_SIZE + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, SIG_LOCAL, true);
  lv.setUint16(4, ZIP_VERSION, true);
  lv.setUint16(6, flags, true);
  lv.setUint16(8, spec.method, true);
  lv.setUint32(14, spec.crc, true);
  lv.setUint32(18, sizeField ?? spec.declaredCompressed, true);
  lv.setUint32(22, sizeField ?? spec.declaredUncompressed, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, LFH_SIZE);

  const central = new Uint8Array(CDH_SIZE + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, SIG_CENTRAL, true);
  cv.setUint16(8, flags, true);
  cv.setUint16(10, spec.method, true);
  cv.setUint32(16, spec.crc, true);
  cv.setUint32(20, sizeField ?? spec.declaredCompressed, true);
  cv.setUint32(24, sizeField ?? spec.declaredUncompressed, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, CDH_SIZE);

  const bodyOffset = local.length;
  const cdOffset = bodyOffset + spec.body.length;

  const eocd = new Uint8Array(EOCD_SIZE);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, cdOffset, true);

  const out = new Uint8Array(local.length + spec.body.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(spec.body, bodyOffset);
  out.set(central, cdOffset);
  out.set(eocd, cdOffset + central.length);
  return out;
}

/** A well-formed stored single-entry archive from a payload (the honest baseline the poison tests mutate). */
function storedArchive(name: string, payload: Uint8Array): Uint8Array {
  return craft({
    name,
    method: METHOD_STORE,
    body: payload,
    declaredCompressed: payload.length,
    declaredUncompressed: payload.length,
    crc: crcOf(payload),
  });
}

const REJECTED = { name: "ZipRejectedError" } as const;

describe("packZip → extractZip round-trip", () => {
  test("round-trips bytes + paths for multiple entries", async () => {
    const entries: ZipEntry[] = [
      { path: "characters/Aria.png", bytes: enc.encode("PNG-ish card bytes for Aria") },
      { path: "chats/story.jsonl", bytes: enc.encode('{"role":"user"}\n{"role":"assistant"}\n') },
      { path: "presets/creative.json", bytes: enc.encode('{"temperature":0.9}') },
    ];
    const got = await extractAll(await packToBuffer(entries));
    expect(got.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    expect(got.map((e) => new Uint8Array(e.bytes))).toEqual(entries.map((e) => e.bytes));
  });

  test("round-trips an empty-file entry and a highly-compressible entry", async () => {
    const big = enc.encode("A".repeat(100_000));
    const entries: ZipEntry[] = [
      { path: "tags/empty.json", bytes: new Uint8Array(0) },
      { path: "world-info/big.json", bytes: big },
    ];
    const got = await extractAll(await packToBuffer(entries));
    expect(got).toHaveLength(2);
    expect(bytesAt(got, 0)).toEqual(new Uint8Array(0));
    expect(bytesAt(got, 1)).toEqual(big);
  });

  test("an accepted honest crafted store archive extracts its payload", async () => {
    const payload = enc.encode("honest world-info book");
    const got = await extractAll(storedArchive("world-info/book.json", payload));
    expect(got).toHaveLength(1);
    expect(bytesAt(got, 0)).toEqual(payload);
  });
});

describe("zip-slip guard rejects hostile names", () => {
  const payload = enc.encode("x");
  const cases: readonly string[] = [
    "../escape.json",
    "characters/../../etc/passwd",
    "/etc/passwd",
    "C:\\windows\\system32\\evil.dll",
    "a\\b\\traverse",
    "..",
  ];
  for (const name of cases) {
    test(`rejects "${name}"`, async () => {
      await expect(extractAll(storedArchive(name, payload))).rejects.toMatchObject({
        ...REJECTED,
        kind: "zip-slip",
      });
    });
  }

  test("rejects an entry name carrying a NUL byte", async () => {
    await expect(extractAll(storedArchive("safe\0/../evil", payload))).rejects.toMatchObject({
      kind: "zip-slip",
    });
  });
});

describe("zip-bomb + lying-header guards", () => {
  test("rejects a DEFLATE entry that inflates beyond its declared uncompressed size (lying header)", async () => {
    const realPayload = new Uint8Array(1024 * 1024); // all zeros — deflates tiny (the classic bomb ratio)
    const compressed = deflateRawSync(realPayload);
    const archive = craft({
      name: "characters/bomb.png",
      method: METHOD_DEFLATE,
      body: compressed,
      declaredCompressed: compressed.length,
      declaredUncompressed: 10,
      crc: crcOf(realPayload),
    });
    await expect(extractAll(archive)).rejects.toMatchObject({ ...REJECTED, kind: "bomb" });
  });

  test("rejects a STORE entry whose declared sizes disagree", async () => {
    const payload = enc.encode("twelve bytes");
    const archive = craft({
      name: "presets/x.json",
      method: METHOD_STORE,
      body: payload,
      declaredCompressed: payload.length,
      declaredUncompressed: payload.length + 999,
      crc: crcOf(payload),
    });
    await expect(extractAll(archive)).rejects.toMatchObject({ kind: "bomb" });
  });

  test("rejects a per-entry declared size over the maxEntryBytes cap BEFORE inflating", async () => {
    const payload = enc.encode("small");
    const archive = storedArchive("presets/huge.json", payload);
    await expect(extractAll(archive, { maxEntryBytes: 4 })).rejects.toMatchObject({
      kind: "too-large",
    });
  });

  test("rejects an AGGREGATE decompression bomb — many entries under the per-entry cap whose SUM exceeds the total", async () => {
    // The amplification attack: EVERY entry passes the per-entry declared-size belt and the whole archive
    // passes the compressed-total belt, but their decompressed SUM blows past the aggregate cap. Each entry
    // is 64 KiB of zeros (deflates to ~70 bytes — ~900x), so 40 entries ≈ 2.6 MiB decompressed from a tiny
    // archive. With a 1 MiB aggregate cap the extraction must abort mid-stream (belt 8), not after.
    const entries: ZipEntry[] = [];
    for (let i = 0; i < 40; i++) {
      entries.push({ path: `characters/zeros-${i}.png`, bytes: new Uint8Array(64 * 1024) });
    }
    const archive = await packToBuffer(entries);
    await expect(
      extractAll(archive, { maxTotalDecompressedBytes: 1024 * 1024 }),
    ).rejects.toMatchObject({ ...REJECTED, kind: "bomb" });
  });

  test("accepts entries whose SUM is under the aggregate cap", async () => {
    const entries: ZipEntry[] = [
      { path: "characters/a.png", bytes: new Uint8Array(400 * 1024) },
      { path: "characters/b.png", bytes: new Uint8Array(400 * 1024) },
    ];
    const archive = await packToBuffer(entries);
    const got = await extractAll(archive, { maxTotalDecompressedBytes: 1024 * 1024 });
    expect(got).toHaveLength(2);
  });

  test("rejects a tampered-body CRC mismatch", async () => {
    const payload = enc.encode("integrity matters");
    const archive = storedArchive("chats/c.jsonl", payload);
    const bodyAt = LFH_SIZE + enc.encode("chats/c.jsonl").length;
    archive[bodyAt] = (archive[bodyAt] ?? 0) ^ BYTE_MASK;
    await expect(extractAll(archive)).rejects.toMatchObject({ kind: "bomb" });
  });
});

describe("method + structure guards", () => {
  test("rejects a disallowed compression method (bzip2 = 12)", async () => {
    const payload = enc.encode("data");
    const archive = craft({
      name: "x.json",
      method: 12,
      body: payload,
      declaredCompressed: payload.length,
      declaredUncompressed: payload.length,
      crc: crcOf(payload),
    });
    await expect(extractAll(archive)).rejects.toMatchObject({ ...REJECTED, kind: "bad-method" });
  });

  test("rejects an encrypted entry (general-purpose bit 0)", async () => {
    const payload = enc.encode("secret");
    const archive = craft({
      name: "x.json",
      method: METHOD_STORE,
      body: payload,
      declaredCompressed: payload.length,
      declaredUncompressed: payload.length,
      crc: crcOf(payload),
      flags: 0x00_01,
    });
    await expect(extractAll(archive)).rejects.toMatchObject({ kind: "bad-method" });
  });

  test("rejects a ZIP64 sentinel size", async () => {
    const payload = enc.encode("z64");
    const archive = craft({
      name: "x.json",
      method: METHOD_STORE,
      body: payload,
      declaredCompressed: payload.length,
      declaredUncompressed: payload.length,
      crc: crcOf(payload),
      zip64Sizes: true,
    });
    await expect(extractAll(archive)).rejects.toMatchObject({ kind: "unsupported" });
  });

  test("rejects bytes that are not a zip at all", async () => {
    await expect(extractAll(gzipSync(enc.encode("i am a gzip, not a zip")))).rejects.toMatchObject({
      kind: "malformed",
    });
  });
});

describe("DoS caps", () => {
  test("rejects an archive over the total buffered cap (aborts mid-read of the chunk stream)", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 100; i++) {
          controller.enqueue(new Uint8Array(1024));
        }
        controller.close();
      },
    });
    await expect(extractAll(stream, { maxTotalBytes: 2048 })).rejects.toMatchObject({
      kind: "too-large",
    });
  });

  test("rejects an archive declaring more entries than the maxEntries cap", async () => {
    const archive = await packToBuffer([
      { path: "a/1.json", bytes: enc.encode("1") },
      { path: "a/2.json", bytes: enc.encode("2") },
      { path: "a/3.json", bytes: enc.encode("3") },
    ]);
    await expect(extractAll(archive, { maxEntries: 2 })).rejects.toMatchObject({
      kind: "too-many-entries",
    });
  });
});

const STAGING_PREFIX = "orb-import-stage-";

/** The per-call staging subdirs currently present under a controlled root. */
async function stagingSubdirs(root: string): Promise<string[]> {
  return (await readdir(root)).filter((n) => n.startsWith(STAGING_PREFIX));
}

describe("disk staging + cleanup", () => {
  test("stages decompressed entries to disk under the controlled root; dispose() removes the dir (idempotent)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ziptest-"));
    try {
      const entries: ZipEntry[] = [
        { path: "characters/Aria.png", bytes: enc.encode("aria card bytes") },
        { path: "presets/x.json", bytes: enc.encode("{}") },
      ];
      const staged = await extractZip(await packToBuffer(entries), { stagingRoot: root });
      // A staging subdir exists on disk while the archive is live (the bytes are staged, not held in RAM).
      expect(await stagingSubdirs(root)).toHaveLength(1);
      const got = await collect(staged);
      expect(got.map((e) => e.path)).toEqual(entries.map((e) => e.path));
      expect(bytesAt(got, 0)).toEqual(enc.encode("aria card bytes"));

      await staged.dispose();
      expect(await stagingSubdirs(root)).toHaveLength(0);
      // dispose is idempotent + safe to call again (the route's finally may double-fire).
      await staged.dispose();
      expect(await stagingSubdirs(root)).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("names each staged file by ENTRY INDEX — never the archive's own (attacker-influenced) path", async () => {
    const root = await mkdtemp(join(tmpdir(), "ziptest-"));
    try {
      const staged = await extractZip(
        await packToBuffer([{ path: "characters/Aria.png", bytes: enc.encode("aria") }]),
        { stagingRoot: root },
      );
      const [subdir] = await stagingSubdirs(root);
      if (subdir === undefined) {
        throw new Error("expected exactly one staging subdir");
      }
      // The on-disk name is the index token "0", NOT "characters" / "Aria.png" — the archive path never
      // becomes a filesystem path (defense in depth over the zip-slip belt).
      expect(await readdir(join(root, subdir))).toEqual(["0"]);
      await staged.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a mid-extraction aggregate bomb leaves NO staging dir behind (clean reject path)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ziptest-"));
    try {
      const entries: ZipEntry[] = [];
      for (let i = 0; i < 40; i++) {
        entries.push({ path: `characters/zeros-${i}.png`, bytes: new Uint8Array(64 * 1024) });
      }
      await expect(
        extractZip(await packToBuffer(entries), {
          stagingRoot: root,
          maxTotalDecompressedBytes: 1024 * 1024,
        }),
      ).rejects.toMatchObject({ ...REJECTED, kind: "bomb" });
      // The partial staging dir was removed before the throw — nothing leaks on the reject path.
      expect(await stagingSubdirs(root)).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
