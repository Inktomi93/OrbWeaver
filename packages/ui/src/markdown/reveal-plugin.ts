// The #42 streamed-word reveal plugin — the seal's OWN replacement for Streamdown's `animated` arm
// (docs/design/streaming-reveal-42.md). Wraps every prose word of a streaming block in
// `<span data-orb-reveal style="animation-delay:-<age>ms">`; `ui/src/styles/globals.css` animates
// `[data-orb-reveal]` with the `orb-word-reveal` opacity fade (`--motion-base` · `--ease-out-expo` ·
// `fill both`).
//
// THE LOAD-BEARING IDEA IS REVEAL-TIME ANCHORING: fade progress derives from WHEN a character was
// first revealed (the negative `animation-delay`), never from the animation's own lifetime. A span
// whose DOM node React reuses keeps its running fade untouched (old words get a constant clamped
// delay, so their style bytes never change); a span whose node gets REPLACED mid-fade — remend
// repairing `**torn` emphasis into `<em>`, a dialogue-tint re-split, a Lexer re-block — RESUMES at
// the right opacity instead of restarting from transparent or snapping opaque. That is what
// Streamdown's own `--sd-duration:0`/`prevContentLength` machinery structurally cannot do at this
// app's commit cadence (measured 17-85ms/commit vs a 150ms+ fade — see the design doc §1 D3), and
// why the stock `animated` prop was dropped rather than merely having its CSS imported.
//
// Statefulness contract: ONE instance per streaming `<Markdown>` mount (markdown.tsx holds it in a
// ref). Streamdown memoizes settled blocks, so in practice each rehype run sees only the growing
// TAIL block — the char-offset log is per-block, and a shrink (`total < lastCount`) means a NEW tail
// block (or a stream reset): the log resets and the fresh block's words fade in as they arrive. A
// rare block-boundary reshuffle re-running an OLD block replays at most one fade — visually benign.

/** Minimal structural hast shapes (ui carries no hast/unified type deps; Streamdown's own plugin
 *  contract is the same structural walk). Not exported — internal to the walker. */
interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
interface HastParent {
  type: string;
  children: HastNode[];
}
type HastNode = HastText | HastElement | (HastParent & { type: "root" }) | { type: string };

/** Ancestors whose text is never word-wrapped: code and math render through their own engines, and a
 *  span minted inside them corrupts the source text they re-read (same set Streamdown's animate arm
 *  skips, PLUS the pre-katex `math`/`katex` class guard it only gets by running after the math
 *  plugin — this plugin runs BEFORE math in the pipeline, so the class guard is load-bearing). */
const SKIP_TAGS = new Set(["code", "pre", "svg", "math", "annotation", "script", "style"]);
const SKIP_CLASS_RE = /(?:^|\s)(?:math|katex)/u;

/** Age clamp (ms). A span at the clamp carries `animation-delay:-400ms` — with `fill both` and a
 *  220ms fade the animation is already finished, so the style is CONSTANT for every settled word
 *  (no attr churn) while still being remount-safe. Only spans younger than this rewrite per render. */
const REVEAL_AGE_CAP_MS = 400;

const WHITESPACE_ONLY_RE = /^\s+$/u;
const WHITESPACE_CHAR_RE = /\s/u;

/** One reveal-watermark segment: chars with offset below `upTo` (and at/above the previous entry's
 *  `upTo`) were first seen at `at`. */
interface RevealSegment {
  upTo: number;
  at: number;
}

export interface RevealPlugin {
  /** The unified rehype plugin — append AFTER Streamdown's default [raw, sanitize, harden] set
   *  (attributes minted post-sanitize survive, exactly like the stock animate arm's). */
  readonly rehypePlugin: () => (tree: unknown) => void;
}

/** Split a text run into alternating whitespace/word tokens (whitespace runs stay bare text). */
function splitWords(value: string): string[] {
  const tokens: string[] = [];
  let run = "";
  let inSpace = false;
  for (const ch of value) {
    const isSpace = WHITESPACE_CHAR_RE.test(ch);
    if (isSpace !== inSpace && run !== "") {
      tokens.push(run);
      run = "";
    }
    run += ch;
    inSpace = isSpace;
  }
  if (run !== "") {
    tokens.push(run);
  }
  return tokens;
}

function isElement(node: HastNode): node is HastElement {
  return node.type === "element";
}

function hasChildren(node: HastNode): node is HastParent & HastNode {
  return "children" in node && Array.isArray((node as HastParent).children);
}

