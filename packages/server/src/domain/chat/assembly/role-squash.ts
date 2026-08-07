// domain/chat/assembly/role-squash — the SHAPE-phase adjacent-same-role squash.
//
// Many providers require strict user/assistant alternation (Anthropic hard-errors, Bedrock matches, older
// Gemini drops adjacent messages silently); we squash defensively at every history-shaping boundary. Canon
// is NOT always alternating: a multi-speaker round commits N adjacent assistant rows under one user turn,
// and greet-all seeds every founding character's greeting as adjacent assistant rows — distinct-character
// adjacency is normal group output, not an edge case.
//
// Extra fields on the FIRST of a same-role run are preserved (later entries' extras are dropped). The
// `completion` names-behavior carries the speaker in an out-of-band `name` field, which a merge cannot
// preserve — so two adjacent rows with distinct `name` fields are left un-merged.

import type { RoleHandling } from "@orb/contracts/connection";
import type { MessageRole } from "@orb/kit/message-role";

const ROLE_HANDLING_RANK: Record<RoleHandling, number> = {
  none: 0,
  merge: 1,
  "semi-strict": 2,
  strict: 3,
};

/** The effective strategy = `max(floor, knob)` under the strictness ordering. An unset knob defaults to the
 *  floor; an unset floor defaults to `strict`. */
export function clampRoleHandling(floor: RoleHandling | undefined, knob: RoleHandling | undefined): RoleHandling {
  const floorRank = ROLE_HANDLING_RANK[floor ?? "strict"];
  const knobRank = knob === undefined ? floorRank : ROLE_HANDLING_RANK[knob];
  const winner = Math.max(floorRank, knobRank);
  return (Object.keys(ROLE_HANDLING_RANK) as RoleHandling[]).find((k) => ROLE_HANDLING_RANK[k] === winner) as RoleHandling;
}

/** The separator merged rows are joined with. Matches ST's SERVER-side `mergeMessages` (`'\n\n'`), not its
 *  client pass — see the `INJECT-NAMED-AS-PLAYER` note in `dogfood-tracking.md`. */
const MERGE_SEPARATOR = "\n\n";

/**
 * The adjacency RUNS the squash forms over `history`: one entry per DELIVERED row, listing the INPUT INDICES
 * that fold into it. Empty/whitespace-only inputs are dropped and appear in no run, so `Σ run.length` can be
 * less than `history.length`.
 *
 * This is the ONE home of the adjacency rule — {@link squashSameRole} is exactly this plus the content join.
 * It is exported because SHAPE's content-free row trace (`ShapeTrace.rows`) has to answer "which inputs became
 * THIS delivered row" to report a merged row's provenance honestly: a squash that folds an injected row into
 * an adjacent canon turn is precisely the INJECT-NAMED-AS-PLAYER shape, and re-deriving the rule at the trace
 * would be a second home free to drift from the wire it claims to describe.
 */
export function squashRuns<T extends { role: MessageRole; content: string; name?: string }>(history: readonly T[]): readonly (readonly number[])[] {
  const runs: number[][] = [];
  history.forEach((msg, index) => {
    if (msg.content.trim().length === 0) {
      return;
    }
    const openRun = runs.at(-1);
    const head = openRun === undefined ? undefined : history[openRun[0] ?? -1];
    if (openRun !== undefined && head !== undefined && head.role === msg.role && !distinctCompletionName(head, msg)) {
      openRun.push(index);
      return;
    }
    runs.push([index]);
  });
  return runs;
}

/** Squash adjacent same-role messages into one by concatenating content with a blank-line separator.
 *  Drops empty/whitespace-only items before squashing. The first row of a same-role run keeps its extra
 *  fields; merged-in rows contribute only their content. Two adjacent rows carrying distinct completion
 *  `name` fields are not merged. `system` rows (capability-kept depth-0 injections) merge only with each
 *  other — a system row never folds into a user/assistant neighbor. */
export function squashSameRole<T extends { role: MessageRole; content: string; name?: string }>(history: readonly T[]): T[] {
  const result: T[] = [];
  for (const run of squashRuns(history)) {
    const rows = run.flatMap((index) => history[index] ?? []);
    const head = rows[0];
    if (head === undefined) {
      continue;
    }
    result.push(rows.length === 1 ? head : { ...head, content: rows.map((row) => row.content).join(MERGE_SEPARATOR) });
  }
  return result;
}

/** Two rows carry different OpenAI-spec `name` fields (both set, unequal). Absent or equal ⇒ mergeable. */
function distinctCompletionName(a: { name?: string }, b: { name?: string }): boolean {
  return a.name !== undefined && b.name !== undefined && a.name !== b.name;
}
