// A styled reply split into the runs one card frame draws and the blocks that stay native (D354). A frame
// document is static markup, so anything that needs the app stays outside it and splits the run: a media block
// (an owned image is session-gated and cannot load inside an opaque-origin frame), a `:::choices` set (its
// buttons send the next turn), a paragraph carrying a dice stamp (its chip is a live control) and a marked card (its
// chrome is the app's).

import type { CardTrust, MessageContentBlock } from "@orb/contracts/chat";
import type { FrameStyleSheet } from "@orb/kit/content";
import { frameStyleElements, rawTextElements, tokenizeContent } from "@orb/kit/content";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import type { PlainReplyReason } from "#lib";
import { PLAIN_REPLY_REASON } from "#lib";
import { toContentBlocks } from "./content-blocks.ts";

/** One run of a framed reply: settled markdown (under its speaker's tint in a narrator room), or a card's own HTML. */
export type FrameReplySegment =
  | { readonly kind: "markdown"; readonly markdown: string; readonly tokens: ThemeScopeTokens | undefined }
  | { readonly kind: "card"; readonly html: string };

/** The stylesheets of a reply's other frame runs: those before this run, and those after it. */
export interface ReplyRunStyles {
  readonly before: readonly FrameStyleSheet[];
  readonly after: readonly FrameStyleSheet[];
}

const CHARS_PER_MIB = 1_048_576;
const REPLY_CARRY_BUDGET_MIB = 4;
/** The stylesheet text all of one reply's runs may carry between them: a bound against abuse, set well above what a
 *  heavy styling preset's panels carry across many splits. */
export const REPLY_CARRY_BUDGET_CHARS = REPLY_CARRY_BUDGET_MIB * CHARS_PER_MIB;

/** What a styled reply renders: its frame runs and native blocks, or the plain path whole, with the reason. */
export type ReplyLayout = { readonly kind: "framed"; readonly parts: readonly ReplyPart[] } | { readonly kind: "plain"; readonly reason: PlainReplyReason };

interface NativePart {
  readonly kind: "native";
  readonly block: MessageContentBlock;
  readonly tokens: ThemeScopeTokens | undefined;
}

interface UnstyledRun {
  readonly kind: "frame";
  readonly segments: readonly FrameReplySegment[];
}

type UnstyledPart = UnstyledRun | NativePart;

/** One part of a framed reply, in reading order. */
export type ReplyPart = (UnstyledRun & { readonly styles: ReplyRunStyles }) | NativePart;

const MARKED_CARD_ORIGIN = "fence" satisfies Extract<MessageContentBlock, { kind: "html-card" }>["origin"];

/** One speaker's text and the tint it reads in (undefined outside a narrator room's attributed span). */
export interface ReplySpan {
  readonly text: string;
  readonly tokens: ThemeScopeTokens | undefined;
}

// A blank line ends a markdown paragraph, so splitting there never cuts one in two.
const PARAGRAPH_BREAK_SOURCE = String.raw`\n[ \t]*\n`;

function carriesDice(markdown: string): boolean {
  return tokenizeContent(markdown, { committed: true }).some((span) => span.kind === "dice");
}

// The paragraphs of `markdown`. A blank line inside a `<style>` or `<script>` element is its text, not a paragraph
// break: splitting there would put the rest of a stylesheet in a run of its own, as prose.
function paragraphs(markdown: string): readonly string[] {
  const elements = rawTextElements(markdown);
  const parts: string[] = [];
  let from = 0;
  let element = 0;
  for (const found of markdown.matchAll(new RegExp(PARAGRAPH_BREAK_SOURCE, "gu"))) {
    while ((elements[element]?.end ?? Number.POSITIVE_INFINITY) <= found.index) {
      element += 1;
    }
    if ((elements[element]?.start ?? Number.POSITIVE_INFINITY) < found.index) {
      continue;
    }
    parts.push(markdown.slice(from, found.index));
    from = found.index + found[0].length;
  }
  parts.push(markdown.slice(from));
  return parts;
}

/** Split one markdown block at its paragraphs only when one of them carries a dice stamp. */
function markdownParts(markdown: string, tokens: ThemeScopeTokens | undefined): readonly UnstyledPart[] {
  if (!carriesDice(markdown)) {
    return [{ kind: "frame", segments: [{ kind: "markdown", markdown, tokens }] }];
  }
  return paragraphs(markdown).map(
    (paragraph): UnstyledPart =>
      carriesDice(paragraph)
        ? { kind: "native", block: { kind: "markdown", md: paragraph }, tokens }
        : { kind: "frame", segments: [{ kind: "markdown", markdown: paragraph, tokens }] },
  );
}