function flattenClassName(cls: unknown): string {
  if (Array.isArray(cls)) {
    return cls.join(" ");
  }
  return typeof cls === "string" ? cls : "";
}

function skips(node: HastElement): boolean {
  return SKIP_TAGS.has(node.tagName) || SKIP_CLASS_RE.test(flattenClassName(node.properties?.["className"]));
}

/** Total text chars in walk order (walk order is render order, so offsets are stable across runs of
 *  the same growing block). */
function countChars(node: HastNode): number {
  if (node.type === "text") {
    return (node as HastText).value.length;
  }
  if (!hasChildren(node)) {
    return 0;
  }
  let total = 0;
  for (const child of (node as HastParent).children) {
    total += countChars(child);
  }
  return total;
}

/** The per-run wrap state: the running char offset + the age answerer for this run's timestamp. */
interface WrapState {
  offset: number;
  readonly ageAt: (offset: number) => number;
}

function revealSpan(token: string, age: number): HastElement {
  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-orb-reveal": true,
      // Negative delay = resume mid-fade; constant at the cap for settled words (stable bytes).
      style: `animation-delay:-${Math.round(age)}ms`,
    },
    children: [{ type: "text", value: token } satisfies HastText],
  };
}

/** One text node → its word spans + bare whitespace tokens, advancing the running offset. */
function wrapTextNode(text: HastText, state: WrapState): HastNode[] {
  const out: HastNode[] = [];
  for (const token of splitWords(text.value)) {
    const start = state.offset;
    state.offset += token.length;
    if (WHITESPACE_ONLY_RE.test(token)) {
      out.push({ type: "text", value: token } satisfies HastText);
      continue;
    }
    out.push(revealSpan(token, state.ageAt(start)));
  }
  return out;
}

/** Depth-first wrap. Skipped subtrees still ADVANCE the offset (offset stability is what keeps a
 *  word's reveal identity constant across runs — see the header). */
function wrapTree(node: HastNode, skipped: boolean, state: WrapState): void {
  if (!hasChildren(node)) {
    return;
  }
  const parent = node as HastParent;
  const skipHere = skipped || (isElement(node) && skips(node));
  const next: HastNode[] = [];
  for (const child of parent.children) {
    if (child.type !== "text") {
      wrapTree(child, skipHere, state);
      next.push(child);
      continue;
    }
    const text = child as HastText;
    if (skipHere || text.value.length === 0 || WHITESPACE_ONLY_RE.test(text.value)) {
      state.offset += text.value.length;
      next.push(child);
      continue;
    }
    next.push(...wrapTextNode(text, state));
  }
  parent.children = next;
}

/**
 * Create one reveal-plugin instance (one per streaming Markdown mount). `now` is injectable for
 * deterministic tests; production uses the wall clock the animations themselves run on.
 */
export function createRevealPlugin(now: () => number = () => performance.now()): RevealPlugin {
  let lastCount = 0;
  let log: RevealSegment[] = [];

  /** Age (ms, clamped) of the character at `offset` per the watermark log. Every offset below this
   *  run's total is covered (the covering segment is appended before wrapping); offsets below the
   *  pruned floor answer with the cap via the surviving oldest segment. */
  const ageOf = (offset: number, at: number): number => {
    for (const seg of log) {
      if (offset < seg.upTo) {
        return Math.min(REVEAL_AGE_CAP_MS, Math.max(0, at - seg.at));
      }
    }
    return 0;
  };

  const rehypePlugin =
    () =>
    (tree: unknown): void => {
      const t = now();
      const total = countChars(tree as HastNode);

      // Watermark upkeep: a shrink = a new tail block / stream reset; growth appends one segment.
      if (total < lastCount) {
        log = [];
      }
      const seen = log.length > 0 ? (log.at(-1) as RevealSegment).upTo : 0;
      if (total > seen) {
        log.push({ upTo: total, at: t });
      }
      lastCount = total;
      // Prune: drop leading segments once the NEXT segment also answers with the cap (everything
      // below the survivor's floor keeps reading as fully settled).
      while (log.length > 1 && t - (log[0] as RevealSegment).at > REVEAL_AGE_CAP_MS && t - (log[1] as RevealSegment).at > REVEAL_AGE_CAP_MS) {
        log.shift();
      }

      wrapTree(tree as HastNode, false, { offset: 0, ageAt: (offset): number => ageOf(offset, t) });
    };

  return { rehypePlugin };
}
