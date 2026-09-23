// The `@orb-gate-ignore` marker grammar and its MENTION FENCE — now ONE reader rather than two.
//
// THE SUPPRESSOR IS GONE (#2176 Phase F, 2026-09-14). Both suppression arms — `findGateIgnore`, which walked
// a reported node's leading trivia, and `findGateIgnoreAtLine`, which bound line-adjacently for the
// `Finding` overload — lived in the legacy dispatcher (`lib/pass.ts`) and died with it, because a final
// policy has no inline door at all (docs/law/gate-runtime-standardization.md §12.5: authority plus the central
// `@orb-waive` engine own every escape). What survives is the AUDIT side: `lib/gate-ignore-fact.ts`
// publishes every residual marker as a fact and the `gate-ignore-inventory` policy reds it, so the retired
// vocabulary cannot sit in the tree LOOKING like protection. The mention fence stays beside the recognizer
// for the same one-spelling reason it was extracted for.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateIgnoreMarker } from "../contract/gate-ignore-marker.ts";

/** The house exemption-marker grammar (tooling/src/verify/gates/GATE-AUTHORING.md §4.3):
 *  `// @orb-gate-ignore <gate-name>[(<position>)]: <reason>`.
 *
 *  The pattern is deliberately PERMISSIVE about the tail so a malformed marker is still RECOGNISED as an
 *  attempted marker — `judgeGateIgnore` then judges it. A marker the recognizer missed would be invisible
 *  to `gate-ignore-inventory`, which is the policy that reds every residual one.
 *
 *  THE MENTION FENCE: a marker IS a `//` comment whose own
 *  text begins with the vocabulary. Marker-shaped text anywhere else — inside a string/template/JSX/regex
 *  literal, or embedded LATER in a comment's text (a backtick quotation in prose, a JSDoc example) — is a
 *  MENTION of the grammar, never a use of it. The scanner counts only comment-OPENER matches, so gate
 *  doc-prose can document the grammar without self-flagging — which is what lets the inventory's own
 *  population include the gate corpus.
 *  Groups: 1 = gate name · 2 = the optional position name · 3 = everything after it. */
const GATE_IGNORE_SOURCE = String.raw`//\s*@orb-gate-ignore\s+([a-zA-Z0-9-]+)(?:\(\s*([^)\n]*?)\s*\))?(.*)`;

/** Judge one recognised marker against the §4.3 grammar. */
function judgeGateIgnore(gate: string, rawPosition: string | undefined, tail: string): GateIgnoreMarker {
  const afterName = tail.trimStart();
  const reason = afterName.startsWith(":") ? afterName.slice(1).trim() : "";
  const positionEmpty = rawPosition?.length === 0;
  return { gate, position: positionEmpty ? undefined : rawPosition, reason, malformed: reason.length === 0 || positionEmpty };
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

/** Every REAL marker in a source file, with its 0-based text offset — the inventory policy's scanner and,
 *  since the suppressor retired, the grammar's ONLY reader. Returns only matches at comment-OPENER positions
 *  outside literal spans (the "a marker IS the comment" law), so a backtick quotation in prose is never
 *  reported; an inert ATTEMPT — a trailing marker after code, which opens a real comment but guarded nothing
 *  even when the suppressor existed — stays visible, because a marker that protects nothing is exactly what
 *  the residue arm must red rather than let sit there looking like protection. */
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
