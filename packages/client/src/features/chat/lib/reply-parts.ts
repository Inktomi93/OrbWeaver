// A styled reply split into the runs one card frame draws and the blocks that stay native (D354). A frame
// document is static markup, so anything that needs the app stays outside it and splits the run: a media block
// (an owned image is session-gated and cannot load inside an opaque-origin frame), a `:::choices` set (its
// buttons send the next turn), a paragraph carrying a dice stamp (its chip is a live control) and a marked card (its
// chrome is the app's).

import type { CardTrust, MessageContentBlock } from "@orb/contracts/chat";
import type { FrameStyleSheet, TextRange } from "@orb/kit/content";
import { frameStyleElements, heldBlockRanges, holdBlocksWhole, markupUnitRanges, modelPanels, paragraphBreaks, tokenizeContent } from "@orb/kit/content";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import type { PlainReplyReason, RowRenderPolicy } from "#lib";
import { PLAIN_REPLY_REASON } from "#lib";
import { toContentBlocks } from "./content-blocks.ts";

/** One run of a framed reply: settled markdown (under its speaker's tint in a narrator room), or a card's own HTML. */
export type FrameReplySegment =
  | { readonly kind: "markdown"; readonly markdown: string; readonly tokens: ThemeScopeTokens | undefined }
  | { readonly kind: "card"; readonly html: string };

/** The stylesheets a frame run carries: every carried sheet of the reply, one array all its runs share, less this run's
 *  own, which sit at `own`. The run carries those before `own.start` above its body and those from `own.end` below. */
export interface ReplyRunStyles {
  readonly sheets: readonly FrameStyleSheet[];
  readonly own: { readonly start: number; readonly end: number };
}

const CHARS_PER_MIB = 1_048_576;
const REPLY_CARRY_BUDGET_MIB = 4;
/** The stylesheet text all of one reply's runs may carry between them: a bound against abuse, set well above what a
 *  heavy styling preset's panels carry across many splits. */
export const REPLY_CARRY_BUDGET_CHARS = REPLY_CARRY_BUDGET_MIB * CHARS_PER_MIB;
/** The stylesheet copies all of one reply's runs may carry between them. Each is an element in another run's document,
 *  and text alone cannot bound them: an empty sheet carries none. A heavy styling preset carries a few dozen. */
export const REPLY_CARRY_BUDGET_SHEETS = 1024;
/** The longest drawn body the panel readers read (`modelPanels`, `markupUnitRanges`), each linear in it. A bound against
 *  abuse that fails closed: a longer body never frames, and a longer stream holds. It sits above the largest framed reply
 *  measured, whose whole rendered document is 204,544 characters. */
export const PANEL_READ_MAX_CHARS = 262_144;

const NO_RANGES: readonly TextRange[] = [];

/** What the panel readers say about a drawn body: the ranges no speaker label may split, and whether the body holds a
 *  panel its author wrote, which frames it on the sandboxed tier and raises the plain notice on the other. Nothing is
 *  read past {@link PANEL_READ_MAX_CHARS}: such a body holds no panel, and a sandboxed one is opaque whole, since a label
 *  split could cut an element a later strip reads whole. The speaker guard reads only on the sandboxed tier. */
export function readPanels(
  text: string,
  render: Pick<RowRenderPolicy, "cardTier" | "lenientCards">,
): {
  readonly opaque: readonly TextRange[];
  readonly modelPanel: boolean;
} {
  const sandboxed = render.cardTier === "tierB";
  if (text.length > PANEL_READ_MAX_CHARS) {
    return { opaque: sandboxed ? [{ start: 0, end: text.length }] : NO_RANGES, modelPanel: false };
  }
  return { opaque: sandboxed ? markupUnitRanges(text) : NO_RANGES, modelPanel: modelPanels(text, { lenientHtml: render.lenientCards }).length > 0 };
}

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

// `markdown` without the block elements the frame holds whole (`heldBlockRanges`): a dice stamp written inside a panel
// is the panel's text, which the frame draws as written, so it pulls nothing out of the run.
function outsidePanels(markdown: string): string {
  let kept = "";
  let from = 0;
  for (const held of heldBlockRanges(markdown)) {
    kept += markdown.slice(from, held.start);
    from = held.end;
  }
  return kept + markdown.slice(from);
}

function carriesDice(markdown: string): boolean {
  return tokenizeContent(outsidePanels(markdown), { committed: true }).some((span) => span.kind === "dice");
}

