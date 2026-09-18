// Comment blanking for the LINE-SCANNING gates (issue #117): a `#106` issue citation in a comment read as
// a 3-digit hex color and reddened two lanes in one day. The harness is pure-AST by its own law
// (tooling/src/verify/gates/GATE-AUTHORING.md §1) — comments are trivia a value scan must skip. Both helpers return text of the
// SAME LENGTH with comment characters replaced by spaces and newlines preserved, so a caller's
// `split("\n")` line numbers and column offsets stay exact.
import type { SourceFile } from "ts-morph";
import { Project, ScriptKind, SyntaxKind, ts } from "ts-morph";

const SPACE = " ";
const CSS_COMMENT_CLOSE = "*/";

/** Replace `[start,end)` with spaces, keeping every newline (line count + offsets are invariant). */
function blankRange(text: string, start: number, end: number): string {
  const span = text.slice(start, end).replace(/[^\n]/gu, SPACE);
  return text.slice(0, start) + span + text.slice(end);
}

/** Every comment span in a parsed TS/TSX file, blanked. Comments are TRIVIA: they attach as leading
 *  ranges of some TOKEN, so the walk behind this (`forEachCommentRange`) scans the token gaps and not just
 *  the `forEachChild` nodes — a comment before a `)` / `}` / EOF is covered too, which a node-only walk
 *  misses. Using the real parse rather than a hand-rolled scanner is what keeps a `//` inside a string or
 *  a regex literal from being mistaken for a comment opener.
 *
 *  BOTH SIDES, and the second one is not optional (issue #132): TypeScript classifies a comment on the
 *  SAME LINE as the code before it as TRAILING trivia of that node, and `getLeadingCommentRanges` never
 *  returns it — so a leading-only sweep silently leaves every `code(); // …` comment in the scanned text.
 *  That is the single most common comment position in this repo's tests, and it was #117's residual hole. */
export function blankTsComments(sf: SourceFile): string {
  const cached = blanked.get(sf);
  if (cached !== undefined) {
    return cached;
  }
  const text = blankTsCommentsUncached(sf);
  blanked.set(sf, text);
  return text;
}

/** Keyed on the SourceFile OBJECT, so it cannot bleed across runs the way a path key would (conformance
 *  drives many mini-projects through one process and reuses virtual paths), and it releases with the
 *  project. Gates are read-only by contract, so a cached blanking cannot go stale under one. */
const blanked = new WeakMap<SourceFile, string>();

/** Visit EVERY comment range in a parsed file, in document (pre-)order, with the RAW compiler node whose
 *  trivia carries it. The ONE walk behind the blanker and the trivia-reading gates.
 *
 *  WHY TOKENS AND NOT `forEachDescendant`: a comment attaches as leading/trailing trivia of whatever token
 *  follows or precedes it, and that is routinely a `)` / `}` / EOF that a node-only walk never reaches.
 *  Measured 2026-09-02 over 1,712 real files (462 `*.ct.tsx` + 1,250 `packages/client/src`),
 *  `forEachDescendant` lost 41 and 831 comment ranges respectively — in the PERMISSIVE direction, which is
 *  the dangerous one (tooling/src/verify/gates/GATE-AUTHORING.md §5; issue #117 is the incident).
 *
 *  WHY A GAP SCANNER AND NOT `node.getChildren()`: the previous walk reached the tokens through TypeScript's
 *  `getChildren`, which SYNTHESISES a token node for every keyword and punctuation mark and caches the whole
 *  token tree on a per-file WeakMap for the life of the Program — over the composed pass that cache was
 *  1.4 GB of the live heap (4,760 → 3,371 MB with the walk node-only, measured 2026-09-06) and ~2.5 s of
 *  CPU. Tokens only ever live in the GAPS between a node's `forEachChild` children (that is exactly how
 *  `getChildren` finds them), and a gap holds nothing but keywords, punctuation and trivia — every string,
 *  template chunk, regex, JSX text and identifier is a node of its own — so a plain scanner over each gap
 *  is context-free and finds every token a synthetic node would have stood for, with no node allocated.
 *  Each gap token and each node is then read exactly as before (`getLeadingCommentRanges` at its `pos`,
 *  `getTrailingCommentRanges` at its `end`), which keeps the range set byte-identical to the token walk
 *  over the whole workspace (7,264 files, the `reports/scratch` differential, 2026-09-06). A gap comment's carrier is the node that owns the gap —
 *  the token's `parent` in the old walk, and every consumer walked up to it anyway. */
