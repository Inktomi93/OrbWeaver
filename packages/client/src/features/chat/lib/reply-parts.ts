// A styled reply split into the runs one card frame draws and the blocks that stay native (D354). A frame
// document is static markup, so anything that needs the app stays outside it and splits the run: a media block
// (an owned image is session-gated and cannot load inside an opaque-origin frame), a `:::choices` set (its
// buttons send the next turn), a paragraph carrying a dice stamp (its chip is a live control) and a marked card (its
// chrome is the app's).

import type { CardTrust, MessageContentBlock } from "@orb/contracts/chat";
import { CARD_FRAME_CARRIED_AUTHORS_MAX, CARD_FRAME_HTML_MAX_CHARS } from "@orb/contracts/chat";
import type { Span } from "@orb/kit/chunk";
import type { FormingPanelSegment, FrameStyleSheet } from "@orb/kit/content";
import {
  frameStyleElements,
  heldBlockRanges,
  holdBlocksWhole,
  markupClassNames,
  markupUnitRanges,
  modelPanels,
  paragraphBreaks,
  scanFormingPanels,
  scanStyledHold,
  tokenizeContent,
} from "@orb/kit/content";
import type { CharacterId } from "@orb/kit/ids";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import type { PlainReplyReason, RowRenderPolicy } from "#lib";
import { PLAIN_REPLY_REASON } from "#lib";
import { toContentBlocks } from "./content-blocks.ts";
import type { RoomSheet } from "./room-sheets.ts";

/** One run of a framed reply: settled markdown (under its speaker's tint in a narrator room), or a card's own HTML. */
export type FrameReplySegment =
  | { readonly kind: "markdown"; readonly markdown: string; readonly tokens: ThemeScopeTokens | undefined }
  | { readonly kind: "card"; readonly html: string };

/** The stylesheets a frame run carries: the room's sheets the reply carries, then every carried sheet of the reply, one
 *  array all its runs share, less this run's own, which sit at `own`. The run carries those before `own.start` above its
 *  body and those from `own.end` below. */
export interface ReplyRunStyles {
  readonly sheets: readonly FrameStyleSheet[];
  readonly own: { readonly start: number; readonly end: number };
  /** The characters whose room sheets are among `sheets`, each once: the frame's mint names them (`carriedFrom`). */
  readonly authors: readonly CharacterId[];
}

const CHARS_PER_MIB = 1_048_576;
const REPLY_CARRY_BUDGET_MIB = 4;
/** The stylesheet text all of one reply's runs may carry between them: a bound against abuse, set well above what a
 *  heavy styling preset's panels carry across many splits. */
export const REPLY_CARRY_BUDGET_CHARS = REPLY_CARRY_BUDGET_MIB * CHARS_PER_MIB;
/** The stylesheet copies all of one reply's runs may carry between them. Each is an element in another run's document,
 *  and text alone cannot bound them: an empty sheet carries none. A heavy styling preset carries a few dozen. */
export const REPLY_CARRY_BUDGET_SHEETS = 1024;
// The share of the mint's markup cap a frame's carried stylesheets may take; the rest is the run's own markup.
const FRAME_CARRY_SHARE_OF_MINT = 4;
/** The stylesheet text ONE frame run may carry: the room's sheets plus the reply's other runs' sheets. A quarter of the
 *  mint's markup cap ({@link CARD_FRAME_HTML_MAX_CHARS}), so a carry never pushes a run's mint past the cap: the largest
 *  framed reply measured is a tenth of it. A heavy styling preset's whole display-script sheet set is about 353,000
 *  characters and fits. Past it the reply takes the plain path whole, with its notice. */
export const REPLY_FRAME_CARRY_BUDGET_CHARS = Math.floor(CARD_FRAME_HTML_MAX_CHARS / FRAME_CARRY_SHARE_OF_MINT);
/** The longest drawn body the panel readers read (`modelPanels`, `markupUnitRanges`), each linear in it. A bound against
 *  abuse that fails closed: a longer body never frames, and a longer stream holds. It is about five times the largest
 *  framed reply measured, 204,544 characters (`packages/contracts/src/chat/card-frame.ts`), so no real reply nears it.
 *  At the bound the costliest body, unclosed openers with blank lines between, measured about 0.9 s on a sandboxed row
 *  and a real reply's prose about 2 ms; `modelPanels` dominates. */
