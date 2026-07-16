// All `presets`-table access (queries only). User-scoped: reads are the two-armed "owner's row OR the
// system default"; owned writes scope on `ownerId = userId`. The system default's own lifecycle has its
// dedicated key-on-sentinel queries. Timestamps arrive as params.

import type { PromptConfig } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";

type PresetRow = typeof presets.$inferSelect;

/** A new preset row (the verb mints id + computes timestamps from its injected clock). `ownerId` is null
 *  ONLY for the system-default seed; every owned write passes the resolved `userId`. */
interface PresetInsert {
  id: PresetId;
  ownerId: UserId | null;
  name: string;
  kind: string;
  config: PromptConfig;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** A partial patch over an owned row — only the present keys are written; `updatedAt` is always bumped. */
interface PresetPatch {
  name?: string;
  kind?: string;
  config?: PromptConfig;
  schemaVersion?: number;
  updatedAt: number;
}

export async function insertPreset(db: Db, row: PresetInsert): Promise<void> {
  await db.insert(presets).values(row);
}

/** Read one preset readable by this owner: their own row OR the shared system default. */
export async function readablePreset(db: Db, userId: UserId, id: PresetId): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.id, id), or(eq(presets.ownerId, userId), isNull(presets.ownerId))))
    .limit(1);
  return rows.at(0);
}

/** The owner's library rows PLUS the shared system default, oldest-first (the seeded default sorts first). */
export async function listReadable(db: Db, userId: UserId): Promise<PresetRow[]> {
  return await db
    .select()
    .from(presets)
    .where(or(eq(presets.ownerId, userId), isNull(presets.ownerId)))
    .orderBy(asc(presets.createdAt));
}

/** The owner's own rows only (excludes the un-owned system default), oldest-first. The backup export reads
 *  this — the shared default never travels in a per-owner backup. */
export async function listOwned(db: Db, userId: UserId): Promise<PresetRow[]> {
  return await db.select().from(presets).where(eq(presets.ownerId, userId)).orderBy(asc(presets.createdAt));
}

/** The caller's existing owned preset with this exact `name`, or null — the import dedup key. Newest wins
 *  when names collide. */
export async function findOwnedPresetByName(db: Db, userId: UserId, name: string): Promise<PresetId | null> {
  const rows = await db
    .select({ id: presets.id })
    .from(presets)
    .where(and(eq(presets.ownerId, userId), eq(presets.name, name)))
    .orderBy(desc(presets.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Patch an OWNED row (scoped on `ownerId = userId` — never matches the null-owner system default),
 *  RETURNING the updated row (undefined when nothing matched: missing or not the caller's). */
export async function updatePresetRow(db: Db, id: PresetId, userId: UserId, patch: PresetPatch): Promise<PresetRow | undefined> {
  const updated = await db
    .update(presets)
    .set(patch)
    .where(and(eq(presets.id, id), eq(presets.ownerId, userId)))
    .returning();
  return updated.at(0);
}

/** Delete an OWNED row (scoped on `ownerId = userId`). Returns true iff a row was actually removed. */
export async function deletePreset(db: Db, id: PresetId, userId: UserId): Promise<boolean> {
  const removed = await db
    .delete(presets)
    .where(and(eq(presets.id, id), eq(presets.ownerId, userId)))
    .returning({ id: presets.id });
  return removed.length > 0;
}

/** Read the single system-default row (`id = sentinel AND ownerId IS NULL`) — the seed/reseed read. */
export async function selectSystemDefault(db: Db): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID), isNull(presets.ownerId)))
    .limit(1);
  return rows.at(0);
}

/** Overwrite the system-default row's config + version (the boot reseed; keyed on the sentinel + null
 *  owner so it can never hit an owned row). */
export async function reseedSystemDefault(db: Db, config: PromptConfig, schemaVersion: number, updatedAt: number): Promise<void> {
  await db
    .update(presets)
    .set({ config, schemaVersion, updatedAt })
    .where(and(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID), isNull(presets.ownerId)));
}
