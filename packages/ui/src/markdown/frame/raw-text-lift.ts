// A frame body's `<style>` and `<script>` text, kept whole through the Markdown parse. CommonMark ends an HTML block at
// a blank line, so a stylesheet holding one inside a block another tag opens (`<div><style>`) is cut: the parse turns
// the rest into paragraphs, `raw` replays the first paragraph's close tag inside the style and so closes it, and every
// later paragraph prints as prose. Each element's raw text is lifted before the parse (`liftRawTextBodies`) and put
// back after `raw` has rebuilt the element. Only the text moves: the tags stay, so the parse finds the same elements.
//
// THE STAND-IN MUST BE ONE NO REPLY CAN SPELL. It is a private-use mark around the text's index, and the mark is one
// the text neither holds nor names by number after a `#` (`&#57344;`, `&#xE000`, `&amp;#xE000;`): before the restore,
// the parse makes new characters only by decoding character references, and no named reference is a private-use
// character. The mark is one such character, or, in a text that holds or names every one, a pair of them that never
// stand next to each other in the text with each reference read as its character. KaTeX can make any character, but
// Streamdown runs math after the caller's rehype steps, so the restore never reads its output.
// `tests/ui/markdown/frame-lift.dom.test.ts` turns red if that order changes.
//
// EACH TEXT GOES BACK ONCE, at its first stand-in in tree order, and any later copy of a stand-in (a reference link
// copies its definition's title into every link) drops to nothing. The restore therefore adds at most the lifted texts'
// length, whatever the input, even if a stand-in were ever forged. A text goes back as the text it was wherever the
// parse put its stand-in: in its element, and also in a text node or an attribute value where the parse did not read
// the tags as an element, so the reply reads as it would with no lift.
//
// THE RESTORE RUNS AFTER `raw`, ON THE BUILT TREE, NEVER ON THE MARKDOWN: a text put back outside its element lands in
// a text node, a comment or an attribute value, which the render escapes or drops, so it can never become markup there.
// THE LIFT IS NO ESCAPE INSIDE ITS ELEMENT: the render writes a style or script element's text raw, so whatever that
// text does in the frame document it does exactly as the same reply unlifted would. The guard is the frame's CSP for
// its posture, never this file.
//
// THE BODIES RIDE THE PLUGIN'S OPTIONS, NEVER A CLOSURE: Streamdown caches its processor under each plugin's function
// name and the JSON of its options, so a closure would hand one reply's stylesheet to the next reply that has the same
// shape. With the options in the key, a cached processor only ever serves the same bodies.

import { liftRawTextBodies } from "@orb/kit/content";
import type { StreamdownProps } from "streamdown";

const PRIVATE_USE_FIRST = 0xe0_00;
const PRIVATE_USE_LAST = 0xf8_ff;

type HastPropertyValue = string | number | boolean | null | undefined | (string | number)[];

/** Minimal structural hast shapes; ui carries no hast type dependency (the `reveal-plugin.ts` precedent). */
interface HastNode {
  readonly type: string;
  value?: string;
  readonly properties?: Record<string, HastPropertyValue>;
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

// A number after `#`, in hex after `#x`: what a character reference decodes to, with or without its `&` or `;`, and with
// any run of `amp;` an escaped reference carries.
const NUMBERED_CHARACTER_RE = /(?:&(?:amp;)*)?#(?:[xX]0*([0-9A-Fa-f]{1,8})|0*(\d{1,10}));?/g;
const HEX = 16;
const DECIMAL = 10;
const PRIVATE_USE_COUNT = PRIVATE_USE_LAST - PRIVATE_USE_FIRST + 1;

function isPrivateUse(code: number): boolean {
  return code >= PRIVATE_USE_FIRST && code <= PRIVATE_USE_LAST;
}

// `text` with each numbered reference read as the character it names: the characters the parse could put side by side.
function asDecoded(text: string): string {
  return text.replace(NUMBERED_CHARACTER_RE, (_reference, hex: string | undefined, decimal: string | undefined) => {
    const code = hex === undefined ? Number.parseInt(decimal ?? "", DECIMAL) : Number.parseInt(hex, HEX);
    return isPrivateUse(code) ? String.fromCharCode(code) : " ";
  });
}

// The mark no reply text can spell (see the header): the lowest private-use character the decoded text lacks, else the
// lowest pair of them it never holds side by side. A text has fewer pairs than its length, and there are forty million
// pairs, so one is always free. One pass over the text and one over the marks it rules out.
function freeMark(text: string): string {
  const decoded = asDecoded(text);
  const held = new Set<number>();
  const pairs = new Set<number>();
  for (let index = 0; index < decoded.length; index += 1) {
    const code = decoded.charCodeAt(index);
    if (!isPrivateUse(code)) {
      continue;
    }
    held.add(code);
    const next = decoded.charCodeAt(index + 1);
    if (isPrivateUse(next)) {
      pairs.add((code - PRIVATE_USE_FIRST) * PRIVATE_USE_COUNT + (next - PRIVATE_USE_FIRST));
    }
  }
  for (let code = PRIVATE_USE_FIRST; code <= PRIVATE_USE_LAST; code += 1) {
    if (!held.has(code)) {
      return String.fromCharCode(code);
    }
  }
  let pair = 0;
  while (pairs.has(pair)) {
    pair += 1;
  }
  return String.fromCharCode(PRIVATE_USE_FIRST + Math.floor(pair / PRIVATE_USE_COUNT), PRIVATE_USE_FIRST + (pair % PRIVATE_USE_COUNT));
}

// The tree unified hands a rehype step is a hast root; the guard only names that to the checker.
function isHastNode(value: unknown): value is HastNode {
  return typeof value === "object" && value !== null && "type" in value;
}

function restore(node: HastNode, put: (text: string) => string): void {
  if (node.value !== undefined) {
    node.value = put(node.value);
  }
  const properties = node.properties ?? {};
  for (const [name, value] of Object.entries(properties)) {
    if (typeof value === "string") {
      properties[name] = put(value);
    } else if (Array.isArray(value)) {
      properties[name] = value.map((item) => (typeof item === "string" ? put(item) : item));
    }
  }
  for (const child of node.children ?? []) {
    restore(child, put);
  }
}

// The rehype step; its name is half of Streamdown's cache key, the options the other half.
function restoreRawText({ mark, bodies }: Lifted): (tree: unknown) => void {
  const standIn = new RegExp(`${mark}(\\d+)${mark}`, "gu");
  return (tree) => {
    // Each body goes back once per render; a copy of a stand-in already met, or one naming no body, drops.
    const restored = new Set<number>();
    const put = (text: string): string =>
      text.replace(standIn, (_match, digits: string) => {
        const index = Number(digits);
        const body = restored.has(index) ? undefined : bodies[index];
        restored.add(index);
        return body ?? "";
      });
    if (isHastNode(tree)) {
      restore(tree, put);
    }
  };
}

/** Lift each element's raw text out of `markdown` for the parse (`liftRawTextBodies`); see the file header. */
export function liftRawText(markdown: string): RawTextLift {
  const mark = freeMark(markdown);
  const lifted = liftRawTextBodies(markdown, mark);
  if (lifted.bodies.length === 0) {
    return { text: markdown, rehypePlugins: [] };
  }
  const options: Lifted = { mark, bodies: lifted.bodies };
  return { text: lifted.text, rehypePlugins: [[restoreRawText, options]] };
}