export const PANEL_READ_MAX_CHARS = 1_048_576;

const NO_RANGES: readonly Span[] = [];

/** What the panel readers say about a drawn body: the ranges no speaker label may split, and whether the body holds a
 *  panel its author wrote, which frames it on the sandboxed tier and raises the plain notice on the other. Nothing is
 *  read past {@link PANEL_READ_MAX_CHARS}: such a body holds no panel, and a sandboxed one is opaque whole, since a label
 *  split could cut an element a later strip reads whole. The speaker guard reads only on the sandboxed tier. */
export function readPanels(
  text: string,
  render: Pick<RowRenderPolicy, "cardTier" | "lenientCards">,
): {
  readonly opaque: readonly Span[];
  readonly modelPanel: boolean;
} {
  const sandboxed = render.cardTier === "tierB";
  if (text.length > PANEL_READ_MAX_CHARS) {
    return { opaque: sandboxed ? [{ start: 0, end: text.length }] : NO_RANGES, modelPanel: false };
  }
  const panels = modelPanels(text, { lenientHtml: render.lenientCards });
  return { opaque: sandboxed ? markupUnitRanges(text, panels) : NO_RANGES, modelPanel: panels.length > 0 };
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

function charsOf(list: readonly FrameStyleSheet[]): number {
  return list.reduce((sum, sheet) => sum + sheetChars(sheet), 0);
}

// The room sheets' authors, each once, in the order they first carry.
function authorsOf(room: readonly RoomSheet[]): readonly CharacterId[] {
  return [...new Set(room.map((sheet) => sheet.authorId))];
}

/** The reply's parts: neighbouring frame runs merge, so a reply with nothing native is exactly one frame. Each run
 *  carries the room's `room` sheets ({@link carriedRoomSheets}) first, ahead of the reply's other runs' sheets, at most
 *  {@link REPLY_FRAME_CARRY_BUDGET_CHARS} in one run and from at most {@link CARD_FRAME_CARRIED_AUTHORS_MAX} authors; the
 *  runs together carry at most {@link REPLY_CARRY_BUDGET_CHARS} of stylesheet text and {@link REPLY_CARRY_BUDGET_SHEETS}
 *  copies. Past any bound the reply takes the plain path whole, with its reason, never half its runs styled.
 *  `cardTrust` is the row's resolved card tier, which a native card renders at. */
export function replyLayout(
  spans: readonly ReplySpan[],
  options: { readonly lenientHtml: boolean; readonly cardTrust: CardTrust; readonly room?: readonly RoomSheet[] | undefined },
): ReplyLayout {
  const parts = unstyledParts(spans, options);
  const carried = carriedSheets(parts);
  const reply = carried.flat();
  // A room sheet the reply repeats is dropped, as a repeat within the reply is: the reply's later copy wins its ties.
  const repeated = new Set(reply.map(sheetIdentity));
  const room = (options.room ?? []).filter((sheet) => LAYER_RULE_RE.test(sheet.css) || !repeated.has(sheetIdentity(sheet)));
  const authors = authorsOf(room);
  const runs = parts.filter((part) => part.kind === "frame").length;
  // Each run carries every reply sheet but its own, so once per run less one, and every room sheet once per run.
  const others = Math.max(0, runs - 1);
  const roomChars = charsOf(room);
  const replyChars = charsOf(reply);
  const heaviestRun = Math.max(0, ...parts.map((part, index) => (part.kind === "frame" ? roomChars + replyChars - charsOf(carried[index] ?? []) : 0)));
  if (
    heaviestRun > REPLY_FRAME_CARRY_BUDGET_CHARS ||
    authors.length > CARD_FRAME_CARRIED_AUTHORS_MAX ||
    others * replyChars + runs * roomChars > REPLY_CARRY_BUDGET_CHARS ||
    others * reply.length + runs * room.length > REPLY_CARRY_BUDGET_SHEETS
  ) {
    return { kind: "plain", reason: PLAIN_REPLY_REASON.carriedStylesOverBudget };
  }
  const sheets = [...room, ...reply];
  let start = room.length;
  return {
    kind: "framed",
    parts: parts.map((part, index) => {
      const own = { start, end: start + (carried[index]?.length ?? 0) };
      start = own.end;
      return part.kind === "frame" ? { ...part, styles: { sheets, own, authors } } : part;
    }),
  };
}

// The classes a sheet's selectors name: each `.name` outside a declaration block. A block nested in an at-rule keeps
// its selectors, and a value such as `.5em` is inside a block, so it names none. A name read from an attribute
// selector or a comment only carries a sheet the reply did not need, never drops one it did.
const DECLARATION_BLOCK_RE = /\{[^{}]*\}/gu;
const SELECTOR_CLASS_RE = /\.(-?[_a-zA-Z][\w-]*)/gu;

function namesAny(sheet: FrameStyleSheet, used: ReadonlySet<string>): boolean {
  return [...sheet.css.replace(DECLARATION_BLOCK_RE, "{}").matchAll(SELECTOR_CLASS_RE)].some((match) => used.has(match[1] ?? ""));
}

/** The room's sheets a drawn reply carries: each of `room` (canon order, `roomSheetsBefore`) whose selectors name a class
 *  the reply's prose markup uses (`markupClassNames`), only the last copy of a repeated sheet, as {@link replyLayout}
 *  keeps one. A sheet naming no class the reply uses is not carried: the reply needs none of it, and every carried byte
 *  is paid once per frame run. Empty when the reply uses none, so it does not frame for the room's sake. */
export function carriedRoomSheets(room: readonly RoomSheet[], text: string, options: { readonly lenientHtml: boolean }): readonly RoomSheet[] {
  const used = markupClassNames(text, options);
  if (used.size === 0) {
    return [];
  }
  const needed = room.filter((sheet) => namesAny(sheet, used));
  const lastCopy = new Map(needed.map((sheet) => [sheetIdentity(sheet), sheet]));
  return needed.filter((sheet) => lastCopy.get(sheetIdentity(sheet)) === sheet);
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

/** The most panels of one streaming reply that draw before it settles. Each distinct panel mints once under the forming
 *  cap, plus the one re-mint a lost handle earns, so a streamed reply spends at most twice this many forming mints on top
 *  of its settled frame's own; a panel past it stays behind its chip until the reply settles. */
export const FORMING_PANELS_MAX = 8;

/** One part of a reply still streaming: prose, a panel still forming (no bytes), or a complete panel with the sheets its
 *  forming frame carries above its body. */
export type FormingPart =
  | Exclude<FormingPanelSegment, { readonly kind: "panel" }>
  | { readonly kind: "panel"; readonly markup: string; readonly styles: ReplyRunStyles };

/** A streaming reply's parts (`scanFormingPanels`). Each complete panel carries the room's sheets its own markup uses
 *  and the sheets of the complete panels before it, never a later one's, so its bytes stay fixed while the reply streams
 *  on. A panel that would carry past the bounds a settled run keeps ({@link replyLayout}) holds as forming markup until
 *  the reply settles. Past {@link PANEL_READ_MAX_CHARS} nothing is read and every unit holds. */
export function formingParts(text: string, room: readonly RoomSheet[] | undefined): readonly FormingPart[] {
  if (text.length > PANEL_READ_MAX_CHARS) {
    return scanStyledHold(text);
  }
  let before: readonly FrameStyleSheet[] = [];
  return scanFormingPanels(text).map((segment): FormingPart => {
    if (segment.kind !== "panel") {
      return segment;
    }
    const carriedRoom = room === undefined ? [] : carriedRoomSheets(room, segment.markup, { lenientHtml: false });
    const sheets = [...carriedRoom, ...before];
    const authors = authorsOf(carriedRoom);
    before = [...before, ...frameStyleElements(holdBlocksWhole(segment.markup))];
    if (charsOf(sheets) > REPLY_FRAME_CARRY_BUDGET_CHARS || authors.length > CARD_FRAME_CARRIED_AUTHORS_MAX) {
      return { kind: "forming-markup" };
    }
    return { kind: "panel", markup: segment.markup, styles: { sheets, own: { start: sheets.length, end: sheets.length }, authors } };
  });
}
