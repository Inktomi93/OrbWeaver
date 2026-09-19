// CAS failure ownership: only ENOENT is absence. Stat and readdir failures must remain loud so GC cannot
// mistake unreadable state for missing state, and a directory-fsync FAULT (EIO/EACCES/…) must still reject
// the put rather than claim crash durability. The one exception is the #2410 owner ruling: a filesystem
// that has no directory fsync at all (ENOTSUP anywhere; EISDIR/EPERM from a win32 directory handle) is a
// CAPABILITY statement, so the put degrades and continues with one warn per process.
import type * as FsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { afterEach, beforeEach, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** `directoryOpen` plants a failure on the `open(dir, "r")` that precedes the dir fsync; `directorySync`
 *  plants it on the `handle.sync()` itself (win32 refuses at either point, so both doors are covered).
 *  `null` = no fault; a string is the errno the planted error carries. */
const faults = vi.hoisted(() => ({
  directoryOpen: null as string | null,
  directorySync: null as string | null,
  readdir: false,
  stat: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    open: async (path: Parameters<typeof real.open>[0], flags: Parameters<typeof real.open>[1], ...rest: unknown[]) => {
      if (faults.directoryOpen !== null && flags === "r") {
        throw Object.assign(new Error("planted directory fsync failure"), { code: faults.directoryOpen });
      }
      const handle = await (real.open as (...args: unknown[]) => ReturnType<typeof real.open>)(path, flags, ...rest);
      if (faults.directorySync !== null && flags === "r") {
        // A DELEGATING stand-in, not a prototype-chained clone: node's FileHandle carries internal slots, so
        // a derived object would brand-check-fail the moment `await using` disposed it. Only `sync` and the
        // async dispose are reachable on this handle (cas.ts's `fsyncDir`), so both are spelled here.
        const code = faults.directorySync;
        // @orb-waive no-test-fabrication(unknown): a delegating stand-in for node's FileHandle — a derived object
        // brand-check-fails on `await using` dispose, so the fake must be cast; only `sync`/`close`/dispose are
        // reachable through cas.ts's fsyncDir. Ends when FileHandle can be subclassed without the brand check.
        return {
          sync: (): Promise<never> => Promise.reject(Object.assign(new Error("planted directory sync failure"), { code })),
          close: (): Promise<void> => handle.close(),
          [Symbol.asyncDispose]: (): Promise<void> => handle.close(),
        } as unknown as typeof handle;
      }
      return handle;
    },
    readdir: async (...args: Parameters<typeof real.readdir>) => {
      if (faults.readdir) {
        throw Object.assign(new Error("planted directory read failure"), { code: "EACCES" });
      }
      return await real.readdir(...args);
    },
    stat: async (...args: Parameters<typeof real.stat>) => {
      if (faults.stat) {
        throw Object.assign(new Error("planted stat failure"), { code: "EIO" });
      }
      return await real.stat(...args);
    },
  };
});

const { createCas } = await import("@orb/server/infra/storage");
const OWNER = castId<UserId>("user_cas_failure");
const BYTES = new TextEncoder().encode("cas failure plant");
const HASH = "a".repeat(64);
let root: string;

const NOW = 1_750_000_000_000;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-cas-failure-"));
  faults.directoryOpen = null;
  faults.directorySync = null;
  faults.readdir = false;
  faults.stat = false;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("directory fsync I/O failure rejects a put instead of claiming a crash-durable write", async () => {
  faults.directoryOpen = "EIO";
  await expect(createCas(root).putBytes(OWNER, BYTES, NOW)).rejects.toThrow("planted directory fsync failure");
});

// #2410: the errnos that mean "no directory fsync on this filesystem" are a capability statement, not a
// fault. The bytes still land — that is the whole point of degrading instead of failing the write.
test("ENOTSUP from the directory OPEN degrades the durability guarantee and still publishes the blob, warning exactly once", async () => {
  const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
  try {
    faults.directoryOpen = "ENOTSUP";
    const cas = createCas(root);
    const first = await cas.putBytes(OWNER, BYTES, NOW);
    expect(first.created).toBe(true);
    // Read it back through the CAS's own door: a degraded dir-entry fsync must not cost us the blob.
    expect(new TextDecoder().decode(await cas.read(OWNER, first.hash))).toBe("cas failure plant");

    // A SECOND write on the same unsupporting filesystem must not repeat the sentence — on a box where
    // every put hits this, a per-write log is a flood. Different bytes, so it is a real second write and
    // not the dedup short-circuit (which never reaches fsyncDir at all).
    await expect(cas.putBytes(OWNER, new TextEncoder().encode("second plant"), NOW)).resolves.toMatchObject({ created: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [payload, message] = warnSpy.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ code: "ENOTSUP", platform: process.platform });
    expect(message).toContain("directory fsync");
  } finally {
    warnSpy.mockRestore();
  }
});

test("ENOTSUP from the directory SYNC (the handle opened fine) degrades the same way", async () => {
  faults.directorySync = "ENOTSUP";
  await expect(createCas(root).putBytes(OWNER, BYTES, NOW)).resolves.toMatchObject({ created: true });
});

// The half of the old win32-only fence that SURVIVES the ruling: off Windows these two are a genuine
// permission/wrong-object fault, and reading them as a filesystem capability would silence it.
test.each(["EISDIR", "EPERM"])("%s still rejects a put on a non-win32 platform", async (code) => {
  expect(process.platform).not.toBe("win32");
  faults.directoryOpen = code;
  await expect(createCas(root).putBytes(OWNER, BYTES, NOW)).rejects.toThrow("planted directory fsync failure");
});

test("non-ENOENT stat failure rejects existence and mtime instead of masquerading as absence", async () => {
  faults.stat = true;
  const cas = createCas(root);
  await expect(cas.exists(OWNER, HASH)).rejects.toThrow("planted stat failure");
  await expect(cas.mtimeMs(OWNER, HASH)).rejects.toThrow("planted stat failure");
});

test("non-ENOENT readdir failure rejects enumeration instead of reporting an incomplete empty tree", async () => {
  faults.readdir = true;
  // `listOwners` is declared `AsyncIterable<string>` (cas.ts:33), so pull through the iterator door
  // rather than the concrete generator's `.next` — a test that reaches past the declared contract would
  // keep compiling the day the implementation stops being a generator.
  const owners = createCas(root).listOwners()[Symbol.asyncIterator]();
  await expect(owners.next()).rejects.toThrow("planted directory read failure");
});