export function forEachCommentRange(sf: SourceFile, visit: (range: ts.CommentRange, carrier: ts.Node) => void): void {
  const root = sf.compilerNode;
  const text = root.text;
  const scanner = gapScanner(text);
  const emit = (ranges: readonly ts.CommentRange[] | undefined, carrier: ts.Node): void => {
    for (const range of ranges ?? []) {
      visit(range, carrier);
    }
  };
  // Every TOKEN in a gap is read exactly as the token walk read its synthetic node: leading ranges at the
  // token's full start (the previous token's end — `addSyntheticNodes` gives the node that `pos`) and
  // trailing ranges at its end. Both reads are load-bearing and not interchangeable: TypeScript's leading
  // reader skips a comment that sits on the SAME LINE as the token before it, so `x: [], // note` reaches
  // a walker ONLY as the trailing range of the comma — the class the first draft of this scanner lost on
  // 140 files (the oracle, 2026-09-06). A comment between two gap tokens on a later line is the second
  // token's leading range; a comment after the last gap token is that token's trailing range; a comment
  // after a newline in a child's leading trivia is the child's own node-level leading range below.
  const scanGap = (pos: number, end: number, carrier: ts.Node): void => {
    if (pos >= end) {
      return;
    }
    scanner.resetTokenState(pos);
    for (;;) {
      const kind = scanner.scan();
      const tokenEnd = scanner.getTokenEnd();
      if (kind === SyntaxKind.EndOfFileToken || tokenEnd > end) {
        break;
      }
      emit(ts.getLeadingCommentRanges(text, scanner.getTokenFullStart()), carrier);
      emit(ts.getTrailingCommentRanges(text, tokenEnd), carrier);
      if (tokenEnd >= end) {
        break;
      }
    }
  };
  const walk = (node: ts.Node): void => {
    emit(ts.getLeadingCommentRanges(text, node.pos), node);
    emit(ts.getTrailingCommentRanges(text, node.end), node);
    // Gaps exist only inside a real syntax node (`kind >= FirstNode`, TypeScript's own `isNodeKind`); a
    // TOKEN node — identifier, string, template chunk, JSX text, keyword — has no children and its whole
    // span IS the token, which `getChildren` never scans either. Scanning it would read the `/*` inside a
    // template string as a comment (the oracle caught exactly that on 33 files before this fence).
    if (node.kind < SyntaxKind.FirstNode) {
      return;
    }
    let cursor = node.pos;
    ts.forEachChild(node, (child) => {
      scanGap(cursor, child.pos, node);
      walk(child);
      cursor = child.end;
    });
    scanGap(cursor, node.end, node);
  };
  walk(root);
}

/** One reusable token scanner per text (skipTrivia ON, the same posture as TypeScript's own `getChildren`
 *  synthesiser). Standard variant on purpose: a gap never contains JSX text or a regex, the two places the
 *  variant would matter. */
function gapScanner(text: string): ts.Scanner {
  return ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
}

