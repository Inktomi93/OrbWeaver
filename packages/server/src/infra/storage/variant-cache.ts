// infra/storage/variant-cache — the derived-image cache, sibling to the CAS (a SEALED filesystem adapter:
// node:* + @orb/kit only; NEVER @orb/db, NEVER a domain). The blob route's `?w=&f=webp` transform used to
// run sharp (decode → resize → webp encode) on EVERY cache-miss request — fine for one image, a CPU storm
// when a library scroll asks for dozens and every new browser/device misses. This cache makes each
// (owner, hash, width) transform a once-per-deployment cost: compute on first miss, persist, serve bytes
// thereafter. The width-snap (`snapBlobWidth` over `BLOB_WIDTHS`) is DOMAIN policy and happens BEFORE this
// cache is reached, so the per-hash keyspace is bounded — an attacker can't stuff the disk by walking
// `?w=1..10000`.
//
// D21 — PER-USER KEYED like the CAS: `<root>/<owner>/<ab>/<cd>/<hash>/w<width>.webp` for the `icon` kind,
// `…/<hash>/portrait-w<width>.webp` for `portrait` (a per-hash DIRECTORY so `removeAll(owner, hash)` — the
// GC/reap hook paired with `cas.remove` — is one recursive rm regardless of kind). webp-only by design (the
// client `avatarUrl` hardcodes `f=webp`); other formats stay JIT in the route.
//
// This is a CACHE, not canon: every entry is reproducible from the CAS original, so writes are atomic
// (a temp under the same filesystem → rename, so a concurrent reader never sees a torn file) but NOT
// fsynced — losing an entry on power loss just means a recompute. Concurrent misses may both transform;
// the atomic rename makes that a benign last-write-wins.

import { randomBytes } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { VariantKind } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";

/** Which variant of a blob — `kind` (the ONE `VariantKind` union home, `@orb/contracts/assets` —
 *  `no-inline-union-redecl`) + the already-snapped `width` folded into one arg (keeps `read`/`put` under
 *  the `useMaxParams` ceiling). `kind` keeps the portrait ladder's `w200`/`w400` rungs from colliding with
 *  the icon ladder's same-numbered rungs — two different crops at the same width are two different
 *  cache entries. */
export interface VariantKey {
  readonly kind: VariantKind;
  readonly width: number;
}

/** The derived-variant cache handle; `entry/` wires `createVariantCache` into the blob route +
 *  the assets service's GC/reap paths (the sibling seam to `Cas` in `./cas`). Per-user (D21). */
export interface VariantCache {
  /** Cached webp bytes for `(owner, hash, variant)`, or undefined on miss (or unreadable — recompute). */
  read: (ownerId: UserId, hash: string, variant: VariantKey) => Promise<Uint8Array | undefined>;
  /** Persist a computed variant. Atomic; best-effort durability (it's a cache). */
  put: (ownerId: UserId, hash: string, variant: VariantKey, bytes: Uint8Array) => Promise<void>;
  /** Drop every variant of a blob — the GC/reap hook, paired with `cas.remove(owner, hash)`. */
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
    return join(
      rootDir,
      ownerId,
      hash.slice(0, SHARD_A_END),
      hash.slice(SHARD_A_END, SHARD_B_END),
      hash,
    );
  }

  // `kind` folds into the FILENAME, not a subdirectory — the icon and portrait ladders share one
  // per-hash directory (so `removeAll` still drops both with one recursive rm) but never collide on
  // width, since `w400.webp` (icon) and `portrait-w400.webp` (portrait) are different files.
  function variantPath(ownerId: UserId, hash: string, variant: VariantKey): string {
    if (!Number.isInteger(variant.width) || variant.width <= 0) {
      throw new Error(`variant-cache: invalid width ${variant.width}`);
    }
    const filename =
      variant.kind === "icon" ? `w${variant.width}.webp` : `${variant.kind}-w${variant.width}.webp`;
    return join(hashDir(ownerId, hash), filename);
  }

  return {
    read(ownerId, hash, variant): Promise<Uint8Array | undefined> {
      // Best-effort lookup: a miss, an unreadable file, OR a malformed key (the `variantPath` guard
      // throwing inside the `.then`) all resolve to undefined — the caller recomputes from the CAS
      // original. The `.then` wrapper turns `variantPath`'s synchronous throw into a rejection the
      // `.catch` swallows (the `() => undefined` idiom, as in infra/network/egress).
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
