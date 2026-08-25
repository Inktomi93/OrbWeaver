// Gate: no-test-fabrication (core/Spine-Testing.md §5; test-support-dry-punchlist.md W1h) — bans two
// fabricated-entity shapes that compile STRAIGHT THROUGH a type change ("source changed, tests never
// knew"): (a) `X as unknown as Y` double-casts, and (b) an object/array-literal `as Y` (not
// const/any/unknown) — both survive Y gaining/renaming a required field silently; use a typed factory
// or `satisfies Y` instead. Escape: `// FABRICATION-OK: <reason>`, consumed by exactly the next guarded
// cast; malformed, stale, and over-broad markers are red. COMMENT POSTURE: comments-INTENDED — this gate
// reads only comment-opener marker lines; strings and prose mentions are inert. The per-file SHRINK-ONLY baseline
// ratchet reached its terminal `{}` at #590 and was DELETED — baseline + generator + this reader,
// GATE-AUTHORING.md §4.8 — the gate is flat now (born-compliant): every unmarked site is reported.
import type { AsExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor } from "../contract/gate.ts";

const TESTS_REL_RE = /\/(?<rel>tests\/.*)$/u;
const ESCAPE = "FABRICATION-OK";
const MARKER_OPENER_RE = /^\/\/\s*FABRICATION-OK\b/u;
const MARKER_RE = /^\/\/\s*FABRICATION-OK\s*:\s*\S.*$/u;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/u;
const BLANK_LINE_RE = /^\s*$/u;
/** Cast targets that are NOT a fabrication claim: `as const` (a literal-narrowing operator), `as any` /
 *  `as unknown` (widening escapes with their own rules). This is the PREDICATE'S VOCABULARY, not an
 *  exemption ledger — no site is granted a pass here, and there is nothing that could go stale (the words
 *  are TypeScript keywords). Named out of the exemption vocabulary deliberately (GATE-AUTHORING.md §4 —
 *  "if the collection is not an exemption, the name must not promise one"). The gate's one real exemption
 *  is the `FABRICATION-OK:` marker (reason mandatory). */
const NON_FABRICATING_CAST_TARGETS: ReadonlySet<string> = new Set(["const", "any", "unknown"]);

const DOUBLE_CAST_MSG =
  "`X as unknown as Y` double-cast in a test — fabricates a typed value that survives Y gaining/renaming a " +
  "required field (test-support-dry-punchlist.md W1h). Use a typed factory (makeY(overrides?)) or narrow the " +
  "real value. Deliberate invalid-input probe? mark it `// FABRICATION-OK: <reason>`.";
const LITERAL_CAST_MSG = (typeText: string): string =>
  `object/array-literal \`as ${typeText}\` in a test — a hand-shaped literal asserted complete survives ` +
  `${typeText} growing a field (test-support-dry-punchlist.md W1h). Use a typed factory or \`satisfies ` +
  `${typeText}\` (which re-checks on every change). Deliberate invalid-input probe? mark it \`// ${ESCAPE}: <reason>\`.`;
const MALFORMED_MARKER_MSG = `malformed \`// ${ESCAPE}\` marker — the grammar is \`// ${ESCAPE}: <reason>\`; a bare marker exempts nothing.`;
const STALE_MARKER_MSG = `stale \`// ${ESCAPE}: <reason>\` marker — it guards no fabrication cast. Delete the loaded-gun exemption.`;

/** True when the AsExpression is `<inner> as unknown as Y` — i.e. its expression is itself an AsExpression
 *  casting to the `unknown` keyword. Detected on the OUTER node so each double-cast counts once. */
function isDoubleUnknownCast(node: AsExpression): boolean {
  const inner = node.getExpression();
  if (!Node.isAsExpression(inner)) {
    return false;
  }
  return inner.getTypeNode()?.getKind() === SyntaxKind.UnknownKeyword;
}

/** True when the AsExpression casts an object/array LITERAL to a concrete type (not const/any/unknown). */
function isLiteralFabrication(node: AsExpression): boolean {
  const expr = node.getExpression();
  if (!(Node.isObjectLiteralExpression(expr) || Node.isArrayLiteralExpression(expr))) {
    return false;
  }
  return !NON_FABRICATING_CAST_TARGETS.has(node.getTypeNode()?.getText() ?? "");
}

interface Marker {
  readonly line: number;
  readonly guards: number;
  readonly valid: boolean;
}

interface Candidate {
  readonly node: AsExpression;
  readonly line: number;
  readonly message: string;
}

/** Comment-block-scoped markers: each guards the next authored line, or its own line when trailing code. */
function markersIn(sf: SourceFile): readonly Marker[] {
  const raw = sf.getFullText();
  const lines = sf.getFullText().split("\n");
  const markers: Marker[] = [];
  const comments = new Map<number, string>();
  const collect = (node: Node): void => {
    for (const range of [...node.getLeadingCommentRanges(), ...node.getTrailingCommentRanges()]) {
      comments.set(range.getPos(), range.getText());
    }
  };
  collect(sf);
  sf.forEachDescendant(collect);
  for (const [position, text] of comments) {
    if (!MARKER_OPENER_RE.test(text.trim())) {
      continue;
    }
    const line = sf.getLineAndColumnAtPos(position).line;
    const lineStart = raw.lastIndexOf("\n", position - 1) + 1;
    const beforeComment = raw.slice(lineStart, position);
    let guards = line;
    if (BLANK_LINE_RE.test(beforeComment)) {
      guards += 1;
      while (guards <= lines.length && (COMMENT_LINE_RE.test(lines[guards - 1] ?? "") || BLANK_LINE_RE.test(lines[guards - 1] ?? ""))) {
        guards += 1;
      }
    }
    markers.push({ line, guards, valid: MARKER_RE.test(text.trim()) });
  }
  return markers.sort((a, b) => a.line - b.line);
}

