// Per-user content-addressed blob store (CAS): a sealed filesystem adapter keyed by sha-256, sharded as
// <root>/<owner>/<ab>/<cd>/<hash> (no cross-user dedup, ownership gated above this adapter). Writes are
// crash-atomic on platforms that support directory fsync: temp file under rootDir → fsync fd → rename →
// fsync dir.
//
// THE DIRECTORY-FSYNC DOWNGRADE (owner ruling 2026-09-19, #2410 — this paragraph REPLACES the win32-only
// fence this header used to record). The fence said: EISDIR/EPERM/ENOTSUP is tolerated on win32 and every
// other platform propagates, because a supported platform's failure invalidates the crash-durable verdict.
// That reasoning survives for a REAL I/O fault and is why EIO/EACCES/ENOSPC still reject the put. What it
// got wrong is ENOTSUP: a FUSE mount, a network filesystem and some macOS volumes answer "this filesystem
// has no directory fsync" with ENOTSUP on a perfectly healthy box, and refusing the write there buys no
// durability — it only makes the asset store unusable. So ENOTSUP now downgrades the DIR-ENTRY durability
// guarantee on EVERY platform, with ONE structured warn per process (a module latch — the alternative is a
// per-write log flood on a box where every write hits it). EISDIR/EPERM stay win32-scoped, exactly as
// before: those are how a Windows directory handle refuses, and treating them as a filesystem capability
// statement elsewhere would silence a genuine permission fault.
//
// The downgrade is narrow: only the PARENT-DIRECTORY entry loses its durability guarantee. The blob bytes
// are still fsynced to disk before the rename, and the rename itself is still atomic — a crash can lose the
// fact that the name exists, never a half-written blob under a name that does. Every other file, stat,
// directory-read, sync, and close failure propagates, on every platform.

import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { sha256Hex } from "#kit/content-hash";

export interface PutResult {
  hash: string;
  size: number;
  /** false if the blob already existed (within-user dedup) — the write was skipped, the mtime bumped. */
  created: boolean;
}

export interface Cas {
  putBytes: (ownerId: UserId, bytes: Uint8Array, now: number) => Promise<PutResult>;
  blobPath: (ownerId: UserId, hash: string) => string;
  exists: (ownerId: UserId, hash: string) => Promise<boolean>;
  /** Read counterpart of putBytes's mtime bump — collectGarbage's grace window compares this to skip a just-put-but-not-yet-linked blob. */
  mtimeMs: (ownerId: UserId, hash: string) => Promise<number | undefined>;
  read: (ownerId: UserId, hash: string) => Promise<Uint8Array>;
  verify: (ownerId: UserId, hash: string) => Promise<boolean>;
  remove: (ownerId: UserId, hash: string) => Promise<void>;
  listHashes: (ownerId: UserId) => AsyncIterable<string>;
  listOwners: () => AsyncIterable<string>;
}

