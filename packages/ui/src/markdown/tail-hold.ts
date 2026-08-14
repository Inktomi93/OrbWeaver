// The seal's STREAMING tail-hold pre-pass (docs/design/streaming-shape-churn.md §2 "M1", §3 arm 1).
//
// THE DEFECT: markdown's block grammar is not decidable from a prefix, so the block a streamed tail is
// currently painting as is not the block it will end up being. `| a | b |` is a paragraph until the
// delimiter row `| --- | --- |` lands on the NEXT line, at which point the whole thing is re-parsed as a
// table — measured live as a `P` → `TABLE` swap 300-365ms wide, a height and column-layout jump in the
// middle of a message the user is reading. The same prefix ambiguity produces the measured 34ms `UL` →
// `P` flip at a head block (a lone `*` is a list bullet until the next character proves it was the start
// of `**bold**`), and the setext class (`text` + a following `---` retroactively promotes the paragraph
// to an `<h2>`).
//
// THE FIX IS A TRUNCATION, NEVER A REWRITE. This pre-pass only ever returns a PREFIX of its input: the
// ambiguous trailing construct is withheld from what Streamdown parses until the type is decidable, so
// the tail keeps painting as what it already is and the withheld bytes arrive — as the right block, on
// their first paint — a commit later. Because the output is always a prefix of the input, no repair,
// escape or content transformation can be attributed to this layer, and the settled render is reached by
// the same path it always was (the last commit of a stream is never ambiguous: it ends the document).
//
// This is OURS, deliberately not a patch to Streamdown's `parseIncompleteMarkdown` (remend), which owns
// the fence/inline-mark repair the caret and the #42 reveal plugin both ride on.
//
// The accepted cost, priced by the design doc: a table's first row appears one line later than it does
// today, and a bare list marker one keystroke later.
//
// COST SHAPE: everything here is O(tail) — backwards `lastIndexOf` walks over the trailing lines only —
// except the fence-parity scan, which is one character pass over the whole (already `MAX_RENDER_LENGTH`
// capped) string. That pass is not optional: withholding a line that lives INSIDE an open fence would
// make the code the user is watching flicker, so the pre-pass stands down entirely inside a fence.

// A fence OPENER or CLOSER line — up to 3 leading spaces then 3+ backticks or tildes. Odd parity means
// the tail is currently inside an unterminated fence. Hoisted (useTopLevelRegex) and read only through
// `String.match`, which zeroes `lastIndex` itself — a `/g` regex driven by `.test()` carries state
// between calls and would silently alternate true/false.
const FENCE_LINE_RE = /^ {0,3}(?:`{3,}|~{3,})/gm;

// A table-row candidate: the GFM row shape, up to 3 leading spaces then a pipe.
const PIPE_LINE_RE = /^ {0,3}\|/;

// A line whose ENTIRE content is a block marker that is still ambiguous: a run of `-`/`*`/`+`/`_`/`=`
// (list bullet vs thematic break vs setext underline vs the opening of an emphasis run) or a bare
// ordered-list marker (`1.` is an empty list item; `1.5` is a paragraph). One more character decides
// each of these, so holding the line for that character is the whole fix. Note what does NOT match:
// `- x` and `- ` are unambiguously list items, `**bold` is unambiguously a paragraph — those paint
// immediately.
const AMBIGUOUS_MARKER_RE = /^ {0,3}(?:[-*+_=]+|\d{1,9}[.)])$/;

function insideOpenFence(source: string): boolean {
  const fences = source.match(FENCE_LINE_RE);
  return fences !== null && fences.length % 2 === 1;
}

/**
 * Start index of the trailing run of pipe rows, or -1. The run is walked backwards and stops at the
 * first non-pipe line, so an ESTABLISHED table (header + delimiter already committed) is one long run
 * whose type is settled, while a first pipe row that merely follows prose is a run of one.
 */
function pipeRunStart(source: string): number {
  let end = source.length;
  // A trailing newline means the in-progress line is empty; the run is the lines before it.
  if (end > 0 && source[end - 1] === "\n") {
    end -= 1;
  }
  let runStart = -1;
  while (end > 0) {
    const start = source.lastIndexOf("\n", end - 1) + 1;
    if (!PIPE_LINE_RE.test(source.slice(start, end))) {
      break;
    }
    runStart = start;
    if (start === 0) {
      break;
    }
    end = start - 1;
  }
  return runStart;
}

/** Index at which the still-ambiguous trailing construct begins, or -1 when the tail is decidable. */
function ambiguousTailStart(source: string): number {
  const runStart = pipeRunStart(source);
  if (runStart !== -1) {
    // A pipe run's type is decided the moment its SECOND line is newline-terminated: a delimiter row
    // there makes it a table forever, anything else makes it a paragraph forever (GFM only accepts the
    // delimiter on line two). Until then the run is undecidable and must not paint.
    const run = source.slice(runStart);
    const firstBreak = run.indexOf("\n");
    if (firstBreak === -1 || run.indexOf("\n", firstBreak + 1) === -1) {
      return runStart;
    }
  }
  const finalStart = source.lastIndexOf("\n") + 1;
  if (AMBIGUOUS_MARKER_RE.test(source.slice(finalStart))) {
    return finalStart;
  }
  return -1;
}

/**
 * The streaming-mode input filter: returns the longest PREFIX of `source` whose trailing block type is
 * already decidable. Static/settled renders never call this — a settled body must render as authored.
 *
 * Two hard floors: the pre-pass stands down inside an open code fence, and it never returns a
 * blank result (a message whose whole content so far is one ambiguous marker keeps painting that marker
 * — an empty body would collapse the ghost bubble and strand the caret, a worse frame than the flip).
 */
export function holdAmbiguousTail(source: string): string {
  if (source.length === 0 || insideOpenFence(source)) {
    return source;
  }
  const cut = ambiguousTailStart(source);
  if (cut === -1) {
    return source;
  }
  const held = source.slice(0, cut);
  return held.trim() === "" ? source : held;
}
