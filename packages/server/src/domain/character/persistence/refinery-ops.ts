// domain/character/persistence/refinery-ops — the character-owned ops the refinery domain consumes
// (R1 — docs/history/design/refinery-r0.md §9.3), the `avatar-link-write.ts` worked-example class: cross-domain
// access routes through the OWNING domain's persistence factory + an injected op, so `characters.*` keeps
// exactly one writer and the card projection (`cardOf` + its parse seams) keeps exactly one home.
//
// The WRITE halves are a named exception to "persistence is queries only", like `avatar-link-write.ts` and
// persona's `import-write.ts`. `createStampRefinerySignals` is SILENT by design: no audit entry, no
// user-bus event, no snapshot — the stamp is a derived-signal refresh (F6), not an authored edit;
// reversibility lives on the APPLY path (`applyFields` snapshots first), never here.
//
// `createDeleteSnapshot` (#1551) is the apply path's OWN retraction, not a new writer of `characters.*`
// generally: `applyFields` snapshots BEFORE its conditional write (the pre-image must be captured while it
// is still live), and a `CHARACTER_STALE_BASIS` refusal from that write leaves the snapshot with nothing to
// witness — this op is how the verb un-does exactly the row it just minted, scoped to its own id.

import { characterSnapshots, characters } from "@orb/db";
import type { SQL } from "drizzle-orm";
import { and, count, eq, exists, sql } from "drizzle-orm";
import type {
  CharacterRefineryOpsContext,
  DeleteSnapshotOp,
  ListRefineryScoreTargetsOp,
  LoadOwnedCardOp,
  RefineryScoreTarget,
  StampRefinerySignalsOp,
} from "../contract/refinery-ops.ts";
import { cardOf, loadOwnedCharacterRow } from "./queries.ts";

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

/** The stored blob a `json_set` may be applied to. `json_set` needs a JSON OBJECT to write a `$.<key>` path
 *  into: on NULL it would yield NULL, on a scalar or on malformed text it would drop the path silently or
 *  raise "malformed JSON". So the expression heals in SQL exactly the way the READ seam heals in zod — an
 *  unusable stored value collapses to the both-halves-null skeleton and the stamp lands on top of it.
 *
 *  THE SKELETON CARRIES BOTH KEYS, not `'{}'`: every other writer of this column (`cardOf` through
 *  `writeCardInPlace`) writes the full `{score, analysis}` object, and a blob missing a key would make the
 *  read parser's `.catch` fire — emitting a `character.refinery.heal` span for a value that was never
 *  corrupt, i.e. turning a normal write into a false telemetry signal. */
const REFINERY_SKELETON = `{"score":null,"analysis":null}`;

function healedRefineryObject(): SQL {
  return sql`case when json_valid(${characters.refinery}) and json_type(${characters.refinery}) = 'object' then ${characters.refinery} else ${REFINERY_SKELETON} end`;
}

/** Build the merge-stamp op. ONE `json_set` on the patched arm's own path — never a read-merge-write of the
 *  whole object. The two halves have INDEPENDENT producers (a score run and an analyze run are legitimate
 *  concurrent workloads), and a read-merge-write means the slower producer writes back the half it read
 *  BEFORE the other producer's write: the loser's stamp is erased with no error anywhere. `db.transaction`
 *  is banned in product code and `batchMany` bans a read ahead of the writes, so the reachable atomic
 *  instrument is a predicate/mutation INSIDE the write statement — here the mutation itself: SQLite applies
 *  `json_set` to the CURRENT row value under the statement's own write lock, so the untouched half is read
 *  and rewritten in the same instant and cannot be stale.
 *
 *  A corrupt stored blob still degrades to the both-halves-null skeleton ({@link healedRefineryObject} —
 *  the SQL twin of the read seam's field-level heal), and the owner predicate rides IN THE WHERE
 *  (injected-op-caller-gate). A zero-row update stays the silent no-op the op's contract promises: foreign
 *  or absent needs no pre-SELECT to detect, because there is nothing to report either way. */
export function createStampRefinerySignals(ctx: CharacterRefineryOpsContext): StampRefinerySignalsOp {
  return async ({ ownerId, characterId, patch }) => {
    // `json(?)` on the analysis arm so the payload lands as a JSON OBJECT rather than as a quoted string
    // (a bound TEXT parameter is a JSON string to `json_set`); the score arm binds a bare number.
    const [path, value] =
      "score" in patch ? (["$.score", sql`${patch.score}`] as const) : (["$.analysis", sql`json(${JSON.stringify(patch.analysis)})`] as const);
    await ctx.db
      .update(characters)
      .set({ refinery: sql`json_set(${healedRefineryObject()}, ${path}, ${value})` })
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)));
  };
}

/** Build the snapshot-retraction op (#1551, owner-scoped per train-78's `injected-op-caller-param`
 *  finding) — a single scoped delete: `characterId` in the WHERE (an op that dropped it would let one
 *  owner's refused apply retract a DIFFERENT character's row if the ids ever collided, which TypeID
 *  collision-freedom makes practically impossible but the WHERE still states for free), PLUS an `owns`
 *  EXISTS subquery over `characters` (the `ownedBackgroundExists` shape in `persistence/card.ts`) —
 *  `character_snapshots` carries no `ownerId` column of its own, so ownership can only be re-asserted
 *  through the join. A foreign owner's retraction deletes nothing (a silent no-op, same as a
 *  zero-row/already-gone delete). */
export function createDeleteSnapshot(ctx: CharacterRefineryOpsContext): DeleteSnapshotOp {
  return async ({ ownerId, snapshotId, characterId }) => {
    const owns = exists(
      ctx.db
        .select({ one: sql`1` })
        .from(characters)
        .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId))),
    );
    await ctx.db.delete(characterSnapshots).where(and(eq(characterSnapshots.id, snapshotId), eq(characterSnapshots.characterId, characterId), owns));
  };
}