const SHARD_SEGMENT = /^[0-9a-f]{2}$/;
const SHARD_A_END = 2;
const SHARD_B_END = 4;
// Cannot contain /, \, or . — so ".." traversal is impossible. A rejected id is a loud throw, never a silent escape.
const OWNER_SEGMENT = /^[A-Za-z0-9_-]+$/;
const TMP_DIRNAME = ".tmp";
const TMP_SUFFIX_BYTES = 16;
const MS_PER_SECOND = 1000;

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function sha256(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

function assertOwnerSegment(ownerId: string): void {
  if (!OWNER_SEGMENT.test(ownerId)) {
    throw new Error(`cas: unsafe owner segment: ${JSON.stringify(ownerId)}`);
  }
}

// A not-yet-created tree is empty, not an error.
async function safeReaddir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (errnoIs(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

function isShardDir(entry: Dirent): boolean {
  return entry.isDirectory() && SHARD_SEGMENT.test(entry.name);
}

async function* listLeafHashes(dir: string): AsyncGenerator<string> {
  for (const f of await safeReaddir(dir)) {
    if (f.isFile() && isAssetHash(f.name)) {
      yield f.name;
    }
  }
}

async function* walkOwnerHashes(ownerBase: string): AsyncGenerator<string> {
  for (const s1 of await safeReaddir(ownerBase)) {
    if (!isShardDir(s1)) {
      continue;
    }
    const d1 = join(ownerBase, s1.name);
    for (const s2 of await safeReaddir(d1)) {
      if (isShardDir(s2)) {
        yield* listLeafHashes(join(d1, s2.name));
      }
    }
  }
}

async function* walkOwners(rootDir: string): AsyncGenerator<string> {
  for (const entry of await safeReaddir(rootDir)) {
    if (entry.isDirectory() && OWNER_SEGMENT.test(entry.name)) {
      yield entry.name;
    }
  }
}

// "This filesystem cannot fsync a directory" — a CAPABILITY statement, not a fault. ENOTSUP says it on
// every platform (FUSE / network mounts / some macOS volumes); Windows says it as EISDIR or EPERM from the
// open or the sync, and ONLY Windows, so those two stay platform-fenced (elsewhere they are a real
// permission fault, which must still reject the put).
function isDirSyncUnsupported(error: unknown): boolean {
  return errnoIs(error, "ENOTSUP") || (process.platform === "win32" && (errnoIs(error, "EISDIR") || errnoIs(error, "EPERM")));
}

// ASSUMES(single-replica): a per-PROCESS latch over a per-PROCESS log stream. It exists only to keep one
// box's log from repeating the same filesystem-capability sentence on every asset write; a second replica
// SHOULD say it once too (its operator reads its own log), and a restart re-announcing it is correct, not a
// bug. Nothing reads it back, so there is nothing for durable state to hold.
let dirSyncUnsupportedAnnounced = false;

// @orb-waive caught-failure-ownership(error): the ONLY absorbed arm is `isDirSyncUnsupported` — a filesystem CAPABILITY statement, not a fault — and its owner is the operator, told once per process by the structured warn below (the latch is deliberate: on an unsupporting mount every write hits this, and a per-write line would bury the notice it is trying to deliver). Every other errno RE-THROWS on the line above, so a real I/O or permission fault still rejects the put. Owner ruling 2026-09-19, #2410. Ends if the dir-entry fsync becomes required for correctness rather than crash-durability, or if the notice gains a caller-visible result.
async function fsyncDir(dir: string): Promise<void> {
  try {
    await using handle = await open(dir, "r");
    await handle.sync();
  } catch (error) {
    if (!isDirSyncUnsupported(error)) {
      throw error;
    }
    if (!dirSyncUnsupportedAnnounced) {
      dirSyncUnsupportedAnnounced = true;
      getLog().warn(
        { platform: process.platform, code: (error as NodeJS.ErrnoException).code },
        "cas: this filesystem does not support directory fsync — blob bytes are still fsynced and the publish rename is still atomic, but a crash can lose the directory ENTRY of a just-written blob (logged once per process)",
      );
    }
  }
}

export function createCas(rootDir: string): Cas {
  const tmpDir = join(rootDir, TMP_DIRNAME);

  function ownerDir(ownerId: string): string {
    assertOwnerSegment(ownerId);
    return join(rootDir, ownerId);
  }

  function shardDir(ownerId: string, hash: string): string {
    return join(ownerDir(ownerId), hash.slice(0, SHARD_A_END), hash.slice(SHARD_A_END, SHARD_B_END));
  }

  function blobPath(ownerId: UserId, hash: string): string {
    if (!isAssetHash(hash)) {
      throw new Error(`cas: not a valid content hash: ${JSON.stringify(hash)}`);
    }
    return join(shardDir(ownerId, hash), hash);
  }

  async function exists(ownerId: UserId, hash: string): Promise<boolean> {
    try {
      await stat(blobPath(ownerId, hash));
      return true;
    } catch (error) {
      if (errnoIs(error, "ENOENT")) {
        return false;
      }
      throw error;
    }
  }

  async function mtimeMs(ownerId: UserId, hash: string): Promise<number | undefined> {
    try {
      return (await stat(blobPath(ownerId, hash))).mtimeMs;
    } catch (error) {
      if (errnoIs(error, "ENOENT")) {
        return;
      }
      throw error;
    }
  }

  function read(ownerId: UserId, hash: string): Promise<Uint8Array> {
    return readFile(blobPath(ownerId, hash));
  }

  async function writeAtomic(dest: string, bytes: Uint8Array): Promise<void> {
    // Both dirs live under rootDir, so the temp→dest rename stays on one filesystem (atomic).
    await mkdir(dirname(dest), { recursive: true });
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `${randomBytes(TMP_SUFFIX_BYTES).toString("hex")}.tmp`);
    // EXPLICIT BLOCK, not a function-scoped `await using`: write→fsync→CLOSE must all complete BEFORE the
    // rename publishes the blob. A function-scoped declaration would close after the rename AND after the
    // parent-dir fsync below, breaking the durability order this path exists to guarantee.
    {
      await using handle = await open(tmpPath, "w");
      await handle.writeFile(bytes);
      await handle.sync();
    }
    await rename(tmpPath, dest);
    // rename() makes the blob appear atomically, but the parent dir entry isn't durable until fsynced too.
    await fsyncDir(dirname(dest));
  }

  return {
    blobPath,
    exists,
    mtimeMs,
    read,

    async putBytes(ownerId, bytes, now): Promise<PutResult> {
      const hash = sha256(bytes);
      const size = bytes.byteLength;
      const dest = blobPath(ownerId, hash);
      if (await exists(ownerId, hash)) {
        // Dedup hit — bump mtime so GC's grace window protects this put too. ENOENT means a concurrent GC
        // just removed it — fall through and write fresh.
        // @orb-waive caught-failure-ownership(err): only ENOENT is absorbed (a concurrent GC removed the dedup target → fall through and write fresh); every other utimes error is re-thrown, so a permission/I/O fault never silently passes. Ends if the non-ENOENT re-throw is removed.
        try {
          const seconds = now / MS_PER_SECOND;
          await utimes(dest, seconds, seconds);
          return { hash, size, created: false };
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw err;
          }
        }
      }
      await writeAtomic(dest, bytes);
      return { hash, size, created: true };
    },

    async verify(ownerId, hash): Promise<boolean> {
      try {
        return sha256(await read(ownerId, hash)) === hash;
      } catch (err) {
        // Only "missing" is honestly false — permission/I/O/corruption errors must surface.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw err;
      }
    },

    async remove(ownerId, hash): Promise<void> {
      await rm(blobPath(ownerId, hash), { force: true });
    },

    listHashes(ownerId): AsyncGenerator<string> {
      return walkOwnerHashes(ownerDir(ownerId));
    },

    listOwners(): AsyncGenerator<string> {
      return walkOwners(rootDir);
    },
  };
}
