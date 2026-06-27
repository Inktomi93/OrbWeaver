// infra/storage/cas — the per-user content-addressed blob store (CAS). A SEALED I/O executor: pure
// filesystem adapter keyed by the sha-256 of the bytes, importing only @orb/kit (the `isAssetHash`
// path-traversal guard) + node:* — NEVER @orb/db, NEVER a domain (tiers/infra.md sealed-executor
// invariant; `infra-no-db` / `infra-below-domain` gates). The `domain/assets` index (the `assets` table
// + the `storeBlob` coherence primitive) orchestrates this handle; the bytes live here, the row lives
// there, and the domain keeps the pair coherent.
//
// D21 — assets are PER-USER (single-owned), so the CAS is PER-USER KEYED: `<root>/<owner>/<ab>/<cd>/<hash>`
// (a 2-level shard fan-out under the owner segment). There is NO cross-user byte dedup and NO cross-user
// existence oracle — the same bytes uploaded by two owners are two distinct blobs under two owner subtrees;
// within-user dedup is preserved. Ownership is gated ABOVE this adapter (the domain's `fetchOwned` + the
// owner-gated `/blob` route); the path embedding the owner is the physical half of that gate.
//
// Footguns handled (the reason CAS libraries exist):
//   • sha-256, so a card blob's hash == characters.importHash (the whole-file hash the import path stores).
//   • sharded `<owner>/ab/cd/<hash>` (never one flat dir of thousands).
//   • durable crash-atomic write WITHOUT a third-party lib: write a temp file UNDER rootDir (`.tmp/`, same
//     filesystem — a cross-device rename silently degrades to a non-atomic copy) → fsync the file fd →
//     rename into place → fsync the containing directory. Never the final path directly, so a crashed
//     write can't leave a corrupt blob at its hash.
//   • write-once dedup: identical bytes hash identically → the second put skips the write but bumps the
//     blob's mtime (to the INJECTED `now`, never an ambient clock — same determinism seam the rest of the
//     server uses) so GC's mtime-based grace window also protects deduped re-imports.

import { createHash, randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";

/** @public — the return shape of {@link Cas.putBytes}; consumed by `domain/assets`'s `storeBlob`. The
 *  infra layer knows nothing of the `assets` row, so this carries NO `assetId` (the domain mints that). */
export interface PutResult {
  /** The sha-256 hex of the stored bytes (the CAS key). */
  hash: string;
  /** The byte length of the stored content. */
  size: number;
  /** `false` if the blob already existed (within-user dedup) — the write was skipped, the mtime bumped. */
  created: boolean;
}

/** @public — the per-user content-addressed blob store. `entry/` wires `createCas(env.ASSETS_DIR)` once
 *  and injects this handle into `domain/assets` + `domain/export`. Every op is scoped to an `ownerId`
 *  (D21): a blob written under one owner is invisible to another. */
export interface Cas {
  /** Store bytes under `(ownerId, sha-256)`. Idempotent within an owner: identical bytes dedup to one
   *  blob (and bump its mtime to `now`, epoch-ms). `now` is injected (no ambient clock). */
  putBytes: (ownerId: UserId, bytes: Uint8Array, now: number) => Promise<PutResult>;
  /** The sharded on-disk path for `(ownerId, hash)`. Throws on a non-hash or unsafe owner segment
   *  (the path-traversal guard). */
  blobPath: (ownerId: UserId, hash: string) => string;
  /** Whether `(ownerId, hash)` exists. */
  exists: (ownerId: UserId, hash: string) => Promise<boolean>;
  /** Read the bytes of `(ownerId, hash)`. Rejects (ENOENT) if absent. */
  read: (ownerId: UserId, hash: string) => Promise<Uint8Array>;
  /** Re-hash the bytes on disk and compare to the name — catches silent corruption. `false` if missing;
   *  a non-ENOENT I/O error propagates (corrupt ≠ absent). */
  verify: (ownerId: UserId, hash: string) => Promise<boolean>;
  /** Delete a blob. Idempotent (a missing blob is not an error). */
  remove: (ownerId: UserId, hash: string) => Promise<void>;
  /** Walk one owner's subtree, yielding every stored hash (per-owner GC / fsck / rebuild). */
  listHashes: (ownerId: UserId) => AsyncIterable<string>;
  /** The owner segments present in the tree (whole-CAS sweeps compose this with {@link listHashes}). */
  listOwners: () => AsyncIterable<string>;
}

// A shard segment is exactly two lowercase hex chars; the two segments are the hash's first 2 + next 2.
const SHARD_SEGMENT = /^[0-9a-f]{2}$/;
const SHARD_A_END = 2;
const SHARD_B_END = 4;
// An owner path segment: a conservative allowlist (TypeID / handle forms) that cannot contain `/`, `\`, or
// a `.` (so `..` traversal is impossible). A rejected id is a loud throw, never a silent escape.
const OWNER_SEGMENT = /^[A-Za-z0-9_-]+$/;
const TMP_DIRNAME = ".tmp";
const TMP_SUFFIX_BYTES = 16;
const MS_PER_SECOND = 1000;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertOwnerSegment(ownerId: string): void {
  if (!OWNER_SEGMENT.test(ownerId)) {
    throw new Error(`cas: unsafe owner segment: ${JSON.stringify(ownerId)}`);
  }
}

// readdir(withFileTypes) with a tolerant catch — a not-yet-created tree is empty, not an error.
async function safeReaddir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// A shard directory is a 2-hex-char dir (the `ab` / `cd` levels).
function isShardDir(entry: Dirent): boolean {
  return entry.isDirectory() && SHARD_SEGMENT.test(entry.name);
}

// Yield every stored hash filename directly under one leaf shard dir.
async function* listLeafHashes(dir: string): AsyncGenerator<string> {
  for (const f of await safeReaddir(dir)) {
    if (f.isFile() && isAssetHash(f.name)) {
      yield f.name;
    }
  }
}

// Walk one owner's 2-level shard subtree, yielding every stored hash (small helpers keep the nesting —
// and the cognitive complexity — bounded).
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

// Yield the owner segments present at the tree root (the `.tmp` staging dir + stray entries fail the
// allowlist and are skipped).
async function* walkOwners(rootDir: string): AsyncGenerator<string> {
  for (const entry of await safeReaddir(rootDir)) {
    if (entry.isDirectory() && OWNER_SEGMENT.test(entry.name)) {
      yield entry.name;
    }
  }
}

/**
 * Fsync a directory so a rename INTO it is durable across power loss. Best-effort: on Windows the open()
 * may EISDIR/EPERM — swallow, because the file fsync already happened (the platform's strongest available
 * guarantee there). POSIX (Linux/macOS) honors the call.
 */
async function fsyncDir(dir: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // best-effort
  } finally {
    await handle?.close().catch(() => {
      // best-effort: a close failure after the fsync attempt is not recoverable here.
    });
  }
}

