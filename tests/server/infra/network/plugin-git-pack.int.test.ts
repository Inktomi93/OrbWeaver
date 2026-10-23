// Native pack indexing exercises the installed Node distribution used by guarded plugin Git intake.
// Only the wire bytes are constructed here; decompression, delta resolution and admission stay native.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { expect, test as houseTest } from "@orb/testkit/node";
import { Errors, indexPack, init, readBlob } from "isomorphic-git";

const OBJECT_CAP = 2 * 1024 * 1024;
const RECEIVE_AGGREGATE_CAP = 16 * 1024 * 1024;
const RESOLUTION_AGGREGATE_CAP = 64 * 1024 * 1024;
const DELTA_DEPTH_CAP = 32;
const DELTA_KINDS = [
  { name: "reference", type: 7 },
  { name: "offset", type: 6 },
] as const;
const CORRUPT_ZLIB_CASES = [
  { name: "corrupt header", bytes: Uint8Array.of(0x78, 0x00), message: "incorrect header check" },
  { name: "missing dictionary", bytes: Uint8Array.of(0x78, 0xbb, 0, 0, 0, 0), message: "need dictionary" },
  { name: "incomplete stream", bytes: Uint8Array.of(0x78, 0x9c, 0, 0xff, 0xff, 0, 0), message: "incomplete compressed data" },
] as const;

const test = houseTest.extend<{ packDirectory: string }>({
  packDirectory: async ({}, use): Promise<void> => {
    await using ownership = new AsyncDisposableStack();
    const directory = await mkdtemp(join(tmpdir(), "orb-plugin-git-pack-"));
    ownership.defer(() => rm(directory, { recursive: true, force: true }));
    await use(directory);
  },
});

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function objectHeader(type: number, size: number): Buffer {
  let remaining = Math.floor(size / 16);
  const bytes = [type * 16 + (size % 16) + (remaining > 0 ? 128 : 0)];
  while (remaining > 0) {
    const next = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(next + (remaining > 0 ? 128 : 0));
  }
  return Buffer.from(bytes);
}

function deltaVarint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const next = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(next + (remaining > 0 ? 128 : 0));
  } while (remaining > 0);
  return Buffer.from(bytes);
}

function offsetDistance(value: number): Buffer {
  const bytes = [value % 128];
  let remaining = Math.floor(value / 128);
  while (remaining > 0) {
    remaining -= 1;
    bytes.unshift((remaining % 128) + 128);
    remaining = Math.floor(remaining / 128);
  }
  return Buffer.from(bytes);
}

function packedObject(type: number, bytes: Uint8Array, declaredSize = bytes.byteLength, prefix: Uint8Array = new Uint8Array()): Buffer {
  return Buffer.concat([objectHeader(type, declaredSize), Buffer.from(prefix), deflateSync(bytes)]);
}

function pack(objects: readonly Buffer[], declaredCount = objects.length): Buffer {
  const payload = Buffer.concat([Buffer.from("PACK"), uint32(2), uint32(declaredCount), ...objects]);
  return Buffer.concat([payload, createHash("sha1").update(payload).digest()]);
}

function blobOid(bytes: Uint8Array): Buffer {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest();
}

function sharedBasePack(deltaCount: number): { bytes: Buffer; oids: string[] } {
  const base = new Uint8Array(OBJECT_CAP);
  const reference = blobOid(base);
  const objects = [packedObject(3, base)];
  const oids = [reference.toString("hex")];
  for (let marker = 1; marker <= deltaCount; marker += 1) {
    const delta = Buffer.concat([deltaVarint(OBJECT_CAP), deltaVarint(OBJECT_CAP), Buffer.from([0xf0, 0xff, 0xff, 0x1f, 1, marker])]);
    objects.push(packedObject(7, delta, delta.byteLength, reference));
    oids.push(createHash("sha1").update(`blob ${OBJECT_CAP}\0`).update(base.subarray(0, -1)).update(Uint8Array.of(marker)).digest("hex"));
  }
  return { bytes: pack(objects), oids: oids.sort() };
}

function deltaChain(type: (typeof DELTA_KINDS)[number]["type"], depth: number): { bytes: Buffer; oids: string[] } {
  let value = Uint8Array.of(0);
  let previousOid = blobOid(value);
  const first = packedObject(3, value);
  const objects = [first];
  const oids = [previousOid.toString("hex")];
  let previousLength = first.byteLength;
  for (let marker = 1; marker <= depth; marker += 1) {
    value = Uint8Array.of(marker);
    const delta = Buffer.from([1, 1, 1, marker]);
    const prefix = type === 7 ? previousOid : offsetDistance(previousLength);
    const next = packedObject(type, delta, delta.byteLength, prefix);
    objects.push(next);
    previousLength = next.byteLength;
    previousOid = blobOid(value);
    oids.push(previousOid.toString("hex"));
  }
  return { bytes: pack(objects), oids: oids.sort() };
}

async function indexPackBytes(directory: string, bytes: Uint8Array): ReturnType<typeof indexPack> {
  await init({ fs, dir: directory, defaultBranch: "main" });
  const filepath = ".git/objects/pack/intake.pack";
  await mkdir(join(directory, ".git", "objects", "pack"), { recursive: true });
  await writeFile(join(directory, filepath), bytes);
  return await indexPack({ fs, dir: directory, filepath });
}

