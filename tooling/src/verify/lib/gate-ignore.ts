// The `@orb-gate-ignore` marker grammar and its MENTION FENCE — ONE spelling, shared by the suppressor
// (lib/pass.ts, which honours a marker) and by `gate-ignore-inventory` (which audits markers). A gate that
// re-spelled either half would drift out of agreement with the thing it audits, so both readers import
// from here. Split out of the single-pass dispatcher at the @orb/tooling P6 move (size cap, §4.3).
// TWO suppression arms, one grammar (#828): `findGateIgnore` walks a reported NODE's leading trivia
// (block-scoped, §4.3b); `findGateIgnoreAtLine` binds LINE-ADJACENTLY for the `Finding` overload, which has
// no node to read trivia from.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateIgnoreMarker } from "../contract/pass.ts";

/** The house exemption-marker grammar (GATE-AUTHORING.md §4.3):
 *  `// @orb-gate-ignore <gate-name>[(<position>)]: <reason>`.
 *
 *  The pattern is deliberately PERMISSIVE about the tail so a malformed marker is still RECOGNISED as an
 *  attempted marker — `parseGateIgnoreMarker` then judges it. A marker that only the suppressor knew
 *  about would be invisible to `gate-ignore-inventory`, which is the gate that reds bare/stale ones.
 *
 *  THE MENTION FENCE (docs/history/design/gate-ignore-mention-fence.md): a marker IS a `//` comment whose own
 *  text begins with the vocabulary. Marker-shaped text anywhere else — inside a string/template/JSX/regex
 *  literal, or embedded LATER in a comment's text (a backtick quotation in prose, a JSDoc example) — is a
 *  MENTION of the grammar, never a use of it. Both readers enforce the same fence: the suppressor anchors
 *  the parse at the comment's start (a quotation above a reported node must never absolve it — that was a
 *  live bypass), and the inventory's scanner counts only comment-OPENER matches (so gate doc-prose can
 *  document the grammar without self-flagging, which is what let scanRoot include the gate corpus).
 *  Groups: 1 = gate name · 2 = the optional position name · 3 = everything after it. */
const GATE_IGNORE_SOURCE = String.raw`//\s*@orb-gate-ignore\s+([a-zA-Z0-9-]+)(?:\(\s*([^)\n]*?)\s*\))?(.*)`;

/** Judge one recognised marker against the §4.3 grammar. */
function judgeGateIgnore(gate: string, rawPosition: string | undefined, tail: string): GateIgnoreMarker {
  const afterName = tail.trimStart();
  const reason = afterName.startsWith(":") ? afterName.slice(1).trim() : "";
  const positionEmpty = rawPosition?.length === 0;
  return { gate, position: positionEmpty ? undefined : rawPosition, reason, malformed: reason.length === 0 || positionEmpty };
}

/** Parse ONE comment's text. `undefined` = the comment is not a gate-ignore marker at all. ANCHORED at
 *  the comment's start (the mention fence): the comment must BE the marker — a marker-shaped quotation
 *  embedded later in a prose comment's text must never parse, or a doc-comment sitting above a reported
 *  node would silently absolve it (a live bypass until 2026-08-08: a planted backtick quotation naming a
 *  live position suppressed a real `no-color-literals` finding). */
export function parseGateIgnoreMarker(commentText: string): GateIgnoreMarker | undefined {
  // Biome's type lens believes `exec` is non-nullable; tsc types it `RegExpExecArray | null` and REDS the
  // destructure without this guard. tsc wins — and a non-matching comment is the COMMON case here, so the
  // null arm is the hot path, not a theoretical one.
  // biome-ignore lint/suspicious/noUnnecessaryConditions: exec IS nullable per tsc — see above
  const m = new RegExp(`^${GATE_IGNORE_SOURCE}`, "u").exec(commentText) ?? [];
  const [, gate, position, tail] = m;
  return gate === undefined ? undefined : judgeGateIgnore(gate, position, tail ?? "");
}

/** Node kinds whose spans can legally CONTAIN a marker spelling without it being a marker (gate
 *  fixtures, doc strings, regex sources). A match inside one of these spans is prose about the
 *  vocabulary, not a use of it. */
export const GATE_IGNORE_MENTION_SPAN_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.JsxText,
  SyntaxKind.RegularExpressionLiteral,
]);

