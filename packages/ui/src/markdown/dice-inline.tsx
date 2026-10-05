// Dice stamps join prose in one Markdown parse. Only remark-minted, positionless spans become chips;
// source HTML has parser positions, which no HTML attribute can forge. Sanitization is unchanged.
// The chip is display markup, never a verified-roll provenance claim.
import { contentSpanRaw, tokenizeContent } from "@orb/kit/content";
import type { ComponentProps, ReactElement } from "react";
import type { StreamdownProps } from "streamdown";
import { Badge } from "../primitives/badge/index.ts";
import { Dices, Icon } from "../primitives/icons/index.ts";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset: number }; end: { offset: number } };
  data?: { hName: string; hChildren: DiceHastNode[] };
}

interface DiceHastNode {
  type: "element";
  tagName: "span";
  properties: Record<string, never>;
  children: { type: "text"; value: string }[];
}

// Native from-markdown joins decoded references/escapes into adjacent text. Keeping those native
// tokens distinct preserves source correspondence without searching decoded text for a later match.
const DECODED_TEXT = "dice-decoded-text";
const SOURCE_TEXT = "dice-source-text";
const FROM_MARKDOWN_EXTENSIONS = "fromMarkdownExtensions";

interface MarkdownToken {
  readonly start: { readonly offset: number; readonly line: number; readonly column: number };
  readonly end: { readonly offset: number; readonly line: number; readonly column: number };
}

interface MarkdownCompileContext {
  readonly stack: MarkdownNode[];
}

function enterText(this: MarkdownCompileContext, token: MarkdownToken, type: string): void {
  // Native text-token enter runs on its current parent; native exit owns decoding and end positions.
  const parent = this.stack.at(-1) as MarkdownNode & { children: MarkdownNode[] };
  const node: MarkdownNode = { type, value: "", position: { start: token.start, end: token.end } };
  parent.children.push(node);
  this.stack.push(node);
}

function enterDecoded(this: MarkdownCompileContext, token: MarkdownToken): void {
  enterText.call(this, token, DECODED_TEXT);
}

function enterSource(this: MarkdownCompileContext, token: MarkdownToken): void {
  enterText.call(this, token, SOURCE_TEXT);
}

interface MarkdownCompilerExtension {
  readonly enter: {
    readonly data: typeof enterSource;
    readonly characterReference: typeof enterDecoded;
    readonly characterEscape: typeof enterDecoded;
  };
}

interface DiceProcessor {
  readonly data: {
    (key: typeof FROM_MARKDOWN_EXTENSIONS): MarkdownCompilerExtension[] | undefined;
    (key: typeof FROM_MARKDOWN_EXTENSIONS, value: MarkdownCompilerExtension[]): void;
  };
}

function diceText(raw: string, start: number, permitted: ReadonlySet<number>): MarkdownNode[] {
  let offset = start;
  return tokenizeContent(raw).map((span) => {
    const at = offset;
    const bytes = contentSpanRaw(span);
    offset += bytes.length;
    return span.kind === "dice" && permitted.has(at)
      ? {
          type: "text",
          value: span.raw,
          data: {
            hName: "span",
            hChildren: [
              {
                type: "element",
                tagName: "span",
                properties: {},
                children: [{ type: "text", value: span.raw }],
              },
            ],
          },
        }
      : { type: "text", value: bytes };
  });
}

function walk(node: MarkdownNode, source: string, permitted: ReadonlySet<number>): void {
  if (node.children === undefined || node.type === "code" || node.type === "inlineCode" || node.type === "html") {
    return;
  }
  const next: MarkdownNode[] = [];
  let start: number | null = null;
  let end = 0;
  const flushSource = (): void => {
    if (start !== null) {
      next.push(...diceText(source.slice(start, end), start, permitted));
      start = null;
    }
  };
  for (const child of node.children) {
    // Micromark can split ordinary data around an unmatched bracket. Join only contiguous ORIGINAL
    // source ranges, never across a decoded token or structural Markdown bytes omitted by the parser.
    if (child.type === SOURCE_TEXT && child.position !== undefined) {
      if (start !== null && end !== child.position.start.offset) {
        flushSource();
      }
      start ??= child.position.start.offset;
      end = child.position.end.offset;
      continue;
    }
    flushSource();
    if (child.type === DECODED_TEXT) {
      child.type = "text";
    } else {
      walk(child, source, permitted);
    }
    next.push(child);
  }
  flushSource();
  node.children = next;
}

/** Keeps native decoded tokens separate until the source-faithful inline dice projection finishes. */
export function remarkInlineDice(this: unknown): (tree: unknown, file: { value: unknown }) => void {
  const processor = this as DiceProcessor;
  processor.data(FROM_MARKDOWN_EXTENSIONS, [
    ...(processor.data(FROM_MARKDOWN_EXTENSIONS) ?? []),
    { enter: { data: enterSource, characterReference: enterDecoded, characterEscape: enterDecoded } },
  ]);
  return (tree, file): void => {
    const source = String(file.value);
    const permitted = new Set<number>();
    let offset = 0;
    for (const span of tokenizeContent(source)) {
      if (span.kind === "dice") {
        permitted.add(offset);
      }
      offset += contentSpanRaw(span).length;
    }
    walk(tree as MarkdownNode, source, permitted);
  };
}

type DiceSpanProps = ComponentProps<Exclude<NonNullable<NonNullable<StreamdownProps["components"]>["span"]>, string>>;
function DiceSpan({ node, children, ...rest }: DiceSpanProps): ReactElement {
  const spans = typeof children === "string" && node?.position === undefined ? tokenizeContent(children) : [];
  const [only] = spans;
  const dice = spans.length === 1 && only?.kind === "dice" ? only : undefined;
  return dice === undefined ? (
    <span {...rest}>{children}</span>
  ) : (
    <Badge tone="soft" size="inline" data-slot="message-dice-chip">
      <Icon icon={Dices} size="xs" />
      {dice.label} → {dice.total}
    </Badge>
  );
}

export const DICE_COMPONENTS: NonNullable<StreamdownProps["components"]> = { span: DiceSpan };
