import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createPluginGitSource, materializePluginGitEntries } from "@orb/server/infra/network";
import { add, commit, indexPack, init } from "isomorphic-git";
import { expect, test as houseTest } from "../../../support/fixtures.ts";

const COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OBJECT_CAP = 2 * 1024 * 1024;
const RECEIVE_AGGREGATE_CAP = 16 * 1024 * 1024;
const RESOLUTION_AGGREGATE_CAP = 64 * 1024 * 1024;

const test = houseTest.extend<{ scratch: string }>({
  scratch: async ({}, use): Promise<void> => {
    const directory = await mkdtemp(join(tmpdir(), "orb-plugin-git-test-"));
    await use(directory);
    await rm(directory, { recursive: true, force: true });
  },
});

test("the Git source removes its scratch directory after clone, HEAD, pack, and success outcomes", async () => {
  for (const failure of ["clone", "head", "pack", "none"] as const) {
    const removed: string[] = [];
    const source = createPluginGitSource({
      makeScratch: () => Promise.resolve(`/scratch/${failure}`),
      removeScratch: (directory) => {
        removed.push(directory);
        return Promise.resolve();
      },
      cloneInto: () => (failure === "clone" ? Promise.reject(new Error("clone failed")) : Promise.resolve()),
      resolveHead: () => (failure === "head" ? Promise.reject(new Error("HEAD failed")) : Promise.resolve(COMMIT)),
      packDirectory: () => (failure === "pack" ? Promise.reject(new Error("pack failed")) : Promise.resolve(new Uint8Array([1]))),
      readRemoteHead: () => Promise.resolve(COMMIT),
    });

    const outcome = await source.clone("https://git.example/plugin.git").then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ reason, status: "rejected" as const }),
    );
    expect(outcome).toEqual(
      failure === "none" ? { status: "fulfilled", value: { bundle: new Uint8Array([1]), commit: COMMIT } } : { reason: expect.any(Error), status: "rejected" },
    );
    expect(removed).toEqual([`/scratch/${failure}`]);
  }
});

test("the remote-head path rejects malformed provenance", async () => {
  const source = createPluginGitSource({
    makeScratch: () => Promise.resolve("/scratch/unused"),
    removeScratch: () => Promise.resolve(),
    cloneInto: () => Promise.resolve(),
    resolveHead: () => Promise.resolve(COMMIT),
    packDirectory: () => Promise.resolve(new Uint8Array([1])),
    readRemoteHead: () => Promise.resolve("not-an-oid"),
  });
  await expect(source.head("https://git.example/plugin.git")).rejects.toThrow("invalid HEAD commit");
});

test("URL credentials refuse before scratch, clone transport, or remote-head transport", async () => {
  let scratchCalls = 0;
  let cloneCalls = 0;
  let headCalls = 0;
  const source = createPluginGitSource({
    makeScratch: () => {
      scratchCalls += 1;
      return Promise.resolve("/scratch/credentials");
    },
    removeScratch: () => Promise.resolve(),
    cloneInto: () => {
      cloneCalls += 1;
      return Promise.resolve();
    },
    resolveHead: () => Promise.resolve(COMMIT),
    packDirectory: () => Promise.resolve(new Uint8Array([1])),
    readRemoteHead: () => {
      headCalls += 1;
      return Promise.resolve(COMMIT);
    },
  });
  const credentialUrl = "https://owner:secret@git.example/plugin.git";

  const cloneRefusal = await source.clone(credentialUrl).catch((error: unknown) => error);
  const headRefusal = await source.head(credentialUrl).catch((error: unknown) => error);
  expect(cloneRefusal).toMatchObject({ message: "Git repository URL cannot include credentials" });
  expect(headRefusal).toMatchObject({ message: "Git repository URL cannot include credentials" });
  expect(String(cloneRefusal)).not.toContain("secret");
  expect(String(headRefusal)).not.toContain("secret");
  expect({ scratchCalls, cloneCalls, headCalls }).toEqual({ scratchCalls: 0, cloneCalls: 0, headCalls: 0 });
});