function literalSpans(sf: SourceFile): readonly (readonly [number, number])[] {
  const spans: [number, number][] = [];
  sf.forEachDescendant((node) => {
    if (GATE_IGNORE_MENTION_SPAN_KINDS.has(node.getKind())) {
      spans.push([node.getStart(), node.getEnd()]);
    }
  });
  return spans;
}

const COMMENT_SCAN_MODES = ["code", "line", "block"] as const;
type CommentScanMode = (typeof COMMENT_SCAN_MODES)[number];

/** One comment-scanner step at `i` (already outside literal spans): the next mode, the index AFTER the
 *  step, and the opener position when a `//` line comment opens here. */
function stepCommentScan(text: string, i: number, mode: CommentScanMode): { readonly mode: CommentScanMode; readonly next: number; readonly opener?: number } {
  const c = text[i];
  if (mode === "line") {
    return { mode: c === "\n" ? "code" : "line", next: i + 1 };
  }
  if (mode === "block") {
    return c === "*" && text[i + 1] === "/" ? { mode: "code", next: i + 2 } : { mode: "block", next: i + 1 };
  }
  if (c === "/" && text[i + 1] === "/") {
    return { mode: "line", next: i + 2, opener: i };
  }
  return c === "/" && text[i + 1] === "*" ? { mode: "block", next: i + 2 } : { mode: "code", next: i + 1 };
}

/** Positions where a `//` LINE COMMENT opens, outside the literal spans. Outside literals, a bare `//`
 *  in TS is always a comment opener (division needs an operand after the slash), so tracking
 *  line-comment state (to the newline) and block-comment state (to the closing star-slash) is exact:
 *  a `//` INSIDE an earlier comment (a quotation) or a block comment is not an opener. */
function lineCommentOpeners(text: string, spans: readonly (readonly [number, number])[]): ReadonlySet<number> {
  const openers = new Set<number>();
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let spanIdx = 0;
  let mode: CommentScanMode = "code";
  let i = 0;
  while (i < text.length) {
    while (spanIdx < sorted.length && (sorted[spanIdx]?.[1] ?? 0) <= i) {
      spanIdx += 1;
    }
    const span = sorted[spanIdx];
    if (mode === "code" && span !== undefined && i >= span[0]) {
      i = span[1]; // resume after the literal
      spanIdx += 1;
      continue;
    }
    const step = stepCommentScan(text, i, mode);
    if (step.opener !== undefined) {
      openers.add(step.opener);
    }
    mode = step.mode;
    i = step.next;
  }
  return openers;
}

/** Every REAL marker in a source file, with its 0-based text offset — the inventory gate's scanner. Kept
 *  HERE beside the suppressor's parser so the grammar AND its mention fence have exactly ONE spelling: a
 *  gate that re-spelled either would drift out of agreement with the thing it is auditing. Returns only
 *  matches at comment-OPENER positions outside literal spans — the same "a marker IS the comment" law the
 *  anchored `parseGateIgnoreMarker` applies on the suppression side, so everything this reports as a marker
 *  is exactly what the suppressor could honour (plus inert ATTEMPTS — e.g. a trailing marker after code,
 *  which opens a real comment but sits in no node's leading trivia, stays visible here so the STALE arm
 *  can red it rather than let it sit there looking like protection). */
export function findGateIgnoreMarkersWithSpans(
  sf: SourceFile,
  spans: readonly (readonly [number, number])[],
): readonly { readonly index: number; readonly marker: GateIgnoreMarker }[] {
  const text = sf.getFullText();
  const openers = lineCommentOpeners(text, spans);
  const out: { index: number; marker: GateIgnoreMarker }[] = [];
  for (const m of text.matchAll(new RegExp(GATE_IGNORE_SOURCE, "gu"))) {
    if (openers.has(m.index)) {
      out.push({ index: m.index, marker: judgeGateIgnore(m[1] ?? "", m[2], m[3] ?? "") });
    }
  }
  return out;
}

export function findGateIgnoreMarkers(sf: SourceFile): readonly { readonly index: number; readonly marker: GateIgnoreMarker }[] {
  return findGateIgnoreMarkersWithSpans(sf, literalSpans(sf));
}

/** Every marker in a file, indexed by its own 1-based LINE — the FINDING-arm resolver's lookup. Cached per
 *  SourceFile (the `comment-spans.ts` shape; NEVER keyed on the Project, GATE-AUTHORING.md §12), because
 *  `findGateIgnoreMarkers` walks every descendant for the mention fence and a red line-scanner reports many
 *  findings from the same file. */
