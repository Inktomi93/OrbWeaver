// Pure paragraph splitter for the Tide chatStyle skin (§B.2 — "per-`<p>` bubble trains, iMessage-style").
// The row calls it ONLY when `skin.bubbleLayout === "trains"`: once over the stored reply, to decide that the row
// trains (`storedReplyTrains`), and once over what the display pass drew, to cut the bubbles (`message-train.tsx`). The pass runs once
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
// A PARAGRAPH THAT DRAWS NOTHING IS NOT A BUBBLE. A wrapper tag alone on its line (`<continuation>`, `</think>`), a
// comment, a stylesheet and whitespace render as nothing, so their pill would be the same empty box a leading rule
// makes. The paragraph is dropped from the train only; the single-bubble and framed renders keep every tag as written.

import type { TextRange } from "@orb/kit/content";
import { paragraphBreaks, stripStyleElements } from "@orb/kit/content";

/** A paragraph that is nothing but a CommonMark thematic break (`---`, `***`, `___`, optionally spaced) —
 *  the pill it would get renders as an empty box, because an `<hr>` has no text. */
const THEMATIC_BREAK_ONLY = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;

// Blank lines that open the text. A paragraph keeps its first line's indent, which can make it a code block.
const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/u;
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";
// A line opening at least this many columns in reads as code when no HTML block holds it.
const CODE_INDENT = 4;
// The elements the chat's sanitize schema keeps that draw something with no text inside them.
const VISIBLE_EMPTY_ELEMENTS: ReadonlySet<string> = new Set(["img", "hr", "input"]);
const TAG_NAME_RE = /<\/?([A-Za-z][\w-]*)/uy;

// The run of spaces and tabs at `at`.
function spacesAt(text: string, at: number): number {
  const spaces = /[ \t]*/uy;
  spaces.lastIndex = at;
  return spaces.exec(text)?.[0].length ?? 0;
}

// Where the tag opening at `lt` ends: its first `>` outside a quoted attribute value, or -1 when it never closes.
function tagEndAt(text: string, lt: number): number {
  let quote = "";
  for (let index = lt + 1; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quote !== "") {
      quote = char === quote ? "" : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

// Past the markup at `at` when it draws nothing: a comment (an unclosed one hides the rest of the text) or the tag of
// an element that draws nothing when empty. -1 when it draws: any other character, an unclosed `<`, which is prose, or
// a tag such as `<img>`.
function silentMarkupEnd(text: string, at: number): number {
  if (text.startsWith(COMMENT_OPEN, at)) {
    const close = text.indexOf(COMMENT_CLOSE, at + COMMENT_OPEN.length);
    return close === -1 ? text.length : close + COMMENT_CLOSE.length;
  }
  TAG_NAME_RE.lastIndex = at;
  const name = TAG_NAME_RE.exec(text)?.[1]?.toLowerCase();
  const end = name === undefined || VISIBLE_EMPTY_ELEMENTS.has(name) ? -1 : tagEndAt(text, at);
  return end === -1 ? -1 : end + 1;
}

// Whether the row's Markdown render of `paragraph` shows nothing: once its stylesheets are gone (the render drops
// them), it holds only whitespace and silent markup, with no line read as code. A comment that opens a block ends it on
// its own line, so the next line may be code; a tag that opens one holds every line to the next blank. One pass.
function drawsNothing(paragraph: string): boolean {
  const text = stripStyleElements(paragraph);
  let inBlock = false;
  let at = 0;
  while (at < text.length) {
    const lineStart = at === 0 || text.charAt(at - 1) === "\n";
    const lead = spacesAt(text, at);
    at += lead;
    if (at === text.length || text.charAt(at) === "\n") {
      inBlock &&= !lineStart;
      at += 1;
      continue;
    }
    const opensBlock = lineStart && !inBlock;
    const end = opensBlock && lead >= CODE_INDENT ? -1 : silentMarkupEnd(text, at);
    if (end === -1) {
      return false;
    }
    inBlock ||= opensBlock && !text.startsWith(COMMENT_OPEN, at);
    at = end;
  }
  return true;
}

// Each paragraph of `content` that holds text and is no standalone thematic break: from its first line, past any blank
// lines before it, to its last non-space character.
function paragraphsOf(content: string): readonly TextRange[] {
  const breaks = paragraphBreaks(content);
  return [...breaks, { start: content.length, end: content.length }]
    .map((cut, index): TextRange => {
      const from = breaks[index - 1]?.end ?? 0;
      const text = content.slice(from, cut.start);
      const start = from + (LEADING_BLANK_LINES.exec(text)?.[0].length ?? 0);
      return { start, end: from + text.trimEnd().length };
    })
    .filter(({ start, end }) => {
      const paragraph = content.slice(start, end);
      return paragraph.trim().length > 0 && !THEMATIC_BREAK_ONLY.test(paragraph);
    });
}

/** Where each bubble of Tide's train sits in the drawn text `content`, one per paragraph past standalone thematic breaks
 *  and paragraphs that draw nothing. Returns `null` — "don't train this" — only when what is left cannot BE a train: a
 *  single paragraph (nothing to chain) or none at all. */
export function trainParagraphs(content: string): readonly TextRange[] | null {
  const paragraphs = paragraphsOf(content).filter(({ start, end }) => !drawsNothing(content.slice(start, end)));
  return paragraphs.length <= 1 ? null : paragraphs;
}

/** Whether a STORED reply may train: it holds more than one paragraph past standalone thematic breaks. Markup that draws
 *  nothing counts here, because a display script may turn it into a panel (`<scene_hud />`); the train then cuts the
 *  drawn text with {@link trainParagraphs}. */
export function storedReplyTrains(content: string): boolean {
  return paragraphsOf(content).length > 1;
}
