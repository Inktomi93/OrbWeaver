// domain/preset/persistence/handoff-copy-write — the preset-owned generation-config copy the host-handoff
// property offer executes. A named exception to "persistence is queries only" (the character/world-info
// handoff-copy siblings): the `presets` table is preset's, and neither chat nor rpg may write it. The WHY is
// in `../contract/handoff-copy.ts`; this file is the mechanism.
//
// The source read is OWNED, not READABLE: `loadOwnedPreset` scopes on `ownerId = fromOwnerId` and therefore
// excludes the shared system default on purpose — the recipient can already read that one, so "copying" it
// would mint a pointless private duplicate of a row nobody needs a copy of.
//
// IDEMPOTENCE IS A PROPERTY OF THE WRITE, NOT OF A PRIOR READ (#1572). This used to look up the recipient's
// existing fork and only then insert — a find-before-mint whose window two concurrent accepts of one offer
// both passed, handing the recipient two copies of one gift. The lineage claim now rides the INSERT's own
// guard subquery (`insertConvergedPresetForkIfAbsent`), so a losing accept writes nothing and reads the
// winner back instead. The `(owner_id, forked_from)` pair stays deliberately NON-unique in the schema
// (`db/schema/preset.ts`) because `clonePackaged` and the update verb's `{mode:"new"}` both mint legal
// siblings of one source; admission is therefore verb-scoped, exactly as the COW converge arm does it.

import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { CopyPresetToUser, PresetHandoffCopyContext } from "../contract/handoff-copy.ts";
import { findOwnedForkOf, insertConvergedPresetForkIfAbsent } from "./queries.ts";

const LIMIT_ONE = 1;

/** The source row under the DEPARTING host's ownership — the gift's authority. */
async function loadOwnedPreset(db: Db, ownerId: UserId, presetId: PresetId): Promise<typeof presets.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(presets)
    .where(and(eq(presets.id, presetId), eq(presets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

export function createCopyPresetToUser(ctx: PresetHandoffCopyContext): CopyPresetToUser {
  return async ({ fromOwnerId, toUserId, presetId }): Promise<PresetId | null> => {
    const { db } = ctx;
    const source = await loadOwnedPreset(db, fromOwnerId, presetId);
    if (source === undefined) {
      return null;
    }
    const id = ctx.newPresetId();
    const at = ctx.now();
    const admitted = await insertConvergedPresetForkIfAbsent(db, {
      id,
      ownerId: toUserId,
      name: source.name,
      kind: source.kind,
      config: source.config,
      schemaVersion: source.schemaVersion,
      // Lineage names the source AND is the convergence key. Deliberately the SOURCE id, not the source's
      // own `forkedFrom`: the recipient's copy descends from the row that was actually given to them.
      forkedFrom: presetId,
      createdAt: at,
      updatedAt: at,
    });
    if (admitted !== undefined) {
      return admitted.id;
    }
    // Refused: a concurrent or earlier accept already made this copy. Claim it — an accept converges, it
    // never surfaces the race. Undefined only if that winner was deleted between the write and this read,
    // in which case the offer has nothing to point at and the caller falls back to the conditional heal.
    return (await findOwnedForkOf(db, toUserId, presetId))?.id ?? null;
  };
}
