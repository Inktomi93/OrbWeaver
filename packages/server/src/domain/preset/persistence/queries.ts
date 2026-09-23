// All `presets`-table access (queries only). User-scoped: reads are the two-armed "owner's row OR the
// system default"; owned writes scope on `ownerId = userId`. The system default's own lifecycle has its
// dedicated key-on-sentinel queries. Timestamps arrive as params.
//
// THE CONFIG COLUMN HAS TWO WRITE SEAMS, split by PROVENANCE (#1026): `updatePresetRow` carries a patch
// that DESCENDS FROM A READ of the row (the editor's whole-blob PUT) and is guarded by the #471 refusal;
// `replacePresetConfig` carries content independent of the row (the schema default, an imported file) and
// is deliberately unguarded. Each function states its own half.

import type { PromptConfig } from "@orb/contracts/preset";
import { promptConfigConfig } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { requireIntactStoredConfig } from "#kit/stored-config";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";

type PresetRow = typeof presets.$inferSelect;

/** A new preset row (the verb mints id + computes timestamps from its injected clock). `ownerId` is null
 *  ONLY for the system-default seed; every owned write passes the resolved `userId`. `forkedFrom` is
 *  REQUIRED (never optional) so every mint states its lineage — a copy names its source, a born-here row
 *  passes null; a new mint site cannot silently drop the provenance. */
interface PresetInsert {
  id: PresetId;
  ownerId: UserId | null;
  name: string;
  kind: string;
  config: PromptConfig;
  schemaVersion: number;
  forkedFrom: PresetId | null;
  createdAt: number;
  updatedAt: number;
}

interface ConvergedPresetInsert extends PresetInsert {
  ownerId: UserId;
  forkedFrom: PresetId;
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

/** Admit the first converged fork for an owner/source pair, or refuse (undefined) because one already exists.
 *  The uniqueness claim is the INSERT's own guard subquery — never a preceding read — so concurrent callers
 *  cannot both pass it. The pair stays non-unique in the SCHEMA because explicit new forks are legal
 *  (`clonePackaged` per call, the update verb's `{mode:"new"}`); this statement narrows uniqueness to the two
 *  CONVERGING admission paths: the COW converge arm (`verbs/update.ts`) and the host-handoff copy
 *  (`handoff-copy-write.ts`, #1572). A refused caller reads the winner back with `findOwnedForkOf`. */
export async function insertConvergedPresetForkIfAbsent(db: Db, row: ConvergedPresetInsert): Promise<PresetRow | undefined> {
  const inserted = await db
    .insert(presets)
    .select(
      db
        .select({
          id: sql<PresetId>`${row.id}`.as("id"),
          ownerId: sql<UserId | null>`${row.ownerId}`.as("owner_id"),
          name: sql<string>`${row.name}`.as("name"),
          kind: sql<string>`${row.kind}`.as("kind"),
          config: sql<PromptConfig>`${JSON.stringify(row.config)}`.as("config"),
          schemaVersion: sql<number>`${row.schemaVersion}`.as("schema_version"),
          forkedFrom: sql<PresetId | null>`${row.forkedFrom}`.as("forked_from"),
          createdAt: sql<number>`${row.createdAt}`.as("created_at"),
          updatedAt: sql<number>`${row.updatedAt}`.as("updated_at"),
        })
        .from(sql`(select 1)`)
        .where(
          notExists(
            db
              .select({ id: presets.id })
              .from(presets)
              .where(and(eq(presets.ownerId, row.ownerId), eq(presets.forkedFrom, row.forkedFrom))),
          ),
        ),
    )
    .returning();
  return inserted.at(0);
}

/** Read one preset readable by this owner: their own row OR the shared system default. The shared arm keys on
 *  the sentinel id (NOT `ownerId IS NULL`) so ownerless PACKAGED template rows stay unreadable here — they are
 *  clone sources, reached only via `selectPackagedPreset`. */
export async function readablePreset(db: Db, userId: UserId, id: PresetId): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.id, id), or(eq(presets.ownerId, userId), eq(presets.id, SYSTEM_DEFAULT_PRESET_ID))))
    .limit(1);
  return rows.at(0);
}

/** The owner's library rows PLUS the shared system default, oldest-first (the seeded default sorts first). The
 *  shared arm keys on the sentinel id (NOT `ownerId IS NULL`) so PACKAGED template rows never leak into a
 *  user's picker. */
export async function listReadable(db: Db, userId: UserId): Promise<PresetRow[]> {
  return await db
    .select()
    .from(presets)
    .where(or(eq(presets.ownerId, userId), eq(presets.id, SYSTEM_DEFAULT_PRESET_ID)))
    .orderBy(asc(presets.createdAt));
}

/** The owner's own rows only (excludes the un-owned system default), oldest-first. The backup export reads
 *  this — the shared default never travels in a per-owner backup. */
export async function listOwned(db: Db, userId: UserId): Promise<PresetRow[]> {
  return await db.select().from(presets).where(eq(presets.ownerId, userId)).orderBy(asc(presets.createdAt));
}

/** Every name the caller's OWN rows carry — the mint-time de-collision scan (`uniquePresetName`). Names
 *  only: the numbering decision needs no config blobs, so this never reads the heavy rows. */