export function createCas(rootDir: string): Cas {
  const tmpDir = join(rootDir, TMP_DIRNAME);

  function ownerDir(ownerId: string): string {
    assertOwnerSegment(ownerId);
    return join(rootDir, ownerId);
  }

  function shardDir(ownerId: string, hash: string): string {
    return join(
      ownerDir(ownerId),
      hash.slice(0, SHARD_A_END),
      hash.slice(SHARD_A_END, SHARD_B_END),
    );
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
    } catch {
      return false;
    }
  }

  function read(ownerId: UserId, hash: string): Promise<Uint8Array> {
    return readFile(blobPath(ownerId, hash));
  }

  async function writeAtomic(dest: string, bytes: Uint8Array): Promise<void> {
    // Both the shard dir and the temp dir live under rootDir, so the temp→dest rename stays on one
    // filesystem (atomic). Create both before writing.
    await mkdir(dirname(dest), { recursive: true });
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `${randomBytes(TMP_SUFFIX_BYTES).toString("hex")}.tmp`);
    let handle: FileHandle | undefined;
    try {
      handle = await open(tmpPath, "w");
      await handle.writeFile(bytes);
      await handle.sync(); // CANON is durable: fsync the file fd before the rename publishes it.
    } finally {
      await handle?.close();
    }
    await rename(tmpPath, dest);
    // `rename` makes the blob appear atomically, but the parent dir entry isn't durable until the dir is
    // fsynced — a power loss between rename and the next sync could lose it. Fsync the dir explicitly.
    await fsyncDir(dirname(dest));
  }

  return {
    blobPath,
    exists,
    read,

    async putBytes(ownerId, bytes, now): Promise<PutResult> {
      const hash = sha256(bytes);
      const size = bytes.byteLength;
      const dest = blobPath(ownerId, hash);
      if (await exists(ownerId, hash)) {
        // Dedup hit — bump the blob's mtime to the injected `now` so GC's grace window protects THIS put
        // too (a delete-then-reimport of the same card dedups onto an existing blob; without the bump it
        // looks stale to `collectGarbage` and can be swept between the put and the row link). ENOENT means
        // a concurrent GC just removed it — fall through and write fresh.
        try {
          const seconds = now / MS_PER_SECOND;
          await utimes(dest, seconds, seconds);
          return { hash, size, created: false };
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
            throw err;
          }
          // blob vanished between exists() and utimes() — write it below
        }
      }
      await writeAtomic(dest, bytes);
      return { hash, size, created: true };
    },

    async verify(ownerId, hash): Promise<boolean> {
      try {
        return sha256(await read(ownerId, hash)) === hash;
      } catch (err) {
        // Only "blob is missing" is honestly false here; permission / I/O / corruption errors are NOT a
        // "checksum mismatch" and must surface so a caller can tell "silently corrupt" from "not there."
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          return false;
        }
        throw err;
      }
    },

    async remove(ownerId, hash): Promise<void> {
      await rm(blobPath(ownerId, hash), { force: true });
    },

    listHashes(ownerId): AsyncGenerator<string> {
      // `ownerDir` validates the segment eagerly (throws on an unsafe owner before any walk begins).
      return walkOwnerHashes(ownerDir(ownerId));
    },

    listOwners(): AsyncGenerator<string> {
      return walkOwners(rootDir);
    },
  };
}