function blankTsCommentsUncached(sf: SourceFile): string {
  let text = sf.getFullText();
  const seen = new Set<number>();
  const spans: { readonly pos: number; readonly end: number }[] = [];
  forEachCommentRange(sf, (range) => {
    if (!seen.has(range.pos)) {
      seen.add(range.pos);
      spans.push({ pos: range.pos, end: range.end });
    }
  });
  // Descending so an earlier blank can never move a later span's offsets (lengths are preserved anyway;
  // the order makes that independent of the invariant).
  for (const span of spans.sort((a, b) => b.pos - a.pos)) {
    text = blankRange(text, span.pos, span.end);
  }
  return text;
}

let scratchProject: Project | undefined;

/** Comment-only twin for fs-read TypeScript/config files whose string literals remain semantic input
 *  (imports, plugin names, paths). Uses the same parser-backed scratch door as the prose-blanking arm. */
export function blankTsCommentsInText(text: string): string {
  scratchProject ??= new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  const sf = scratchProject.createSourceFile("comment-scan.tsx", text, { overwrite: true, scriptKind: ScriptKind.TSX });
  return blankTsCommentsUncached(sf);
}

/** Parse fs-read JS-family text into the reused scratch SourceFile so a TRIVIA reader (`suppressionSites`)
 *  can run over a file the workspace walk does not carry (`.js`/`.mjs`/`.cjs`/`.jsx` — `no-blanket-suppression`
 *  arm B, #962). Same door, same caveat as the blankers above: the SourceFile OBJECT is reused across calls,
 *  so a caller consumes the result before its next call and never caches on the object. */
export function parseScratch(text: string): SourceFile {
  scratchProject ??= new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  return scratchProject.createSourceFile("comment-scan.tsx", text, { overwrite: true, scriptKind: ScriptKind.TSX });
}

/** The string-prose token kinds: every span whose text is DATA, never a code reference. Template
 *  interpolation EXPRESSIONS are separate AST nodes and are deliberately not here — a real call inside
 *  a `${…}` is code and must survive the blanking. */
const STRING_PROSE_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
  SyntaxKind.JsxText,
  SyntaxKind.RegularExpressionLiteral,
];

/** Comment PLUS string-prose blanking for PRESENCE checks over fs-read corpora where a name inside a
 *  STRING must not satisfy the check (the same permissive-direction lie as a commented-out call, wearing
 *  quotes: a vitest description `it("calls doThing( …")` is prose, not coverage — test-presence-client
 *  clause C reported clean over exactly that shape until 2026-08-24). It parses into ONE lazily-created
 *  in-memory scratch project (reused, file overwritten per call), which is NOT the banned "a gate never
 *  does `new Project(`" shape from tooling/src/verify/gates/GATE-AUTHORING.md §1: nothing here walks the workspace or resolves a
 *  dependency. String literals, template CHUNKS (head/middle/tail — interpolated expressions stay), JSX
 *  text, and regex literals are blanked; length and newlines preserved, same as every other door here. */
export function blankTsCommentsAndStringsInText(text: string): string {
  scratchProject ??= new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  const sf = scratchProject.createSourceFile("comment-scan.tsx", text, { overwrite: true, scriptKind: ScriptKind.TSX });
  let out = blankTsCommentsUncached(sf);
  const spans: { readonly pos: number; readonly end: number }[] = [];
  sf.forEachDescendant((node) => {
    if (STRING_PROSE_KINDS.includes(node.getKind())) {
      spans.push({ pos: node.getStart(), end: node.getEnd() });
    }
  });
  for (const span of spans.sort((a, b) => b.pos - a.pos)) {
    out = blankRange(out, span.pos, span.end);
  }
  return out;
}

/** The CANDIDATE FENCE, hoisted here because every caller needs it and it is a MEMORY decision, not a
 *  micro-optimisation: `blankTsComments` walks `getDescendants()`, which materialises every wrapped node for
 *  the file, and doing that for a whole tier (~1,900 test files) OOMs the run (measured: heap limit at 4GB,
 *  exit 134 — issue #132). It is SOUND because blanking only ever REMOVES matches: a file whose RAW text
 *  cannot match cannot match after comments are blanked either, so the raw text is a safe stand-in for a
 *  non-candidate. Callers must only ASK THIS TEXT WHETHER SOMETHING MATCHES — never hand it on as "the code". */
