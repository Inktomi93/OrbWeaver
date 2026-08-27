// CAS failure ownership: only ENOENT is absence. Directory fsync, stat, and readdir failures must remain
// loud so a write cannot claim crash durability and GC cannot mistake unreadable state for missing state.
import type * as FsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, beforeEach, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const faults = vi.hoisted(() => ({ directoryOpen: false, readdir: false, stat: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    open: async (path: Parameters<typeof real.open>[0], flags: Parameters<typeof real.open>[1], ...rest: unknown[]) => {
      if (faults.directoryOpen && flags === "r") {
        throw Object.assign(new Error("planted directory fsync failure"), { code: "EIO" });
      }
      return await (real.open as (...args: unknown[]) => ReturnType<typeof real.open>)(path, flags, ...rest);
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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-cas-failure-"));
  faults.directoryOpen = false;
  faults.readdir = false;
  faults.stat = false;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("directory fsync failure rejects a put instead of claiming a crash-durable write", async () => {
  faults.directoryOpen = true;
  await expect(createCas(root).putBytes(OWNER, BYTES, 1_750_000_000_000)).rejects.toThrow("planted directory fsync failure");
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