test("a compressed-large unrelated tree member is never materialized into the plugin worktree", async ({ scratch }) => {
  await init({ fs, dir: scratch, defaultBranch: "main" });
  await mkdir(join(scratch, "ui", "assets"), { recursive: true });
  await writeFile(join(scratch, "manifest.json"), '{"id":"git-source"}\n');
  await writeFile(join(scratch, "main.js"), "export default {};\n");
  await writeFile(join(scratch, "ui", "assets", "pixel.png"), new Uint8Array([1, 2, 3]));
  await writeFile(join(scratch, "unrelated.bin"), new Uint8Array(8_000_000));
  for (const filepath of ["manifest.json", "main.js", "ui/assets/pixel.png", "unrelated.bin"]) {
    await add({ fs, dir: scratch, filepath });
  }
  await commit({ fs, dir: scratch, message: "fixture", author: { name: "Fixture", email: "fixture@example.test" } });
  await Promise.all([
    rm(join(scratch, "manifest.json")),
    rm(join(scratch, "main.js")),
    rm(join(scratch, "ui"), { recursive: true }),
    rm(join(scratch, "unrelated.bin")),
  ]);

  await materializePluginGitEntries(scratch);

  await expect(readFile(join(scratch, "manifest.json"), "utf8")).resolves.toBe('{"id":"git-source"}\n');
  await expect(stat(join(scratch, "ui", "assets", "pixel.png"))).resolves.toMatchObject({ size: 3 });
  await expect(stat(join(scratch, "unrelated.bin"))).rejects.toMatchObject({ code: "ENOENT" });
});

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

// biome-ignore-start lint/suspicious/noBitwiseOperators: these helpers encode Git pack and delta varints; shifts and masks are the wire format itself.
function objectHeader(type: number, size: number): Buffer {
  const bytes: number[] = [];
  let remaining = size;
  let first = (type << 4) | (remaining & 0x0f);
  remaining >>>= 4;
  if (remaining > 0) {
    first |= 0x80;
  }
  bytes.push(first);
  while (remaining > 0) {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) {
      next |= 0x80;
    }
    bytes.push(next);
  }
  return Buffer.from(bytes);
}

function deltaVarint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) {
      next |= 0x80;
    }
    bytes.push(next);
  } while (remaining > 0);
  return Buffer.from(bytes);
}
// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the Git pack byte encoders above.

function packedObject(type: number, bytes: Uint8Array, declaredSize: number = bytes.byteLength, prefix: Uint8Array = new Uint8Array()): Buffer {
  return Buffer.concat([objectHeader(type, declaredSize), Buffer.from(prefix), deflateSync(bytes)]);
}

function pack(objects: readonly Buffer[], declaredCount: number = objects.length): Buffer {
  const payload = Buffer.concat([Buffer.from("PACK"), uint32(2), uint32(declaredCount), ...objects]);
  return Buffer.concat([payload, createHash("sha1").update(payload).digest()]);
}

function blobOid(bytes: Uint8Array): Buffer {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`);
  return createHash("sha1").update(header).update(bytes).digest();
}

function fullSizeRefDelta(marker: number): Buffer {
  return Buffer.concat([deltaVarint(OBJECT_CAP), deltaVarint(OBJECT_CAP), Buffer.from([0xf0, 0xff, 0xff, 0x1f, 1, marker])]);
}

function sharedBaseRefDeltaPack(deltaCount: number): Buffer {
  const base = new Uint8Array(OBJECT_CAP);
  const reference = blobOid(base);
  const deltas = Array.from({ length: deltaCount }, (_, index) => {
    const delta = fullSizeRefDelta(index + 1);
    return packedObject(7, delta, delta.byteLength, reference);
  });
  return pack([packedObject(3, base), ...deltas]);
}

function refusePack(scratch: string, bytes: Uint8Array): Promise<unknown> {
  return indexPackFixture(scratch, bytes).catch((error: unknown) => error);
}

async function indexPackFixture(scratch: string, bytes: Uint8Array): Promise<{ oids: string[] }> {
  await init({ fs, dir: scratch, defaultBranch: "main" });
  const relative = ".git/objects/pack/hostile.pack";
  await mkdir(join(scratch, ".git", "objects", "pack"), { recursive: true });
  await writeFile(join(scratch, relative), bytes);
  return indexPack({ fs, dir: scratch, filepath: relative });
}

test("a pack object-count declaration refuses before any object is read", async ({ scratch }) => {
  await expect(refusePack(scratch, pack([], 4097))).resolves.toMatchObject({ name: "PackLimitError" });
});

test("an oversized declared object refuses before inflation", async ({ scratch }) => {
  const hostile = pack([Buffer.concat([objectHeader(3, OBJECT_CAP + 1), deflateSync(new Uint8Array())])]);
  await expect(refusePack(scratch, hostile)).resolves.toMatchObject({ name: "PackLimitError" });
});

test("a small compressed object that expands past the per-object cap refuses during streaming inflation", async ({ scratch }) => {
  const hostile = pack([packedObject(3, new Uint8Array(OBJECT_CAP + 1), 1)]);
  const refusal = await refusePack(scratch, hostile);
  expect(refusal).toMatchObject({ name: "PackLimitError" });
  expect(String(refusal)).toContain("inflated object exceeded per-object cap");
});

test("declared object sizes refuse before crossing the aggregate cap", async ({ scratch }) => {
  const object = packedObject(3, new Uint8Array(OBJECT_CAP));
  const refusal = await refusePack(scratch, pack(Array.from({ length: 9 }, () => object)));
  expect(refusal).toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: declared object bytes exceeded aggregate cap ${RECEIVE_AGGREGATE_CAP}`,
  });
});

