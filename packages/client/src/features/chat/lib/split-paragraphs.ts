// Pure paragraph splitter for the Tide chatStyle skin (§B.2 — "per-`<p>` bubble trains, iMessage-style").
// message-row.tsx calls this ONLY when `skin.bubbleLayout === "trains"`; each returned paragraph is fed
// through the SAME `<MessageContent>` the single-bubble path uses (one engine, N calls) so macro/markdown/
// trust resolution stays identical between chatStyles — Tide changes the BUBBLE COUNT, never the render
// pipeline. `MAX_TRAIN_BUBBLES` is the "guard long-RP-prose stacking with sane spacing" floor from §B.2:
// beyond it, chaining ten-plus tiny bubbles reads as messy, not immersive, so the row falls back to ONE
// bubble over the whole body (the pre-Tide single-bubble render).

const PARAGRAPH_BREAK = /\n{2,}/u;

/** Above this many paragraphs, a train stops reading as "chat bubbles" and starts reading as "a wall of
 *  tiny boxes" — the caller falls back to a single bubble instead (§B.2's messiness guard). */
export const MAX_TRAIN_BUBBLES = 12;

/** Split `content` into non-empty, trimmed paragraphs for Tide's bubble train. Returns `null` — "don't
 *  train this" — for a single-paragraph body (nothing to chain) or one that blows past
 *  {@link MAX_TRAIN_BUBBLES}; the caller renders its normal single bubble in both cases. */
export function splitIntoTrainParagraphs(content: string): readonly string[] | null {
  const paragraphs = content
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length <= 1 || paragraphs.length > MAX_TRAIN_BUBBLES) {
    return null;
  }
  return paragraphs;
}