function candidatesIn(sf: SourceFile): Candidate[] {
  const candidates: Candidate[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.AsExpression)) {
    let message: string | undefined;
    if (isDoubleUnknownCast(node)) {
      message = DOUBLE_CAST_MSG;
    } else if (isLiteralFabrication(node)) {
      message = LITERAL_CAST_MSG(node.getTypeNode()?.getText() ?? "?");
    }
    if (message !== undefined) {
      candidates.push({ node, line: node.getStartLineNumber(), message });
    }
  }
  return candidates.sort((a, b) => a.node.getStart() - b.node.getStart());
}

/** Every fabrication site in one test file, as (line, message) pairs. */
export function fabricationSites(sf: SourceFile): { line: number; message: string }[] {
  const candidates = candidatesIn(sf);
  const consumed = new Set<AsExpression>();
  const sites: { line: number; message: string }[] = [];
  for (const marker of markersIn(sf)) {
    if (!marker.valid) {
      sites.push({ line: marker.line, message: MALFORMED_MARKER_MSG });
      continue;
    }
    const target = candidates.find((candidate) => candidate.line === marker.guards && !consumed.has(candidate.node));
    if (target === undefined) {
      sites.push({ line: marker.line, message: STALE_MARKER_MSG });
      continue;
    }
    consumed.add(target.node);
  }
  for (const candidate of candidates) {
    if (!consumed.has(candidate.node)) {
      sites.push({ line: candidate.line, message: candidate.message });
    }
  }
  return sites;
}

/** The tests/-relative path of a test source file, or undefined if it isn't under tests/. */
export function testsRel(path: string): string | undefined {
  return TESTS_REL_RE.exec(path)?.groups?.["rel"];
}

export const gate: GateDescriptor = {
  name: "no-test-fabrication",
  docRow: "core/Spine-Testing.md §5 (test-support-dry-punchlist.md W1h)",
  status: "active",
  scopeSafety: "whole-project",
  message: DOUBLE_CAST_MSG,
  fix: "use a typed factory (makeY(overrides?)) or `satisfies Y`; mark a deliberate invalid-input probe `// FABRICATION-OK: <reason>`.",
  scanRoot: (p) => p.startsWith("tests/"),
  visitFile: (sf, ctx) => {
    const rel = testsRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    for (const site of fabricationSites(sf)) {
      const finding: Finding = {
        file: rel,
        line: site.line,
        column: 0,
        message: site.message,
        token: site.message === DOUBLE_CAST_MSG ? "double-cast" : "literal-cast",
      };
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: "export const x = {} as unknown as { a: number };\n",
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "double-cast" },
      why: "an `X as unknown as Y` double-cast in a test — a fabrication (W1h); the gate is flat now (#590, no baseline to admit it)",
    },
    {
      files: "export const b = { n: 1 } as Widget;\n",
      at: "tests/tooling/lit.test.ts",
      expect: { messageIncludes: "literal" },
      why: "an object-literal `as Y` (Y not const/any/unknown) — a hand-shaped literal asserted complete",
    },
    {
      files: "export const c = [1, 2] as Widget[];\n",
      at: "tests/tooling/arr.test.ts",
      expect: { messageIncludes: "literal" },
      why: "an array-literal `as Y[]` — the same fabrication shape",
    },
  ],
  mustPass: [
    {
      files: "export const x = { a: 1 } satisfies { a: number };\n",
      at: "tests/tooling/y.test.ts",
      why: "`satisfies Y` re-checks the literal on every change — the sanctioned shape, passes",
    },
    {
      files: "export const a = { n: 1 } as const;\nexport const b = { n: 1 } as unknown;\nexport const c = [1] as any;\n",
      at: "tests/tooling/exempt.test.ts",
      why: "`as const`/`as unknown`/`as any` are the exempt cast types — passes",
    },
    {
      files: "export const b = { n: 1 } as Widget; // FABRICATION-OK: invalid-input probe\n",
      at: "tests/tooling/escape-same.test.ts",
      why: "a `// FABRICATION-OK` comment on the SAME line exempts the deliberate-fabrication site — passes",
    },
    {
      files: "// FABRICATION-OK: deliberate invalid-input probe exercises the parser boundary\nexport const a = {} as unknown as Widget;\n",
      at: "tests/tooling/escape-above.test.ts",
      why: "a `// FABRICATION-OK` comment on the line ABOVE exempts the site — passes",
    },
    {
      files: "export const a = {} as unknown as { n: number };\n",
      at: "packages/server/src/domain/widget/x.ts",
      why: "scope: a fabrication cast OUTSIDE tests/ is not gated here — passes",
    },
  ],
};
