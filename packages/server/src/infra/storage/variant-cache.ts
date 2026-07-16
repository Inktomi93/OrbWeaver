// The derived-image cache, sibling to the CAS (sealed filesystem adapter: node:* + @orb/kit only). Makes
// each (owner, hash, width) transform a once-per-deployment cost instead of recomputing on every request.
// Per-user keyed like the CAS. Not canon: every entry is reproducible from the CAS original, so writes are
// atomic (temp → rename) but not fsynced — losing an entry on power loss is just a recompute.

import { randomBytes } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { VariantKind } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";

interface VariantKey {
  readonly kind: VariantKind;
  readonly width: number;
}

export interface VariantCache {
  read: (ownerId: UserId, hash: string, variant: VariantKey) => Promise<Uint8Array | undefined>;
  put: (ownerId: UserId, hash: string, variant: VariantKey, bytes: Uint8Array) => Promise<void>;
  /** GC/reap hook, paired with `cas.remove(owner, hash)`. */
  removeAll: (ownerId: UserId, hash: string) => Promise<void>;
}

const SHARD_A_END = 2;
const SHARD_B_END = 4;
const OWNER_SEGMENT = /^[A-Za-z0-9_-]+$/;
const TMP_DIRNAME = ".tmp";
const TMP_SUFFIX_BYTES = 16;

export function createVariantCache(rootDir: string): VariantCache {
  const tmpDir = join(rootDir, TMP_DIRNAME);

  function hashDir(ownerId: UserId, hash: string): string {
    if (!OWNER_SEGMENT.test(ownerId)) {
      throw new Error(`variant-cache: unsafe owner segment: ${JSON.stringify(ownerId)}`);
    }
    if (!isAssetHash(hash)) {
      throw new Error(`variant-cache: not a valid content hash: ${JSON.stringify(hash)}`);
    }
    return join(rootDir, ownerId, hash.slice(0, SHARD_A_END), hash.slice(SHARD_A_END, SHARD_B_END), hash);
  }

  // `kind` folds into the filename, not a subdirectory, so `removeAll` still drops both with one rm.
  function variantPath(ownerId: UserId, hash: string, variant: VariantKey): string {
    if (!Number.isInteger(variant.width) || variant.width <= 0) {
      throw new Error(`variant-cache: invalid width ${variant.width}`);
    }
    const filename = variant.kind === "icon" ? `w${variant.width}.webp` : `${variant.kind}-w${variant.width}.webp`;
    return join(hashDir(ownerId, hash), filename);
  }

  return {
    read(ownerId, hash, variant): Promise<Uint8Array | undefined> {
      // Best-effort: a miss, unreadable file, or malformed key all resolve to undefined (recompute).
      return Promise.resolve()
        .then(() => readFile(variantPath(ownerId, hash, variant)))
        .catch(() => undefined);
    },

    async put(ownerId, hash, variant, bytes): Promise<void> {
      const dest = variantPath(ownerId, hash, variant);
      await mkdir(hashDir(ownerId, hash), { recursive: true });
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `${randomBytes(TMP_SUFFIX_BYTES).toString("hex")}.tmp`);
      let handle: FileHandle | undefined;
      try {
        handle = await open(tmpPath, "w");
        await handle.writeFile(bytes); // fsync omitted: a lost cache entry is just a recompute.
      } finally {
        await handle?.close();
      }
      // Atomic publish (same filesystem → rename) so a concurrent reader never sees a torn file.
      await rename(tmpPath, dest);
    },

    async removeAll(ownerId, hash): Promise<void> {
      await rm(hashDir(ownerId, hash), { recursive: true, force: true });
    },
  };
}