// A card written as a card (`:::card`) keeps its own chrome and frame wherever it sits, so it stays native. A lenient
// card is markup the reply itself holds, script-written or not, and draws in the reply's frame with no chrome.
function blockParts(block: MessageContentBlock, tokens: ThemeScopeTokens | undefined): readonly UnstyledPart[] {
  switch (block.kind) {
    case "markdown":
      return markdownParts(block.md, tokens);
    case "html-card":
      return block.origin === MARKED_CARD_ORIGIN ? [{ kind: "native", block, tokens }] : [{ kind: "frame", segments: [{ kind: "card", html: block.html }] }];
    case "media":
    case "choices":
      return [{ kind: "native", block, tokens }];
    default:
      return assertNever(block);
  }
}

function assertNever(value: never): never {
  throw new Error(`reply parts: unhandled block ${JSON.stringify(value)}`);
}

function runSheets(segments: readonly FrameReplySegment[]): readonly FrameStyleSheet[] {
  return segments.flatMap((segment) => frameStyleElements(segment.kind === "markdown" ? segment.markdown : segment.html));
}

// A sheet that names a cascade layer fixes that layer's order where it first appears, so no copy of it is dropped.
const LAYER_RULE_RE = /@layer\b/i;

function sheetIdentity(sheet: FrameStyleSheet): string {
  return JSON.stringify([sheet.media ?? null, sheet.css]);
}

function carriedChars(styles: ReplyRunStyles): number {
  return [...styles.before, ...styles.after].reduce((sum, sheet) => sum + sheet.css.length + (sheet.media?.length ?? 0), 0);
}

// Each frame run is its own document, so a stylesheet one run holds would not reach a panel in another. Every run
// carries the reply's other runs' stylesheets around its own body, in reading order, so the cascade is the one a
// single frame would have. A native block is not a run: a marked card's CSS stays in its own frame, and the reply's
// stylesheets never reach it.
//
// ONLY THE LAST COPY OF A REPEATED SHEET IS CARRIED (same text, same media): an identical later copy wins every tie
// the earlier one would have won, so dropping the earlier one leaves the cascade as it was. A sheet that names a
// layer is the exception and is carried at every copy.
function withReplyStyles(parts: readonly UnstyledPart[]): readonly ReplyPart[] {
  const sheets = parts.map((part) => (part.kind === "frame" ? runSheets(part.segments) : []));
  const lastCopy = new Map<string, FrameStyleSheet>();
  for (const sheet of sheets.flat()) {
    lastCopy.set(sheetIdentity(sheet), sheet);
  }
  const carried = sheets.map((list) => list.filter((sheet) => LAYER_RULE_RE.test(sheet.css) || lastCopy.get(sheetIdentity(sheet)) === sheet));
  return parts.map((part, index) =>
    part.kind === "frame" ? { ...part, styles: { before: carried.slice(0, index).flat(), after: carried.slice(index + 1).flat() } } : part,
  );
}

/** The reply's parts: neighbouring frame runs merge, so a reply with nothing native is exactly one frame. Its runs
 *  together carry at most {@link REPLY_CARRY_BUDGET_CHARS} of one another's stylesheets; past that the reply takes the
 *  plain path whole, never half its runs styled. `cardTrust` is the row's resolved card tier, which a native card
 *  renders at. */
export function replyLayout(spans: readonly ReplySpan[], options: { readonly lenientHtml: boolean; readonly cardTrust: CardTrust }): ReplyLayout {
  const parts = replyParts(spans, options);
  const carried = parts.reduce((sum, part) => sum + (part.kind === "frame" ? carriedChars(part.styles) : 0), 0);
  return carried > REPLY_CARRY_BUDGET_CHARS ? { kind: "plain", reason: PLAIN_REPLY_REASON.carriedStylesOverBudget } : { kind: "framed", parts };
}

function replyParts(spans: readonly ReplySpan[], options: { readonly lenientHtml: boolean; readonly cardTrust: CardTrust }): readonly ReplyPart[] {
  const parts: UnstyledPart[] = [];
  for (const span of spans) {
    for (const block of toContentBlocks(span.text, { cardTrust: options.cardTrust, lenientHtml: options.lenientHtml, keepUnknownDirectives: true })) {
      for (const part of blockParts(block, span.tokens)) {
        const previous = parts.at(-1);
        if (part.kind === "frame" && previous?.kind === "frame") {
          parts[parts.length - 1] = { kind: "frame", segments: [...previous.segments, ...part.segments] };
        } else {
          parts.push(part);
        }
      }
    }
  }
  return withReplyStyles(parts);
}
