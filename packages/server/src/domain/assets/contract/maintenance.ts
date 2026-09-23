// domain/assets/contract/maintenance — the param/result vocabulary for the maintenance/DR wave:
// `backfillAvatars` · `collectGarbage` · `reapIfOrphan` · `fsck` · `rebuildFromTree`. These types are
// DOMAIN-INTERNAL (§7.4 one type home): the ONLY consumers are the CLI/ops scripts + the workload runners
// (no client, no wire), so they live HERE and NOT in `@orb/contracts` — the front door (`index.ts`) does not
// re-export them (a CLI/workload imports the service type directly). The verbs join `AssetsService` in
// `contract/service.ts`.

import type { AssetKind } from "@orb/contracts/assets";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/** One asset-bearing column in the `@orb/db` schema: the table + the `AssetId`-branded column. The registry
 *  (`persistence/asset-refs.ts`) is a list of these; both GC paths iterate it to build the live-reference set.
 *  Type lives here (contract), values live in persistence (`domain-feature-front-door` / §7.4). */
export interface AssetRef {
  readonly table: SQLiteTable;
  readonly column: AnySQLiteColumn;
}

// ── backfillAvatars ──────────────────────────────────────────────────────────────────────────────────────

/** One staged card to (re)link: the character it belongs to + its card PNG bytes + the whole-file hash the
 *  flat `characters` row recorded at import (`importHash`, sha-256). The verb stores the bytes through the
 *  coherence writer, then links ONLY if the stored blob's hash matches this — a mismatch is a corrupt/wrong
 *  staging file, recorded not linked. */
export interface BackfillCard {
  readonly characterId: CharacterId;
  readonly bytes: Uint8Array;
  readonly importHash: string;
}

/** `backfillAvatars` input: the owner whose cards these are + the staged cards + the validate-only switch. */
export interface BackfillParams {
  readonly ownerId: UserId;
  readonly cards: readonly BackfillCard[];
  /** Report what WOULD link without storing bytes or writing the `avatarAssetId` UPDATE. */
  readonly dryRun?: boolean;
}

/** `backfillAvatars` outcome: cards scanned, avatars actually (re)linked, and integrity mismatches skipped. */
export interface BackfillResult {
  readonly scanned: number;
  readonly linked: number;
  readonly mismatched: number;
  readonly dryRun: boolean;
}

// ── collectGarbage (mark-sweep, grace-windowed) ──────────────────────────────────────────────────────────

/** `collectGarbage` options. `graceMs` protects a just-put-but-not-yet-linked blob (the put→link gap) via the
 *  CAS mtime; omitted ⇒ the verb's floor default. `dryRun` reports without deleting. `signal` aborts the
 *  (potentially long) whole-CAS sweep (workload cancel / SIGTERM). */
export interface GcOptions {
  readonly dryRun?: boolean;
  readonly graceMs?: number;
  readonly signal?: AbortSignal;
}

/** `collectGarbage` outcome: blobs walked vs blobs reclaimed (or would-be, under `dryRun`). */
export interface GcResult {
  readonly scanned: number;
  readonly reclaimed: number;
  readonly dryRun: boolean;
}

// ── reapIfOrphan (targeted, NO grace) ────────────────────────────────────────────────────────────────────

/** `reapIfOrphan` outcome: ids checked vs assets actually reaped (row + blob + variants). */
export interface ReapResult {
  readonly checked: number;
  readonly reaped: number;
}

// ── fsck (read-only integrity report) ────────────────────────────────────────────────────────────────────

/** `fsck` options — `signal` aborts the read-only whole-store scan. */
export interface FsckOptions {
  readonly signal?: AbortSignal;
}

/** `fsck` report — the three integrity faults + the populations they were derived from. `danglingRows` (row,
 *  no blob) is the never-supposed-to-happen fault (the drop-row-before-blob ordering prevents it);
 *  `corruptBlobs` (present blob, re-hash mismatch) is silent bit-rot; `orphanBlobs` (blob, no row) is the
 *  benign leak GC/`rebuildFromTree` reclaim. */
export interface FsckResult {
  readonly scannedRows: number;
  readonly scannedBlobs: number;
  readonly danglingRows: number;
  readonly corruptBlobs: number;
  readonly orphanBlobs: number;
}

// ── rebuildFromTree (DR) ─────────────────────────────────────────────────────────────────────────────────

/** `rebuildFromTree` options — `signal` aborts the walk-and-hash disaster-recovery pass. */
export interface RebuildOptions {
  readonly kind: AssetKind;
  readonly signal?: AbortSignal;
}

/** `rebuildFromTree` outcome: index rows re-derived for orphan blobs (`created`) vs blobs that already had a
 *  row (`existing`). */
export interface RebuildResult {
  readonly created: number;
  readonly existing: number;
}