export function codeTextForScan(sf: SourceFile, couldMatch: (raw: string) => boolean): string {
  const raw = sf.getFullText();
  return couldMatch(raw) ? blankTsComments(sf) : raw;
}

/** Does this needle occur in the file's CODE? The presence-check door: a needle named only in a comment is
 *  prose, and reading prose as code has now cost two gates (issue #117 hex colors, #132 determinism calls) —
 *  in the PERMISSIVE direction it is worse, because a comment mentioning the thing SATISFIES the check and
 *  the gate goes silently green. Fenced: the raw `includes` runs first, so a non-candidate never parses. */
export function codeIncludes(sf: SourceFile, needle: string): boolean {
  return sf.getFullText().includes(needle) && blankTsComments(sf).includes(needle);
}

/** Index just past the quoted string literal starting at `i` (an unterminated one runs to EOF). Shared
 *  by the CSS and the JSON-with-comments lexers below — both quote with `"`/`'` and escape with `\`. */
function endOfQuotedString(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\") {
      j += 2;
      continue;
    }
    if (text[j] === quote) {
      return j + 1;
    }
    j += 1;
  }
  return j;
}

/** One comment span in a NON-TS text file (CSS, JSON-with-comments): its `[pos, end)` offsets and text. */
export interface TextCommentSpan {
  readonly pos: number;
  readonly end: number;
  readonly text: string;
}

/** Every comment span in a text file, in document order, QUOTE-AWARE (a comment opener inside a string
 *  value is not a comment). Block comments always; `//` line comments only when the language has them —
 *  JSON-with-comments does (`json.parser.allowComments` is on in this repo's biome.json), CSS does not (the
 *  `//` in `url(https://…)` is deliberately left alone). The ONE non-TS comment lexer: the CSS blanker and
 *  the directive readers (`no-blanket-suppression`) both ride it, so they cannot disagree on what a comment is. */
export function commentSpansInText(text: string, opts: { readonly lineComments: boolean }): readonly TextCommentSpan[] {
  const out: TextCommentSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = endOfQuotedString(text, i);
      continue;
    }
    const span = commentSpanAt(text, i, opts.lineComments);
    if (span === undefined) {
      i += 1;
      continue;
    }
    out.push(span);
    i = span.end;
  }
  return out;
}

/** The comment span OPENING at `i`, or undefined when `i` is not a comment opener. */
function commentSpanAt(text: string, i: number, lineComments: boolean): TextCommentSpan | undefined {
  const end = commentEndFrom(text, i, lineComments);
  return end === NOT_A_COMMENT ? undefined : { pos: i, end, text: text.slice(i, end) };
}

const NOT_A_COMMENT = -1;

/** The end offset of the comment opening at `i`, or NOT_A_COMMENT. An unterminated comment runs to EOF. */
function commentEndFrom(text: string, i: number, lineComments: boolean): number {
  const opener = text[i] === "/" ? text[i + 1] : "";
  if (opener === "*") {
    const close = text.indexOf(CSS_COMMENT_CLOSE, i + 2);
    return close === -1 ? text.length : close + CSS_COMMENT_CLOSE.length;
  }
  if (lineComments && opener === "/") {
    const newline = text.indexOf("\n", i + 2);
    return newline === -1 ? text.length : newline;
  }
  return NOT_A_COMMENT;
}

/** Every block-comment span in a CSS file's text, blanked (length-preserving, newlines kept). Rides the
 *  shared lexer above; CSS has no line-comment form, so `lineComments` is off. */
export function blankCssComments(text: string): string {
  let out = text;
  for (const span of [...commentSpansInText(text, { lineComments: false })].sort((a, b) => b.pos - a.pos)) {
    out = blankRange(out, span.pos, span.end);
  }
  return out;
}
