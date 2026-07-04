// Splits a SETTLED message body on `<speaker>NAME</speaker>` markers (the `@orb/kit/speaker-label`
// format, §12.4) into ordered `{speaker, text}` spans. Zero markers is the load-bearing no-op:
// exactly ONE `{speaker: null}` span whose `text` is byte-identical to `content` — the caller
// (message-content.tsx) uses that single-span shape as the signal to render through the untouched
// pre-#21 path.
//
// The kit's own tag-pair regex (`SPEAKER_TAG_PAIR`) is module-private (not exported from
// `@orb/kit/speaker-label`) — this mirrors its exact shape rather than reaching into kit internals
// (consume-only: this task does not edit `@orb/kit`).
//
// Torn/mid-stream tags are already held back UPSTREAM by the streaming lane's `repairStreamingTail`
// (`@orb/kit/fix-markdown`, the streaming-ghost path only) before content ever settles into canon —
// so by the time a body reaches this parser it is assumed well-formed; a stray unterminated tag (one
// that never got a matching close) is simply left as plain, un-matched text (no crash, no data loss).

export interface SpeakerSpan {
  /** `null` = no attributed speaker for this span (narrator / plain text). */
  readonly speaker: string | null;
  readonly text: string;
}

// Mirrors `@orb/kit/speaker-label`'s private `SPEAKER_TAG_PAIR` shape: an open `<speaker ...>` (attrs
// allowed on the open tag), a bounded name with no `<`/`>` (capped length — no nested-quantifier
// backtracking), a close tag, then any trailing whitespace so the next span's text doesn't start with
// a stray newline left by the marker.
const SPEAKER_TAG_PAIR = /<\s*speaker\b[^>]*>([^<>]{0,200})<\s*\/\s*speaker\s*>\s*/giu;

/** Parse a settled body string into ordered speaker spans (§12.4). */
export function parseSpeakerSpans(content: string): readonly SpeakerSpan[] {
  const matches = [...content.matchAll(SPEAKER_TAG_PAIR)];
  if (matches.length === 0) {
    // The byte-identical no-op: `text` is `content`, untouched.
    return [{ speaker: null, text: content }];
  }

  const spans: SpeakerSpan[] = [];
  let cursor = 0;
  for (const [matchPosition, match] of matches.entries()) {
    const matchIndex = match.index ?? 0;
    // Preamble / inter-marker plain text (no attributed speaker) ahead of this marker.
    if (matchIndex > cursor) {
      spans.push({ speaker: null, text: content.slice(cursor, matchIndex) });
    }
    const rawName = match[1]?.trim() ?? "";
    const textStart = matchIndex + match[0].length;
    const nextMatchIndex = matches[matchPosition + 1]?.index ?? content.length;
    spans.push({
      speaker: rawName.length > 0 ? rawName : null,
      text: content.slice(textStart, nextMatchIndex),
    });
    cursor = nextMatchIndex;
  }
  return spans;
}