export async function listOwnedPresetNames(db: Db, userId: UserId): Promise<string[]> {
  const rows = await db.select({ name: presets.name }).from(presets).where(eq(presets.ownerId, userId));
  return rows.map((row) => row.name);
}

/** The caller's OLDEST owned fork of `sourceId` (`forked_from` lineage), or undefined — the copy-on-write
 *  convergence lookup (`verbs/update.ts`): a second COW of the same source patches this row instead of
 *  minting a sibling. Oldest-first so the answer stays stable if a pre-existing race already left two. */
export async function findOwnedForkOf(db: Db, userId: UserId, sourceId: PresetId): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.ownerId, userId), eq(presets.forkedFrom, sourceId)))
    .orderBy(asc(presets.createdAt), asc(presets.id))
    .limit(1);
  return rows.at(0);
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
 *  RETURNING the updated row (undefined when nothing matched: missing or not the caller's).
 *
 *  THE #471 WRITE BOUNDARY, one hop out (#1026). This is the seam a READ-DERIVED patch crosses: the preset
 *  editor GETs a config through the lenient read seam (`substrate/views.ts::toPresetDetail` →
 *  `parsePromptConfig`, which degrades an unreadable blob to `DEFAULT_PROMPT_CONFIG`) and PUTs the whole
 *  blob back, so a stored blob this build cannot read would come back as the stand-in and overwrite the
 *  real one. When the patch carries `config`, the row is re-read and the write REFUSES
 *  (`stored_config_unreadable`) unless the stored blob is intact.
 *
 *  THE GUARD IS SCOPED TO THE CONFIG WRITE, deliberately: a name/kind-only patch cannot lose the blob, so
 *  an unreadable row stays RENAMEABLE — the refusal costs the config write, not the whole row. And a write
 *  whose content does NOT descend from the stored blob (the reset verb's schema default, an imported backup
 *  file) is not this function's job at all: it goes through {@link replacePresetConfig}, because refusing
 *  the user's own explicit replacement would close the only in-place repair a corrupt preset has while
 *  buying no protection. `#kit/stored-config` carries the full reasoning + the tradeoff. */
export async function updatePresetRow(db: Db, id: PresetId, userId: UserId, patch: PresetPatch): Promise<PresetRow | undefined> {
  if (patch.config !== undefined) {
    const stored = await db
      .select({ config: presets.config, schemaVersion: presets.schemaVersion })
      .from(presets)
      .where(and(eq(presets.id, id), eq(presets.ownerId, userId)))
      .limit(1);
    const row = stored.at(0);
    // An ABSENT row (missing, or not the caller's) has no blob to lose — the UPDATE below simply matches
    // nothing and returns undefined, which is this function's existing not-found contract.
    if (row !== undefined) {
      requireIntactStoredConfig(promptConfigConfig.parseOutcome(row.config, row.schemaVersion), `presets.config for ${id}`);
    }
  }
  const updated = await db
    .update(presets)
    .set(patch)
    .where(and(eq(presets.id, id), eq(presets.ownerId, userId)))
    .returning();
  return updated.at(0);
}

/** Replace an OWNED row's config with content that does NOT descend from the stored blob — the reset verb's
 *  `DEFAULT_PROMPT_CONFIG` and the import verb's parsed backup file. Same owner scoping as
 *  {@link updatePresetRow}; RETURNS the row (undefined when nothing matched).
 *
 *  SEPARATE FROM `updatePresetRow` ON PURPOSE (#1026, Core-0-Architecture-and-Structure.md §6 "one folder, two jobs = split"): the
 *  #471 guard's premise is that the write DESCENDS FROM A READ of the row it replaces, and neither of these
 *  callers reads it. Guarding them would refuse a reset/import over a corrupt preset — the user's own
 *  explicit repair, and the affordance the guarded editor path tells them to reach for — while preventing
 *  no silent loss. The exemption is recorded two-sidedly in `json-column-write-parity`'s GUARD_EXEMPT
 *  table, so a future caller that starts merging onto the stored value turns the row RED. */
export async function replacePresetConfig(
  db: Db,
  id: PresetId,
  userId: UserId,
  replacement: { config: PromptConfig; schemaVersion: number; updatedAt: number },
): Promise<PresetRow | undefined> {
  const updated = await db
    .update(presets)
    .set(replacement)
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

/** Read a PACKAGED template row (`id = <well-known> AND ownerId IS NULL`) — the boot seed read AND the
 *  `clonePackaged` source read. Keyed on the reserved id + null owner so it can never hit an owned row. */
export async function selectPackagedPreset(db: Db, id: PresetId): Promise<PresetRow | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.id, id), isNull(presets.ownerId)))
    .limit(1);
  return rows.at(0);
}

/** Overwrite a PACKAGED template row's name/kind/config/version (the boot reseed; keyed on its reserved id +
 *  null owner). Name/kind ride the registry, so a reseed re-stamps them alongside the config. */
export async function reseedPackagedPreset(
  db: Db,
  id: PresetId,
  patch: { name: string; kind: string; config: PromptConfig; schemaVersion: number; updatedAt: number },
): Promise<void> {
  await db
    .update(presets)
    .set(patch)
    .where(and(eq(presets.id, id), isNull(presets.ownerId)));
}
