// domain/character/persistence/refinery-ops — the two character-owned ops the refinery domain consumes
// (R1 — docs/design/refinery-r0.md §9.3), the `avatar-link-write.ts` worked-example class: cross-domain
// access routes through the OWNING domain's persistence factory + an injected op, so `characters.*` keeps
// exactly one writer and the card projection (`cardOf` + its parse seams) keeps exactly one home.
//
// The WRITE half is a named exception to "persistence is queries only", like `avatar-link-write.ts` and
// persona's `import-write.ts`. SILENT by design: no audit entry, no user-bus event, no snapshot — the
// stamp is a derived-signal refresh (F6), not an authored edit; reversibility lives on the APPLY path
// (`applyFields` snapshots first), never here.

import type { RefinerySignals } from "@orb/contracts/character";
import { characters } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { CharacterRefineryOpsContext, LoadOwnedCardOp, StampRefinerySignalsOp } from "../contract/refinery-ops.ts";
import { cardOf, loadOwnedCharacterRow, refinerySignalsReadParser } from "./queries.ts";

/** Build the owned-card read op — `loadOwnedCharacterRow` (owner IN the WHERE) + the one-homed `cardOf`
 *  projection. Absent and foreign collapse to `undefined` (the consumer's leak-free not-found). */
export function createLoadOwnedCard(ctx: CharacterRefineryOpsContext): LoadOwnedCardOp {
  return async ({ ownerId, characterId }) => {
    const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    return row === undefined ? undefined : cardOf(row);
  };
}

/** Build the merge-stamp op. Read-merge-write over the JSON column: the patched arm replaces its half,
 *  the OTHER half survives verbatim (the field-level independence the read heal guarantees — a corrupt
 *  stored half degrades to null through the same observable parser the read seam uses, one home). Both
 *  the read and the write carry the owner predicate in the WHERE (injected-op-caller-gate). */
export function createStampRefinerySignals(ctx: CharacterRefineryOpsContext): StampRefinerySignalsOp {
  return async ({ ownerId, characterId, patch }) => {
    const rows = await ctx.db
      .select({ refinery: characters.refinery })
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
      .limit(1);
    if (rows.length === 0) {
      // Foreign or absent — the verb's ownership belt already threw for the caller; this arm is the
      // defense-in-depth no-op (never an existence signal from an op).
      return;
    }
    const current = refinerySignalsReadParser.parse(rows[0]?.refinery) ?? { score: null, analysis: null };
    const next: RefinerySignals = "score" in patch ? { ...current, score: patch.score } : { ...current, analysis: patch.analysis };
    await ctx.db
      .update(characters)
      .set({ refinery: next })
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)));
  };
}
