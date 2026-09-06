// domain/preset/persistence/migrate-prose-slot-vocab — the #1737 PROSE-SLOT ID vocabulary DATA migration
// (owner-ruled 2026-09-05, arm (a)), the `migrateHandoffOfferVocab` shape one table over.
//
// WHY PRESET OWNS IT. A `home: "preset"` prose slot's host override is stored inside `presets.config`
// (`promptConfig.prose`, keyed by slot id — `contracts/preset` `promptConfigSchema.prose`), and the `presets`
// table is preset's alone. The renamed slot is a CHAT slot, but the storage is preset's, so the rewrite lives
// here for the same reason `handoff-copy-write` does: neither chat nor rpg may write this table.
//
// WHY A DATA MIGRATION AND NOT A READ-COMPAT SHIM. `proseOverridesSchema`'s preprocess STRIPS any key that is
// not a live `ProseSlotId` before the record schema sees it (it must — a retired id may not make a whole
// stored blob unparseable, §4.4 rung 5). So the instant the id is renamed, an un-migrated override under the
// old id does not fail loudly: it VANISHES at the parse seam, the shipped default rides, and the host's
// authored narrator character heading is gone with no signal anywhere. That silent-loss shape is exactly what
// #1649 ruled against, and the ruling recorded in the slot's own header (`contracts/chat/prose.ts`, 2026-08-30)
// SURVIVES with its input changed: it warned that a SILENT id edit would strand every host's `baseVersion`
// stamp, and this rewrite carries the whole `{text, baseVersion}` record across, stamp intact.
//
// NO DDL: `presets.config` is a plain TEXT column and only a JSON KEY inside it moved, so there is nothing for
// `0000_baseline.sql` to carry and a baseline regen would not rewrite a single row (Tier-1-DB §"Regime 1").
//
// ONE statement per renamed id, evaluated against the row under its own write lock — never a read-merge-write:
//  • IDEMPOTENT BY PREDICATE — the WHERE fires only on a config that still carries the OLD path and the SET
//    removes it, so the second and every later boot match zero rows. No marker column, which would be a second
//    source of truth able to disagree with the data.
//  • STAMP-CARRYING — the whole override VALUE is moved by `json_extract`, so `baseVersion` (the ONLY
//    staleness signal, PROSE-1 §4.4) crosses with the text rather than being re-minted.
//  • SIBLING-PRESERVING — no other key is named by the statement, so every other prose override, every
//    section, and every param survives. SQLite's json functions re-serialize the object, so KEY ORDER is not
//    preserved; the blob is parsed by `parsePromptConfig` at every read seam and never compared as bytes.
//  • FAIL-OPEN ON GARBAGE — a config that is not JSON at all is left for the read seam's own degrade-to-
//    default; see the `json_valid` note on the predicate for why that guard is NESTED rather than a sibling
//    AND term.
//
// The value is NOT re-minted through `json(...)` (the #1649 boolean hazard): the override is an OBJECT, and
// `json_extract`'s object result is a documented JSON-subtyped value that `json_set` inserts as JSON, not as a
// string. `json()` would be actively worse here — it RAISES on a non-JSON text, which for a corrupt scalar
// override would abort boot, the one thing this step must never do.

import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import { sql } from "drizzle-orm";

/** The #1737 rename, as the two JSON paths the rewrite moves an override between. Spelled as paths rather
 *  than as `ProseSlotId`s on purpose: the OLD id is no longer a member of the union, and a migration's whole
 *  job is to name a spelling the live type system has already forgotten. */
const OLD_PROSE_PATH = '$.prose."chat.group.castMember"';
const NEW_PROSE_PATH = '$.prose."chat.group.characterHeading"';

/** Re-key every pre-#1737 `promptConfig.prose` override from `chat.group.castMember` to
 *  `chat.group.characterHeading`, carrying its `baseVersion` stamp. Returns the number of preset rows
 *  rewritten — 0 on every boot after the first, and on a db that never carried the old spelling. */
export async function migrateProseSlotVocab(db: Db): Promise<number> {
  const rows = await db
    .update(presets)
    .set({
      config: sql`json_remove(json_set(${presets.config}, ${NEW_PROSE_PATH}, json_extract(${presets.config}, ${OLD_PROSE_PATH})), ${OLD_PROSE_PATH})`,
    })
    // The `json_valid` guard is INSIDE `json_type`'s first argument, not a sibling AND term: SQLite may
    // reorder AND operands, and `json_type` on a non-JSON string RAISES — which at this call site would abort
    // boot on one corrupt row. A blob that is not JSON resolves to `'{}'`, matches nothing, and is left for
    // `parsePromptConfig`'s degrade-to-`DEFAULT_PROMPT_CONFIG`.
    .where(sql`json_type(CASE WHEN json_valid(${presets.config}) THEN ${presets.config} ELSE '{}' END, ${OLD_PROSE_PATH}) is not null`)
    .returning({ id: presets.id });
  return rows.length;
}