// The paragraphs of `markdown`, cut only at its paragraph breaks: a blank line inside a `<style>` element, a code block
// or a block element the frame holds whole is that unit's text, and splitting there would put the rest of it in a run
// of its own, as prose.
function paragraphs(markdown: string): readonly string[] {
  const held = heldBlockRanges(markdown);
  let next = 0;
  const breaks = paragraphBreaks(markdown).filter((cut) => {
    while ((held[next]?.end ?? Number.POSITIVE_INFINITY) <= cut.start) {
      next += 1;
    }
    return (held[next]?.start ?? Number.POSITIVE_INFINITY) >= cut.start;
  });
  return [...breaks, { start: markdown.length, end: markdown.length }].map((cut, index) => markdown.slice(breaks[index - 1]?.end ?? 0, cut.start));
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

// A markdown run's sheets as its frame reads them: through the block hold, as `FrameMarkdown` parses it.
function runSheets(segments: readonly FrameReplySegment[]): readonly FrameStyleSheet[] {
  return segments.flatMap((segment) => frameStyleElements(segment.kind === "markdown" ? holdBlocksWhole(segment.markdown) : segment.html));
}

// A sheet that names a cascade layer fixes that layer's order where it first appears, so no copy of it is dropped.
const LAYER_RULE_RE = /@layer\b/i;

function sheetIdentity(sheet: FrameStyleSheet): string {
  return JSON.stringify([sheet.media ?? null, sheet.css]);
}

function sheetChars(sheet: FrameStyleSheet): number {
  return sheet.css.length + (sheet.media?.length ?? 0);
}

// The sheets each part carries to the other runs, in reading order. Each frame run is its own document, so a
// stylesheet one run holds would not reach a panel in another; every run carries the reply's other runs' sheets around
// its own body, so the cascade is the one a single frame would have. A native block is not a run: a marked card's CSS
// stays in its own frame, and the reply's stylesheets never reach it.
//
// ONLY THE LAST COPY OF A REPEATED SHEET IS CARRIED (same text, same media): an identical later copy wins every tie
// the earlier one would have won, so dropping the earlier one leaves the cascade as it was. A sheet that names a
// layer is the exception and is carried at every copy. A TITLED SHEET IS CARRIED ONLY UNDER THE REPLY'S FIRST TITLE:
// in one document that title names the preferred set, which applies, and a sheet under any other title is an
// alternate the document leaves off.
function carriedSheets(parts: readonly UnstyledPart[]): readonly (readonly FrameStyleSheet[])[] {
  const sheets = parts.map((part) => (part.kind === "frame" ? runSheets(part.segments) : []));
  const all = sheets.flat();
  const preferredTitle = all.find((sheet) => sheet.title !== undefined)?.title;
  const lastCopy = new Map<string, FrameStyleSheet>();
  for (const sheet of all) {
    lastCopy.set(sheetIdentity(sheet), sheet);
  }
  return sheets.map((list) =>
    list.filter(
      (sheet) =>
        (sheet.title === undefined || sheet.title === preferredTitle) && (LAYER_RULE_RE.test(sheet.css) || lastCopy.get(sheetIdentity(sheet)) === sheet),
    ),
  );
}

/** The reply's parts: neighbouring frame runs merge, so a reply with nothing native is exactly one frame. Its runs
 *  together carry at most {@link REPLY_CARRY_BUDGET_CHARS} of one another's stylesheet text and
 *  {@link REPLY_CARRY_BUDGET_SHEETS} copies of them; past either the reply takes the plain path whole, never half its
 *  runs styled. `cardTrust` is the row's resolved card tier, which a native card renders at. */
export function replyLayout(spans: readonly ReplySpan[], options: { readonly lenientHtml: boolean; readonly cardTrust: CardTrust }): ReplyLayout {
  const parts = unstyledParts(spans, options);
  const carried = carriedSheets(parts);
  const sheets = carried.flat();
  // Each run carries every carried sheet but its own, so the reply carries each sheet once per run less one.
  const others = Math.max(0, parts.filter((part) => part.kind === "frame").length - 1);
  const chars = sheets.reduce((sum, sheet) => sum + sheetChars(sheet), 0);
  if (others * chars > REPLY_CARRY_BUDGET_CHARS || others * sheets.length > REPLY_CARRY_BUDGET_SHEETS) {
    return { kind: "plain", reason: PLAIN_REPLY_REASON.carriedStylesOverBudget };
  }
  let start = 0;
  return {
    kind: "framed",
    parts: parts.map((part, index) => {
      const own = { start, end: start + (carried[index]?.length ?? 0) };
      start = own.end;
      return part.kind === "frame" ? { ...part, styles: { sheets, own } } : part;
    }),
  };
}

function unstyledParts(spans: readonly ReplySpan[], options: { readonly lenientHtml: boolean; readonly cardTrust: CardTrust }): readonly UnstyledPart[] {
  const parts: UnstyledPart[] = [];
  // The open run's segments, appended in place: neighbouring frame parts merge without copying the run each time.
  let run: FrameReplySegment[] | undefined;
  for (const span of spans) {
    for (const block of toContentBlocks(span.text, { cardTrust: options.cardTrust, lenientHtml: options.lenientHtml, keepUnknownDirectives: true })) {
      for (const part of blockParts(block, span.tokens)) {
        if (part.kind === "native") {
          parts.push(part);
          run = undefined;
        } else if (run === undefined) {
          run = [...part.segments];
          parts.push({ kind: "frame", segments: run });
        } else {
          run.push(...part.segments);
        }
      }
    }
  }
  return parts;
}
