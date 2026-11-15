// A frame body's `<style>` and `<script>` text, kept whole through the Markdown parse. CommonMark ends an HTML block at
// a blank line, so a stylesheet holding one inside a block another tag opens (`<div><style>`) is cut: the parse turns
// the rest into paragraphs, `raw` replays the first paragraph's close tag inside the style and so closes it, and every
// later paragraph prints as prose. Each closed element's text is lifted before the parse (`liftRawTextBodies`) and put
// back after `raw` has rebuilt the element. Only the text moves: the tags stay, so the parse finds the same elements.
//
// The stand-in is a private-use character the text does not hold around the text's index, so reply text cannot forge
// one. A text goes back only inside a `style` or `script` element, or inside inline code, where the parse kept it
// literal; a stand-in anywhere else is dropped, never printed. A text that holds every private-use character is left as
// it is.
//
// THE BODIES RIDE THE PLUGIN'S OPTIONS, NEVER A CLOSURE: Streamdown caches its processor under each plugin's function
// name and the JSON of its options, so a closure would hand one reply's stylesheet to the next reply that has the same
// shape. With the options in the key, a cached processor only ever serves the same bodies.

import { liftRawTextBodies } from "@orb/kit/content";
import type { StreamdownProps } from "streamdown";

const PRIVATE_USE_FIRST = 0xe0_00;
const PRIVATE_USE_LAST = 0xf8_ff;
// Where a lifted text goes back: the element it was lifted from, or inline code that shows it as written.
const TEXT_HOMES: ReadonlySet<string> = new Set(["style", "script", "code"]);

/** Minimal structural hast shapes; ui carries no hast type dependency (the `reveal-plugin.ts` precedent). */
interface HastNode {
  readonly type: string;
  value?: string;
  readonly tagName?: string;
  readonly children?: HastNode[];
}

interface Lifted {
  readonly mark: string;
  readonly bodies: readonly string[];
}

/** The text the parse reads, and the rehype steps that put the lifted texts back. */
export interface RawTextLift {
  readonly text: string;
  readonly rehypePlugins: NonNullable<StreamdownProps["rehypePlugins"]>;
}

// The lowest private-use character `text` does not hold, or undefined when it holds them all. One pass.
function absentPrivateUse(text: string): string | undefined {
  const held = new Set<number>();
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= PRIVATE_USE_FIRST && code <= PRIVATE_USE_LAST) {
      held.add(code);
    }
  }
  for (let code = PRIVATE_USE_FIRST; code <= PRIVATE_USE_LAST; code += 1) {
    if (!held.has(code)) {
      return String.fromCharCode(code);
    }
  }
  return undefined;
}

// The tree unified hands a rehype step is a hast root; the guard only names that to the checker.
function isHastNode(value: unknown): value is HastNode {
  return typeof value === "object" && value !== null && "type" in value;
}

function restore(node: HastNode, standIn: RegExp, bodies: readonly string[], home: boolean): void {
  if (node.type === "text" && node.value !== undefined) {
    node.value = node.value.replace(standIn, (_match, index: string) => (home ? (bodies[Number(index)] ?? "") : ""));
  }
  const inHome = home || (node.type === "element" && TEXT_HOMES.has(node.tagName ?? ""));
  for (const child of node.children ?? []) {
    restore(child, standIn, bodies, inHome);
  }
}

// The rehype step; its name is half of Streamdown's cache key, the options the other half.
function restoreRawText({ mark, bodies }: Lifted): (tree: unknown) => void {
  const standIn = new RegExp(`${mark}(\\d+)${mark}`, "gu");
  return (tree) => {
    if (isHastNode(tree)) {
      restore(tree, standIn, bodies, false);
    }
  };
}

/** Lift each closed `<style>` and `<script>` text out of `markdown` for the parse; see the file header. */
export function liftRawText(markdown: string): RawTextLift {
  const mark = absentPrivateUse(markdown);
  const lifted = mark === undefined ? undefined : liftRawTextBodies(markdown, mark);
  if (mark === undefined || lifted === undefined || lifted.bodies.length === 0) {
    return { text: markdown, rehypePlugins: [] };
  }
  const options: Lifted = { mark, bodies: lifted.bodies };
  return { text: lifted.text, rehypePlugins: [[restoreRawText, options]] };
}
