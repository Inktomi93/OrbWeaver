// Pure paragraph splitter for the Tide chatStyle skin (§B.2 — "per-`<p>` bubble trains, iMessage-style").
// The row calls it ONLY when `skin.bubbleLayout === "trains"`: once over the stored reply, to decide that the row
// trains, and once over what the display pass drew, to cut the bubbles (`message-train.tsx`). The pass runs once
// over the whole reply, so a script whose match spans a blank line still matches, and each bubble renders through
// the same `MessageBody` the single-bubble path uses — Tide changes the BUBBLE COUNT, never the render pipeline.
// It is role-blind by construction: a user turn with paragraph breaks trains exactly like an assistant one (the
// owner's own turns rarely carry them, which is why it reads as an assistant feature).
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
//
// THE SPLIT IS THE KIT'S PARAGRAPH BREAKS (`paragraphBreaks`), never a bare blank-line split: a blank line inside a
// stylesheet, a code block, an HTML block, a list item, a folded element, a card, a choice set or a hidden span is
// part of that unit, and cutting there would print the rest of it in a bubble of its own or change what it means.
//
// A PARAGRAPH OF COMMENTS ALONE IS NOT A BUBBLE. Markdown draws an HTML comment as nothing, so its pill would be the
// same empty box a leading rule makes.

import type { TextRange } from "@orb/kit/content";
import { paragraphBreaks } from "@orb/kit/content";

/** A paragraph that is nothing but a CommonMark thematic break (`---`, `***`, `___`, optionally spaced) —
 *  the pill it would get renders as an empty box, because an `<hr>` has no text. */
const THEMATIC_BREAK_ONLY = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;

// Blank lines that open the text. A paragraph keeps its first line's indent, which can make it a code block.
const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/u;
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
// A comment Markdown reads as an HTML block opens a line with at most three spaces before it; past that it is code.
const BLOCK_INDENT_MAX = 3;

// The run of spaces and tabs at `at`.
function spacesAt(text: string, at: number): number {
  const spaces = /[ \t]*/uy;
  spaces.lastIndex = at;
  return spaces.exec(text)?.[0].length ?? 0;
}

// Whether `paragraph` is nothing but HTML comment blocks, each opening a line or following another on its line. One
// pass over the text.
function isCommentsOnly(paragraph: string): boolean {
  let at = 0;
  let lineStart = true;
  while (at < paragraph.length) {
    const lead = spacesAt(paragraph, at);
    if ((lineStart && lead > BLOCK_INDENT_MAX) || !paragraph.startsWith(COMMENT_OPEN, at + lead)) {
      return false;
    }
    const close = paragraph.indexOf(COMMENT_CLOSE, at + lead + COMMENT_OPEN.length);
    // HTML reads an unclosed comment to the end of the text.
    if (close === -1) {
      return true;
    }
    at = close + COMMENT_CLOSE.length;
    at += spacesAt(paragraph, at);
    lineStart = paragraph.charAt(at) === "\n";
    at += lineStart ? 1 : 0;
  }
  return true;
}

/** Where each non-empty paragraph of `content` sits for Tide's bubble train, dropping standalone thematic breaks and
 *  paragraphs of comments alone: from its first line, past any blank lines before it, to its last non-space
 *  character. Returns `null` — "don't train this" — only when what is left cannot BE a train: a single paragraph
 *  (nothing to chain) or none at all. */
export function trainParagraphs(content: string): readonly TextRange[] | null {
  const breaks = paragraphBreaks(content);
  const paragraphs = [...breaks, { start: content.length, end: content.length }]
    .map((cut, index): TextRange => {
      const from = breaks[index - 1]?.end ?? 0;
      const text = content.slice(from, cut.start);
      const start = from + (LEADING_BLANK_LINES.exec(text)?.[0].length ?? 0);
      return { start, end: from + text.trimEnd().length };
    })
    .filter(({ start, end }) => {
      const paragraph = content.slice(start, end);
      return paragraph.trim().length > 0 && !THEMATIC_BREAK_ONLY.test(paragraph) && !isCommentsOnly(paragraph);
    });
  return paragraphs.length <= 1 ? null : paragraphs;
}
