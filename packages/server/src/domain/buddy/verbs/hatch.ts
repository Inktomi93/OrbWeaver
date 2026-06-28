// verb: hatch — snapshot the rolled bones + a model-authored soul into the caller's buddy row.
// Idempotent: re-hatching returns the existing buddy unchanged. The `loadBuddy` null-guard is
// check-then-act, so two concurrent first-hatch calls can both pass it then race to INSERT — `buddies`
// PK is `userId`, so the loser's insert throws a constraint violation, which we translate by reloading
// the winner's row (both callers see the same soul, the one that landed first). Owner-scoped.

import { isConstraintViolation } from "@orb/db";
import type { HatchBuddyParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { insertBuddy, loadBuddy, rowToView } from "../persistence/queries";
import { roll } from "../substrate/roll";
import { generateSoul } from "../substrate/soul";

export function createHatch(ctx: BuddyContext): BuddyService["hatch"] {
  return async (params: HatchBuddyParams) => {
    const userId = params.principal.userId;
    const existing = await loadBuddy(ctx.db, userId);
    if (existing !== null) {
      return rowToView(existing);
    }

    const { bones, inspirationSeed } = roll(userId);
    const soul = await generateSoul(ctx.roleClients, bones, inspirationSeed);
    const createdAt = ctx.now();
    const row = {
      userId,
      name: soul.name,
      personality: soul.personality,
      rarity: bones.rarity,
      species: bones.species,
      eye: bones.eye,
      hat: bones.hat,
      shiny: bones.shiny,
      stats: bones.stats,
      createdAt,
    };

    try {
      await insertBuddy(ctx.db, row);
    } catch (err) {
      if (isConstraintViolation(err)) {
        const winner = await loadBuddy(ctx.db, userId);
        if (winner !== null) {
          return rowToView(winner);
        }
      }
      throw err;
    }
    // Re-read the winner so the derived facets project from the persisted row (defaults applied).
    const hatched = await loadBuddy(ctx.db, userId);
    if (hatched === null) {
      throw new Error("buddy hatch insert succeeded but row not found");
    }
    return rowToView(hatched);
  };
}