test("streamed object bytes refuse when actual inflation crosses the aggregate receive cap", async ({ scratch }) => {
  const legalObjects = [...Array.from({ length: 7 }, () => packedObject(3, new Uint8Array(OBJECT_CAP))), packedObject(3, new Uint8Array(OBJECT_CAP - 1))];
  const malformed = packedObject(3, new Uint8Array(2), 1);
  const refusal = await refusePack(scratch, pack([...legalObjects, malformed]));

  expect(refusal).toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: pack receive exceeded aggregate inflated-byte cap ${RECEIVE_AGGREGATE_CAP}`,
  });
});

test("a valid ref-delta reaches resolution and indexes both objects", async ({ scratch }) => {
  const base = new Uint8Array([0]);
  const target = new Uint8Array([1]);
  const delta = Buffer.from([base.byteLength, target.byteLength, target.byteLength, ...target]);
  const indexed = await indexPackFixture(scratch, pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]));

  expect(indexed.oids).toEqual([blobOid(base).toString("hex"), blobOid(target).toString("hex")].sort());
});

test("shared-base ref-deltas index while aggregate resolution stays below the cap", async ({ scratch }) => {
  const indexed = await indexPackFixture(scratch, sharedBaseRefDeltaPack(15));

  expect(indexed.oids).toHaveLength(16);
  expect(new Set(indexed.oids).size).toBe(16);
});

test("shared-base ref-deltas refuse when aggregate resolution crosses the cap", async ({ scratch }) => {
  const refusal = await refusePack(scratch, sharedBaseRefDeltaPack(16));

  expect(refusal).toMatchObject({
    name: "PackLimitError",
    message: `pack resource limit: pack resolution exceeded aggregate inflated-byte cap ${RESOLUTION_AGGREGATE_CAP}`,
  });
});

test("delta operations refuse before concatenating output past the per-object cap", async ({ scratch }) => {
  const base = new Uint8Array(OBJECT_CAP);
  const delta = Buffer.concat([deltaVarint(base.byteLength), deltaVarint(OBJECT_CAP), Buffer.from([0xc0, 0x10, 0xc0, 0x10, 0xc0, 0x10])]);
  const hostile = pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]);
  const refusal = await refusePack(scratch, hostile);
  expect(refusal).toMatchObject({ name: "PackLimitError" });
  expect(String(refusal)).toContain("delta operations produced more than");
});

test("a delta target declaration past the per-object cap refuses before applying operations", async ({ scratch }) => {
  const base = new Uint8Array([1]);
  const delta = Buffer.concat([deltaVarint(base.byteLength), deltaVarint(OBJECT_CAP + 1)]);
  const hostile = pack([packedObject(3, base), packedObject(7, delta, delta.byteLength, blobOid(base))]);
  const refusal = await refusePack(scratch, hostile);
  expect(refusal).toMatchObject({ name: "PackLimitError" });
  expect(String(refusal)).toContain("delta target declared");
});

test("a ref-delta chain beyond the limit refuses even when its base is a resolved cache hit", async ({ scratch }) => {
  const objects: Buffer[] = [];
  let value = new Uint8Array([0]);
  let previousOid = blobOid(value);
  objects.push(packedObject(3, value));
  for (let index = 1; index <= 33; index += 1) {
    value = new Uint8Array([index]);
    const delta = Buffer.from([1, 1, 1, index]);
    objects.push(packedObject(7, delta, delta.byteLength, previousOid));
    previousOid = blobOid(value);
  }

  const refusal = await refusePack(scratch, pack(objects));
  expect(refusal).toMatchObject({ name: "PackLimitError" });
  expect(String(refusal)).toContain("delta chain exceeded depth cap");
});