const markerLineIndex = new WeakMap<SourceFile, ReadonlyMap<number, GateIgnoreMarker>>();

function markersByLine(sf: SourceFile): ReadonlyMap<number, GateIgnoreMarker> {
  const cached = markerLineIndex.get(sf);
  if (cached !== undefined) {
    return cached;
  }
  const byLine = new Map<number, GateIgnoreMarker>();
  for (const { index, marker } of findGateIgnoreMarkers(sf)) {
    byLine.set(sf.getLineAndColumnAtPos(index).line, marker);
  }
  markerLineIndex.set(sf, byLine);
  return byLine;
}

/** The FINDING-overload suppressor (#828): a `visitFile` line-scanner has no node to read leading trivia
 *  from, so its marker binds LINE-ADJACENTLY — the marker must be the comment on the line IMMEDIATELY above
 *  `line`, which is the house escape-marker law everywhere else (`biome-ignore`, `FABRICATION-OK`,
 *  `ONESHOT-OK`) and the one semantics an author can predict without knowing the gate's line arithmetic.
 *  Same grammar, same mention fence, same position rule as the node arm — `token` is the finding's own
 *  reported lexeme (§4.3a). Returns the marker's 1-based line, or undefined.
 *
 *  A finding at line 0 (genuinely file-level) or line 1 has NO line above it and is therefore
 *  unsuppressible BY CONSTRUCTION — which is what keeps a blindness tripwire and a ledger verdict
 *  permanently loud without needing a second opt-out. */
export function findGateIgnoreAtLine(sf: SourceFile, line: number, gateName: string, token: string | undefined): number | undefined {
  const markerLine = line - 1;
  if (markerLine < 1) {
    return;
  }
  const marker = markersByLine(sf).get(markerLine);
  if (marker === undefined || marker.malformed || marker.gate !== gateName) {
    return;
  }
  return marker.position === undefined || marker.position === token ? markerLine : undefined;
}

/** One node's LEADING comments: the position of the first WELL-FORMED marker that guards `gateName` at
 *  `token`, or undefined. Extracted from the walk so the traversal stays under the complexity cap — a
 *  malformed marker is skipped here (it suppresses nothing, §4.3) and reported by `gate-ignore-inventory`. */
// biome-ignore lint/suspicious/noExplicitAny: AST traversal
function suppressingCommentPos(scanNode: any, gateName: string, token: string | undefined): number | undefined {
  // ONE return path: tsc's noImplicitReturns wants every path to return, biome calls a trailing
  // `return;` unnecessary — an accumulator satisfies both without suppressing either.
  let found: number | undefined;
  if (typeof scanNode.getLeadingCommentRanges === "function") {
    // biome-ignore lint/suspicious/noExplicitAny: AST traversal
    for (const c of scanNode.getLeadingCommentRanges() as any[]) {
      const marker = parseGateIgnoreMarker(c.getText());
      const guardsThis = marker !== undefined && !marker.malformed && marker.gate === gateName;
      if (guardsThis && (marker.position === undefined || marker.position === token)) {
        found = c.getPos();
        break;
      }
    }
  }
  return found;
}

/** Walk from the reported node up to its statement/file boundary, looking for a well-formed
 *  `// @orb-gate-ignore <gate-name>[(<token>)]: <reason>` suppression comment. Stops at the statement
 *  boundary so a comment above an unrelated sibling doesn't leak a suppression onto this node (§4.3b —
 *  the resolver is BLOCK-SCOPED, never file-scoped). Returns the marker's 1-based line so the caller can
 *  record the consumption; `undefined` = not suppressed. */
export function findGateIgnore(node: Node, gateName: string, token: string | undefined): number | undefined {
  // Single return path — see suppressingCommentPos.
  let line: number | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: AST traversal
  let scanNode: any = node;
  while (scanNode !== undefined && line === undefined) {
    const hit = suppressingCommentPos(scanNode, gateName, token);
    if (hit !== undefined) {
      line = node.getSourceFile().getLineAndColumnAtPos(hit).line;
      break;
    }
    const kindName: string = typeof scanNode.getKindName === "function" ? scanNode.getKindName() : "";
    if (kindName === "SourceFile" || kindName.includes("Statement")) {
      break;
    }
    scanNode = typeof scanNode.getParent === "function" ? scanNode.getParent() : undefined;
  }
  return line;
}