test.for(CORRUPT_ZLIB_CASES)("packed readBlob preserves DecompressionError for $name", async ({ bytes, message }, { packDirectory }) => {
  const blob = Uint8Array.of(1);
  const oid = blobOid(blob).toString("hex");
  expect((await indexPackBytes(packDirectory, pack([packedObject(3, blob)]))).oids).toEqual([oid]);
  expect(await readBlob({ fs, dir: packDirectory, oid, cache: {} })).toEqual({ oid, blob });

  const object = Buffer.concat([objectHeader(3, blob.byteLength), bytes]);
  const corrupted = pack([object]);
  const directory = join(packDirectory, ".git", "objects", "pack");
  await writeFile(join(directory, "intake.pack"), corrupted);
  const index = await readFile(join(directory, "intake.idx"));
  // Keep the object CRC and both digests valid so the refusal comes from decompression, not integrity verification.
  index.writeUInt32BE(crc32(object), 8 + 256 * 4 + 20);
  corrupted.subarray(-20).copy(index, index.byteLength - 40);
  createHash("sha1")
    .update(index.subarray(0, -20))
    .digest()
    .copy(index, index.byteLength - 20);
  await writeFile(join(directory, "intake.idx"), index);

  const reading = readBlob({ fs, dir: packDirectory, oid, cache: {} });
  await expect(reading).rejects.toBeInstanceOf(Errors.DecompressionError);
  await expect(reading).rejects.toMatchObject({ code: "DecompressionError", data: { message }, message: `Invalid compressed buffer: ${message}` });
});

test("a pack object-count declaration refuses before any object is read", async ({ packDirectory }) => {
  await expect(indexPackBytes(packDirectory, pack([], 4097))).rejects.toMatchObject({ name: "PackLimitError" });
});

test("an oversized declared object refuses before inflation", async ({ packDirectory }) => {
  const bytes = pack([packedObject(3, new Uint8Array(), OBJECT_CAP + 1)]);
  await expect(indexPackBytes(packDirectory, bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: object declared ${OBJECT_CAP + 1} bytes (cap ${OBJECT_CAP})`,
  });
});

test("an object that lies about its size refuses during actual streaming inflation", async ({ packDirectory }) => {
  const bytes = pack([packedObject(3, new Uint8Array(OBJECT_CAP + 1), 1)]);
  await expect(indexPackBytes(packDirectory, bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: inflated object exceeded per-object cap ${OBJECT_CAP}`,
  });
});

test("declared object bytes refuse before crossing the aggregate receive cap", async ({ packDirectory }) => {
  const object = packedObject(3, new Uint8Array(OBJECT_CAP));
  await expect(indexPackBytes(packDirectory, pack(Array.from({ length: 9 }, () => object)))).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: declared object bytes exceeded aggregate cap ${RECEIVE_AGGREGATE_CAP}`,
  });
});

test("actual inflated bytes refuse independently of the aggregate declared sizes", async ({ packDirectory }) => {
  const objects = [...Array.from({ length: 7 }, () => packedObject(3, new Uint8Array(OBJECT_CAP))), packedObject(3, new Uint8Array(OBJECT_CAP - 1))];
  await expect(indexPackBytes(packDirectory, pack([...objects, packedObject(3, Uint8Array.of(0, 0), 1)]))).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: pack receive exceeded aggregate inflated-byte cap ${RECEIVE_AGGREGATE_CAP}`,
  });
});

test("a valid reference delta indexes the exact base and target objects", async ({ packDirectory }) => {
  const base = Uint8Array.of(0);
  const target = Uint8Array.of(1);
  const delta = Buffer.from([1, 1, 1, 1]);
  const indexed = await indexPackBytes(packDirectory, pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]));
  expect(indexed.oids).toEqual([blobOid(base).toString("hex"), blobOid(target).toString("hex")].sort());
});

test("shared-base deltas index every exact object below the aggregate resolution cap", async ({ packDirectory }) => {
  const source = sharedBasePack(15);
  expect((await indexPackBytes(packDirectory, source.bytes)).oids).toEqual(source.oids);
});

test("shared-base deltas refuse when aggregate resolution crosses its cap", async ({ packDirectory }) => {
  await expect(indexPackBytes(packDirectory, sharedBasePack(16).bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: pack resolution exceeded aggregate inflated-byte cap ${RESOLUTION_AGGREGATE_CAP}`,
  });
});

test("delta operations refuse before concatenating an oversized output", async ({ packDirectory }) => {
  const base = new Uint8Array(OBJECT_CAP);
  const delta = Buffer.concat([deltaVarint(OBJECT_CAP), deltaVarint(OBJECT_CAP), Buffer.from([0xc0, 0x10, 0xc0, 0x10, 0xc0, 0x10])]);
  const bytes = pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]);
  await expect(indexPackBytes(packDirectory, bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: delta operations produced more than ${OBJECT_CAP} bytes`,
  });
});

test("an oversized delta target declaration refuses before applying operations", async ({ packDirectory }) => {
  const base = Uint8Array.of(1);
  const delta = Buffer.concat([deltaVarint(base.byteLength), deltaVarint(OBJECT_CAP + 1)]);
  const bytes = pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]);
  await expect(indexPackBytes(packDirectory, bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: delta target declared ${OBJECT_CAP + 1} bytes (cap ${OBJECT_CAP})`,
  });
});

test.for(DELTA_KINDS)("a $name delta chain at the depth cap indexes every exact object", async ({ type }, { packDirectory }) => {
  const source = deltaChain(type, DELTA_DEPTH_CAP);
  expect((await indexPackBytes(packDirectory, source.bytes)).oids).toEqual(source.oids);
});

test.for(DELTA_KINDS)("a $name delta chain beyond the cap refuses through cached bases", async ({ type }, { packDirectory }) => {
  await expect(indexPackBytes(packDirectory, deltaChain(type, DELTA_DEPTH_CAP + 1).bytes)).rejects.toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: delta chain exceeded depth cap ${DELTA_DEPTH_CAP}`,
  });
});
