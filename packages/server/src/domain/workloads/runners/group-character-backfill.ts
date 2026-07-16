// runner: group-character-backfill (PD-41/D38) — mint the synthetic group character for every
// >1-character room that lacks one. Wraps `ctx.env.character.backfillGroupCharacters` (chat's sweep —
// idempotent via the find-first short-circuit; owner = the room HOST, D19).

import type { Runner } from "../contract/runner";

export const groupCharacterBackfillRunner: Runner<"group-character-backfill"> = async (ctx, _params, report, signal) => {
  report({ message: "group-character backfill: sweeping group rooms" });
  const counts = await ctx.env.character.backfillGroupCharacters({ ownerId: ctx.ownerId, signal });
  report({
    message: `group-character backfill: ${counts.scanned} group rooms scanned, ${counts.changed} minted`,
  });
  return counts;
};
