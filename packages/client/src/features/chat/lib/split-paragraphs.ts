// Pure paragraph splitter for the Tide chatStyle skin (§B.2 — "per-`<p>` bubble trains, iMessage-style").
// message-row.tsx calls this ONLY when `skin.bubbleLayout === "trains"`; each returned paragraph is fed
// through the SAME `<MessageContent>` the single-bubble path uses (one engine, N calls) so macro/markdown/
// trust resolution stays identical between chatStyles — Tide changes the BUBBLE COUNT, never the render
// pipeline. It is role-blind by construction: a user turn with paragraph breaks trains exactly like an
// assistant one (the owner's own turns rarely carry them, which is why it reads as an assistant feature).
//
// THE CAP IS GONE (#212-1, measured 2026-08-18). There was a `MAX_TRAIN_BUBBLES = 12` guard here: beyond
// twelve paragraphs the splitter returned `null` and the row silently rendered ONE bubble — i.e. as
// `bubble`, not as `tide`. Its stated intent was "guard long-RP-prose stacking with sane spacing"; its
// measured effect was the exact inverse. A paragraph census of a real ST-imported room put **9 of 13
// assistant turns over the cap (69%)** — 71/11/15/16/6/16/24/10/44/19/17/4 — so on the one class of
// message this app exists for, long-form RP prose, tide turned itself off. The reference render the skin
// was built against is itself a >12-paragraph message and trains it. A skin that silently becomes another
// skin is worse than either: the setting appears to do nothing, and the reader has no way to tell why.
// Whatever the honest answer to "a wall of tiny boxes" is, a SILENT FALLBACK is not it.
//
// A LEADING THEMATIC BREAK IS NOT A BUBBLE (#212-5). Every assistant message in an ST-imported chat opens
// with a `---` line. As a paragraph it renders as an `<hr>`, and the train gave it its own pill: a measured
// **empty 24x17px orphan bubble** above every trained message in every imported room. Inside a train the
// break between two pills IS the rule — the pill boundary already says what the `---` says — so a
// standalone thematic break carries no content of its own here and is dropped. It is dropped ONLY on this
// path: the single-bubble render still shows the author's rule exactly as written.

const PARAGRAPH_BREAK = /\n{2,}/u;

/** A paragraph that is nothing but a CommonMark thematic break (`---`, `***`, `___`, optionally spaced) —
 *  the pill it would get renders as an empty box, because an `<hr>` has no text. */
const THEMATIC_BREAK_ONLY = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;

/** Split `content` into non-empty, trimmed paragraphs for Tide's bubble train, dropping standalone
 *  thematic breaks. Returns `null` — "don't train this" — only when what is left cannot BE a train: a
 *  single paragraph (nothing to chain) or none at all. */
export function splitIntoTrainParagraphs(content: string): readonly string[] | null {
  const paragraphs = content
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !THEMATIC_BREAK_ONLY.test(paragraph));
  if (paragraphs.length <= 1) {
    return null;
  }
  return paragraphs;
}
