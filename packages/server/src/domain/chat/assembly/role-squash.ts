// domain/chat/assembly/role-squash — the SHAPE-phase adjacent-same-role squash.
//
// Wire-shape concern: many providers require strict user/assistant alternation. Anthropic's
// chat-completions endpoint hard-errors on adjacent same-role messages; Bedrock matches; older Gemini
// drops adjacent messages silently. We squash defensively at every history-shaping boundary so a chat
// that flips runners mid-life never ships a malformed history. Canon itself is normally clean (every
// send writes one user + one assistant), so adjacency only appears from: an `in_chat` injection whose
// role matches its splice neighbor, the egocentric scoped fold (castmates' turns collapse to user),
// and the synthetic trailing nudge/continuation turn.
//
// ONE helper applied at every shaping boundary keeps this from drifting per-site. Generic over the row
// shape so every SHAPE stage (canon rows carrying authorName/characterId, plain injection rows) reuses
// the same pass. Extra fields on the FIRST of a same-role run are PRESERVED (later entries' extras are
// dropped) — the "first wins" semantics the downstream name-stamp (`authorName`) and breakpoint math
// rely on.

/** Squash adjacent same-role messages into one by concatenating content with a blank-line separator.
 *  Drops empty / whitespace-only items before squashing. The first row of a same-role run keeps its
 *  extra fields (e.g. `authorName`/`characterId`); merged-in rows contribute only their content. */
export function squashSameRole<T extends { role: "user" | "assistant"; content: string }>(
  history: readonly T[],
): T[] {
  const result: T[] = [];
  for (const msg of history) {
    if (msg.content.trim().length === 0) {
      continue;
    }
    const last = result.at(-1);
    if (last !== undefined && last.role === msg.role) {
      result[result.length - 1] = { ...last, content: `${last.content}\n\n${msg.content}` };
      continue;
    }
    result.push(msg);
  }
  return result;
}
