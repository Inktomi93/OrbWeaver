// domain/chat/assembly/role-squash — the SHAPE-phase adjacent-same-role squash.
//
// Wire-shape concern: many providers require strict user/assistant alternation. Anthropic's
// chat-completions endpoint hard-errors on adjacent same-role messages; Bedrock matches; older Gemini
// drops adjacent messages silently. We squash defensively at every history-shaping boundary so a chat
// that flips runners mid-life never ships a malformed history. Canon is NOT always alternating: a group
// MULTI-SPEAKER round commits N adjacent assistant rows under one user turn, and the `greet-all` opening
// seeds every founding character's greeting as adjacent assistant rows from seq 1 — so distinct-character
// adjacency is the NORMAL group output, not an edge case. Adjacency also appears from an `in_chat`
// injection whose role matches its splice neighbor, the egocentric scoped fold (castmates' turns collapse
// to user), and the synthetic trailing nudge/continuation turn.
//
// ONE helper applied at every shaping boundary keeps this from drifting per-site. Generic over the row
// shape so every SHAPE stage (canon rows carrying authorName/characterId, plain injection rows) reuses
// the same pass. Extra fields on the FIRST of a same-role run are PRESERVED (later entries' extras are
// dropped) — the "first wins" semantics the breakpoint math + the reported `squashed` stage rely on. The
// name-stamp now runs BEFORE the FINAL squash (shape.ts), so the per-character `Name:` prefix already
// sits IN each row's content when adjacent group rows merge (`"Aria: …\n\nKai: …"`, F2) — merging no
// longer drops a speaker's label. AUTHOR-AWARE: the `completion` names-behavior carries the speaker in an
// out-of-band `name` field (one speaker per OpenAI message), which a merge CANNOT preserve — so two
// adjacent rows with DISTINCT `name` fields are left un-merged (attribution survives; content-labeled and
// same-speaker runs still merge cleanly).

/** Squash adjacent same-role messages into one by concatenating content with a blank-line separator.
 *  Drops empty / whitespace-only items before squashing. The first row of a same-role run keeps its
 *  extra fields (e.g. `authorName`/`characterId`); merged-in rows contribute only their content. Two
 *  adjacent rows carrying DISTINCT completion `name` fields are NOT merged (the `name` is a per-message
 *  speaker the merge would silently drop — F2). */
export function squashSameRole<
  T extends { role: "user" | "assistant"; content: string; name?: string },
>(history: readonly T[]): T[] {
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

/** Two rows carry DIFFERENT OpenAI-spec `name` fields (both set, unequal) — a `completion`-mode boundary
 *  the squash must not cross (a merge keeps only the first row's `name`, silently dropping the second
 *  speaker's attribution). An absent or equal `name` on either side → mergeable (default/content modes
 *  label in content and set no `name`; a genuine same-speaker run shares its `name`). */
function distinctCompletionName(a: { name?: string }, b: { name?: string }): boolean {
  return a.name !== undefined && b.name !== undefined && a.name !== b.name;
}
