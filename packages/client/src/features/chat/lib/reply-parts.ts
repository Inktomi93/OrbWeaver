// A styled reply split into the runs one card frame draws and the blocks that stay native (D294). A frame
// document is static markup, so anything that needs the app stays outside it and splits the run: a media block
// (an owned image is session-gated and cannot load inside an opaque-origin frame), a `:::choices` set (its
// buttons send the next turn) and a paragraph carrying a dice stamp (its chip is a live control).

import type { MessageContentBlock } from "@orb/contracts/chat";
import { tokenizeContent } from "@orb/kit/content";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { toContentBlocks } from "./content-blocks.ts";

/** One run of a framed reply: settled markdown (under its speaker's tint in a narrator room), or a card's own HTML. */
export type FrameReplySegment =
  | { readonly kind: "markdown"; readonly markdown: string; readonly tokens: ThemeScopeTokens | undefined }
  | { readonly kind: "card"; readonly html: string };

/** One part of a framed reply, in reading order. */
export type ReplyPart =
  | { readonly kind: "frame"; readonly segments: readonly FrameReplySegment[] }
  | { readonly kind: "native"; readonly block: MessageContentBlock; readonly tokens: ThemeScopeTokens | undefined };

/** One speaker's text and the tint it reads in (undefined outside a narrator room's attributed span). */
export interface ReplySpan {
  readonly text: string;
  readonly tokens: ThemeScopeTokens | undefined;
}

// A blank line ends a markdown paragraph, so splitting there never cuts one in two.
const PARAGRAPH_BREAK = /\n[ \t]*\n/u;

function carriesDice(markdown: string): boolean {
  return tokenizeContent(markdown, { committed: true }).some((span) => span.kind === "dice");
}

/** Split one markdown block at its paragraphs only when one of them carries a dice stamp. */
function markdownParts(markdown: string, tokens: ThemeScopeTokens | undefined): readonly ReplyPart[] {
  if (!carriesDice(markdown)) {
    return [{ kind: "frame", segments: [{ kind: "markdown", markdown, tokens }] }];
  }
  return markdown
    .split(PARAGRAPH_BREAK)
    .map(
      (paragraph): ReplyPart =>
        carriesDice(paragraph)
          ? { kind: "native", block: { kind: "markdown", md: paragraph }, tokens }
          : { kind: "frame", segments: [{ kind: "markdown", markdown: paragraph, tokens }] },
    );
}

function blockParts(block: MessageContentBlock, tokens: ThemeScopeTokens | undefined): readonly ReplyPart[] {
  switch (block.kind) {
    case "markdown":
      return markdownParts(block.md, tokens);
    case "html-card":
      return [{ kind: "frame", segments: [{ kind: "card", html: block.html }] }];
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

/** The reply's parts: neighbouring frame runs merge, so a reply with nothing native is exactly one frame. */
export function replyParts(spans: readonly ReplySpan[], options: { readonly lenientHtml: boolean }): readonly ReplyPart[] {
  const parts: ReplyPart[] = [];
  for (const span of spans) {
    for (const block of toContentBlocks(span.text, { cardTrust: "tierB", lenientHtml: options.lenientHtml, keepUnknownDirectives: true })) {
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
  return parts;
}
