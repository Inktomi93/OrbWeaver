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
import { and, count, eq, sql } from "drizzle-orm";
import type {
  CharacterRefineryOpsContext,
  ListRefineryScoreTargetsOp,
  LoadOwnedCardOp,
  RefineryScoreTarget,
  StampRefinerySignalsOp,
} from "../contract/refinery-ops.ts";
import { cardOf, loadOwnedCharacterRow, refinerySignalsReadParser } from "./queries.ts";

/** Build the owned-card read op — `loadOwnedCharacterRow` (owner IN the WHERE) + the one-homed `cardOf`
 *  projection. Absent and foreign collapse to `undefined` (the consumer's leak-free not-found). */
export function createLoadOwnedCard(ctx: CharacterRefineryOpsContext): LoadOwnedCardOp {
  return async ({ ownerId, characterId }) => {
    const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    return row === undefined ? undefined : cardOf(row);
  };
}

/** Build the sweep's enumeration op (R4). The owner narrow rides IN THE WHERE when one is given; `null` is
 *  the deliberate box-wide bulk scope (the workload engine's own `ownerId: null` contract), which is why this
 *  op takes `UserId | null` rather than defaulting to "everything" on a dropped argument.
 *
 *  The unscored filter is SQL, not a post-filter: `json_extract` reads the stamp the sweep itself writes, and
 *  the FILL arm exists precisely so a 500-card library does not pay 500 model calls to re-score 497 cards it
 *  already knows. `is null` covers both an absent blob and a stored `"score": null` — one fact, "not scored". */
export function createListRefineryScoreTargets(ctx: CharacterRefineryOpsContext): ListRefineryScoreTargetsOp {
  return async ({ ownerId, unscoredOnly }) => {
    const scope = ownerId === null ? eq(characters.synthetic, false) : and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false));
    const where = unscoredOnly ? and(scope, sql`json_extract(${characters.refinery}, '$.score') is null`) : scope;
    // The candidate COUNT rides the same scope minus the unscored narrow — one cheap aggregate, so the
    // sweep can say "500 in scope, 497 already scored" instead of "scanned 0".
    const [rows, counted] = await Promise.all([
      ctx.db.select().from(characters).where(where),
      ctx.db.select({ inScope: count() }).from(characters).where(scope),
    ]);
    return {
      targets: rows.map((row): RefineryScoreTarget => ({ characterId: row.id, ownerId: row.ownerId, card: cardOf(row) })),
      inScope: counted[0]?.inScope ?? 0,
    };
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
