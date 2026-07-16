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

/** Squash adjacent same-role messages into one by concatenating content with a blank-line separator.
 *  Drops empty/whitespace-only items before squashing. The first row of a same-role run keeps its extra
 *  fields; merged-in rows contribute only their content. Two adjacent rows carrying distinct completion
 *  `name` fields are not merged. */
export function squashSameRole<T extends { role: "user" | "assistant"; content: string; name?: string }>(history: readonly T[]): T[] {
  const result: T[] = [];
  for (const msg of history) {
    if (msg.content.trim().length === 0) {
      continue;
    }
    const last = result.at(-1);
    if (last !== undefined && last.role === msg.role && !distinctCompletionName(last, msg)) {
      result[result.length - 1] = { ...last, content: `${last.content}\n\n${msg.content}` };
      continue;
    }
    result.push(msg);
  }
  return result;
}

/** Two rows carry different OpenAI-spec `name` fields (both set, unequal). Absent or equal ⇒ mergeable. */
function distinctCompletionName(a: { name?: string }, b: { name?: string }): boolean {
  return a.name !== undefined && b.name !== undefined && a.name !== b.name;
}
