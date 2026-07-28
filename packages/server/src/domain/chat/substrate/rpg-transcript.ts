// domain/chat/substrate/rpg-transcript — the PURE canon → rpg-transcript projection (crunchy-cluster §1.3).
// Zero I/O. The ONE shared builder both the ENGINE (`fireRpgTurnCompleted`'s in-turn thread) and the
// `resolveCanonWindow` chat op (the `resyncFromStory` deep window) project through, so the two feeds can never
// drift — the state round and the resync read the story the SAME way. Projects a name-stamped, token-measured
// `RpgTurnTranscriptMessage[]`, oldest→newest; hidden-class spans stay INTACT (the round is model-plane, the
// model always reads its own lies, D110 §3.6 — the member never sees this read). System rows are kept (the rpg
// consumer decides — the window knob is rpg's). The name-stamp resolves against the caller's `HistoryMacroNames`
// producer (built from the same canon), so transcript names match the wire.

import type { MessageView } from "@orb/contracts/chat";
import { estimateTokens } from "@orb/kit/tokens";
import type { RpgTurnTranscriptMessage } from "../contract/context";
import type { HistoryMacroNames } from "../contract/results";

/** Resolve a canon row's name-stamp: assistant → its stamped character name; user → its stamped persona name;
 *  system → null (no speaker). A null/unresolvable stamp yields null (the consumer renders "You"/an unnamed
 *  speaker). Mirrors the engine's per-turn `transcriptSpeakerName` exactly (they share this module now). */
function transcriptSpeakerName(m: MessageView, names: HistoryMacroNames): string | null {
  if (m.role === "assistant") {
    return m.characterId !== null ? (names.characterNamesById.get(m.characterId)?.name ?? null) : null;
  }
  if (m.role === "user") {
    return m.personaId !== null ? (names.personaNamesById.get(m.personaId)?.name ?? null) : null;
  }
  return null;
}

/** Project a canon-row set into the name-stamped, token-measured transcript (oldest→newest). The caller supplies
 *  the rows in chronological order (the engine appends the just-committed reply itself; the resolveCanonWindow op
 *  reads `loadCanonHistory`'s asc order). */
export function projectRpgTranscript(rows: readonly MessageView[], names: HistoryMacroNames): RpgTurnTranscriptMessage[] {
  return rows.map((m) => ({
    role: m.role,
    speakerName: transcriptSpeakerName(m, names),
    content: m.content,
    tokens: estimateTokens(m.content),
  }));
}

/** Slice a chronological transcript to the last `maxTokens` of story (whole messages, newest-first fill, then
 *  restored to oldest→newest). Always keeps at least one message when the transcript is non-empty (a single huge
 *  beat degrades to one message, never truncated mid-utterance). The `resolveCanonWindow` deep-read budget. */
export function sliceCanonWindow(transcript: readonly RpgTurnTranscriptMessage[], maxTokens: number): RpgTurnTranscriptMessage[] {
  const kept: RpgTurnTranscriptMessage[] = [];
  let used = 0;
  for (let i = transcript.length - 1; i >= 0; i--) {
    const row = transcript[i];
    if (row === undefined) {
      continue;
    }
    if (used + row.tokens > maxTokens && kept.length > 0) {
      break; // budget spent (keep at least one message so a non-empty window is never empty)
    }
    kept.push(row);
    used += row.tokens;
  }
  kept.reverse();
  return kept;
}
