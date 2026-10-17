// Storage adapter contracts are server-only injected capabilities, never application wire shapes.
import type { VariantKind } from "@orb/contracts/assets";
import type { UserId } from "@orb/kit/ids";

/** The tools that own a per-user runtime root (inference program §8.4-2). One member today: the agent-sdk's
 *  `claude` CLI, whose `CLAUDE_CONFIG_DIR`/`ANTHROPIC_CONFIG_DIR` point at that directory. */
const RUNTIME_TOOLS = ["claude"] as const;
export type RuntimeTool = (typeof RUNTIME_TOOLS)[number];

export interface UserRuntimeDirs {
  /** The path — created on first read (0700), so a spawn never races a missing directory. */
  readonly dirFor: (ownerId: UserId, tool: RuntimeTool) => string;
  /** Remove the user's whole tool dir — the credentials domain calls it when the row is deleted. */
  readonly remove: (ownerId: UserId, tool: RuntimeTool) => void;
}

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

export interface VariantKey {
  readonly kind: VariantKind;
  readonly width: number;
  /** The lossy-encoder quality the variant was encoded at (item 6). FOLDED INTO THE CACHE FILENAME so an
   *  admin change to AppSettings.imageVariantQuality yields a DIFFERENT key → a fresh encode, never a
   *  stale-quality variant served forever. A missing/legacy entry (pre-quality filename) simply misses → recompute. */
  readonly quality: number;
}

export interface VariantCache {
  read: (ownerId: UserId, hash: string, variant: VariantKey) => Promise<Uint8Array | undefined>;
  put: (ownerId: UserId, hash: string, variant: VariantKey, bytes: Uint8Array) => Promise<void>;
  /** GC/reap hook, paired with `cas.remove(owner, hash)`. */
  removeAll: (ownerId: UserId, hash: string) => Promise<void>;
}

export interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** One entry recovered from an untrusted archive after the belt battery passed and it was staged to disk. */
export interface StagedEntry {
  readonly path: string;
  readonly read: () => Promise<Uint8Array>;
}

/** The caller disposes a staged archive in finally to remove its staging directory. */
export interface StagedArchive {
  readonly entries: readonly StagedEntry[];
  readonly dispose: () => Promise<void>;
}

export interface ExtractOptions {
  readonly maxTotalBytes?: number;
  readonly maxEntryBytes?: number;
  readonly maxTotalDecompressedBytes?: number;
  readonly maxEntries?: number;
  readonly stagingRoot?: string;
}
