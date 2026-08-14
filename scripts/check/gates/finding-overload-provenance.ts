// Gate: finding-overload-provenance — a NODE-ANCHORED finding may not reach `ctx.report` through the
// explicit-`Finding` overload. That overload bypasses `hasGateIgnore` (GATE-AUTHORING.md §1), so every
// `@orb-gate-ignore` on such a finding is INERT — and an author who writes the correct marker gets a DOUBLE
// red (the gate still fires, and gate-ignore-inventory reds the marker as stale). Three closing sweeps each
// missed members because they matched report CALL SITES by regex; this gate matches the FINDING LITERAL by
// SHAPE, wherever it is built. Escapes: a `finding-overload-ok: <reason>` comment marker (permanent,
// two-sided — spelled with an `@` prefix, deliberately not written literally here per GATE-AUTHORING §5) and
// the shrink-only baseline (pre-existing debt). Registered in Core-Enforcement-Active-Gates.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const GATES_DIR = "scripts/check/gates/";
const GATE_SELF = `${GATES_DIR}finding-overload-provenance.ts`;
const BASELINE_REL = `${GATES_DIR}finding-overload-provenance.baseline.json`;
const GENERATOR = "scripts/check/gen-finding-overload-provenance-baseline.ts";

/** The ts-morph position APIs. A finding whose location derives from one of these has NODE provenance —
 *  which is exactly what makes it suppressible, and therefore what makes the Finding overload wrong. */
const POSITION_API: ReadonlySet<string> = new Set([
  "getStart",
  "getStartLinePos",
  "getStartLineNumber",
  "getEnd",
  "getEndLineNumber",
  "getPos",
  "getLineAndColumnAtPos",
]);

/** The marker grammar (§4.3: the `: <reason>` is REQUIRED — a bare marker exempts nothing). Assembled from
 *  its parts so this file's own source never contains the literal trigger outside a string (§5: never spell
 *  a gate's trigger in prose near its scan root — and this gate's scan root is the gate corpus). */
const MARKER_NAME = "finding-overload-ok";
const MARKER_ANY_RE = new RegExp(`@${MARKER_NAME}`, "u");
const MARKER_WELL_FORMED_RE = new RegExp(`@${MARKER_NAME}\\s*:\\s*\\S`, "u");

/** Node kinds whose TEXT can legally contain the marker spelling without being a marker (this gate's own
 *  message constants and self-proof fixtures spell it). A match inside one of these spans is prose. */
const LITERAL_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.RegularExpressionLiteral,
]);

/** A real run loads the whole gate corpus; a conformance mini-project loads a handful. The baseline and
 *  blindness arms are whole-tree claims, so they self-guard on this — §4.5's real-tree ANCHOR in its
 *  rename-proof form: a COUNT of the corpus, not a hard-coded sibling path that dies on a rename. */
const REAL_CORPUS_MIN = 40;

type ArmToken = "column-derived" | "node-position-in-literal" | "node-position-in-scope";

const MESSAGE =
  "a NODE-ANCHORED finding is being built as an explicit `Finding` literal — and `ctx.report(finding)` " +
  "BYPASSES `hasGateIgnore`, so every `// @orb-gate-ignore` on it is inert (scripts/check/GATE-AUTHORING.md §1). " +
  "A `column-derived` token: the finding claims an intra-line caret, which only a node/token position can " +
  "produce (`Finding.column` is 0 for a genuinely file-level finding — scripts/check/contract.ts). A " +
  "`node-position-in-literal` token: the literal itself calls a ts-morph position API. A " +
  "`node-position-in-scope` token: the function building the literal computes one. Report the NODE instead " +
  "— `ctx.report(node, { token, offset })` — and move any per-occurrence prose onto the gate's `message`.";

const FIX =
  "report the offending NODE: `ctx.report(node, { token, offset: 0 })`, folding the per-finding message into " +
  "the gate's `message` and any dynamic detail into the `token` (scripts/check/gates/no-raw-intl-time.ts and " +
  "own-tables-only.ts are the worked examples). If the arm is genuinely file-level, or deliberately " +
  "NON-suppressible (a blindness tripwire, a stale/ratchet arm, a ledger verdict), keep the overload and write " +
  `\`// @${MARKER_NAME}: <why it is correct + what would end it>\` at the literal. Pre-existing debt lives in ` +
  `${BASELINE_REL} and only ever SHRINKS (regenerate with \`node ${GENERATOR}\`).`;

const MSG_STALE_MARKER = `a \`@${MARKER_NAME}\` marker suppressed NOTHING this run — the arm it forgave no longer builds a node-anchored Finding literal, or moved. A standing exemption for a site that is gone is a LOADED GUN: the next Finding-overload written there inherits it. Delete the marker. See ${GATE_SELF} and scripts/check/GATE-AUTHORING.md §4.4.`;
const MSG_OVER_EXEMPT = `one \`@${MARKER_NAME}\` marker absolved MORE THAN ONE Finding literal — it grants an exemption nobody reasoned about to every site but the one it was written for (§4.3a). Put one marker at each literal. See ${GATE_SELF}.`;
const MSG_MALFORMED = `MALFORMED \`@${MARKER_NAME}\` marker — no \`: <reason>\`. The house grammar (scripts/check/GATE-AUTHORING.md §4.3) requires the reason, so this marker suppresses NOTHING while reading as an exemption. Write the reason (why it is correct + what would end it), or delete the marker.`;
const MSG_BLIND = `blindness tripwire: the real gate corpus is loaded but ZERO \`Finding\`-shaped literals were found in it — the detector's shape predicate (file + line + column/message) has rotted past every gate, so this gate's verdict is unknowable. Re-derive it in ${GATE_SELF}. See scripts/check/GATE-AUTHORING.md §4.6.`;
const MSG_STALE_BASELINE = (file: string, budget: number, actual: number): string =>
  `${BASELINE_REL} budgets ${budget} node-anchored Finding literal(s) for \`${file}\` but only ${actual} remain — the ratchet only goes DOWN: regenerate it (\`node ${GENERATOR}\`) and commit the shrink.`;
const MSG_DEAD_BASELINE = (file: string): string =>
  `${BASELINE_REL} budgets \`${file}\`, which is no longer in the gate corpus (deleted or renamed) — the row names nothing at all. Regenerate the baseline (\`node ${GENERATOR}\`) and commit the shrink. See scripts/check/GATE-AUTHORING.md §4.4a mode (B).`;

// ── detection ─────────────────────────────────────────────────────────────────────────────────────────

/** A named property's initializer (or its shorthand name node), or undefined. */
function propOf(obj: Node, name: string): Node | undefined {
  let found: Node | undefined;
  for (const p of obj.asKind(SyntaxKind.ObjectLiteralExpression)?.getProperties() ?? []) {
    const assign = p.asKind(SyntaxKind.PropertyAssignment);
    if (assign?.getName() === name) {
      found = assign.getInitializer();
      break;
    }
    const short = p.asKind(SyntaxKind.ShorthandPropertyAssignment);
    if (short?.getName() === name) {
      found = short.getNameNode();
      break;
    }
  }
  return found;
}

/** Does anything in this subtree call a ts-morph POSITION API? */
function callsPositionApi(scope: Node): boolean {
  let found = false;
  for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (callee !== undefined && POSITION_API.has(callee.getName())) {
      found = true;
      break;
    }
  }
  return found;
}

function enclosingFunction(node: Node): Node | undefined {
  let cur: Node | undefined = node.getParent();
  while (cur !== undefined) {
    const isFn =
      cur.isKind(SyntaxKind.FunctionDeclaration) ||
      cur.isKind(SyntaxKind.ArrowFunction) ||
      cur.isKind(SyntaxKind.FunctionExpression) ||
      cur.isKind(SyntaxKind.MethodDeclaration);
    if (isFn) {
      break;
    }
    cur = cur.getParent();
  }
  return cur;
}

/** Is this object literal a `Finding` — or a gate-local violation RECORD that becomes one? SHAPE, not type:
 *  `file` + `line` + (`column` | `message`). Shape is what survives a record being built three functions
 *  away from `ctx.report` — the exact hop every previous sweep of this class fell through. A `{file, line,
 *  name}` bookkeeping record (gate-ignore-inventory's PendingMarker) is NOT one, hence the third clause. */
function isFindingLiteral(obj: Node): boolean {
  if (propOf(obj, "file") === undefined || propOf(obj, "line") === undefined) {
    return false;
  }
  return propOf(obj, "column") !== undefined || propOf(obj, "message") !== undefined;
}

/** The strongest provenance arm this literal trips, or undefined. ONE verdict per literal on purpose: two
 *  findings on one site would make a single correct marker read as an OVER-EXEMPTION. Module-private: the
 *  generator reaches it through `unmarkedSites`, which is the ONE exported derivation the baseline and the
 *  live verdict share. */
function provenanceArm(obj: Node): ArmToken | undefined {
  if (!isFindingLiteral(obj)) {
    return;
  }
  const column = propOf(obj, "column");
  if (column !== undefined && !(column.isKind(SyntaxKind.NumericLiteral) && column.getText() === "0")) {
    return "column-derived";
  }
  if (callsPositionApi(obj)) {
    return "node-position-in-literal";
  }
  const fn = enclosingFunction(obj);
  return fn !== undefined && callsPositionApi(fn) ? "node-position-in-scope" : undefined;
}

// ── marker resolution (block-scoped, §4.3b) ───────────────────────────────────────────────────────────

/** The 1-based line of the first marker guarding this literal, or undefined. Scans the literal's own leading
 *  comments, then each ancestor's up to and INCLUDING the enclosing statement — never past it (§4.3b: a
 *  file-scoped reader silently exempts the rest of the file from the first marker onward). */
function markerLineFor(obj: Node): number | undefined {
  let found: number | undefined;
  let cur: Node | undefined = obj;
  while (cur !== undefined && found === undefined) {
    for (const range of cur.getLeadingCommentRanges()) {
      if (MARKER_ANY_RE.test(range.getText())) {
        found = obj.getSourceFile().getLineAndColumnAtPos(range.getPos()).line;
        break;
      }
    }
    if (found !== undefined || cur.getKindName().includes("Statement") || cur.isKind(SyntaxKind.SourceFile)) {
      break;
    }
    cur = cur.getParent();
  }
  return found;
}

/** The spans in which a marker spelling is PROSE, not a marker (string/template/regex literals). */
function literalSpans(sf: SourceFile): readonly (readonly [number, number])[] {
  const spans: [number, number][] = [];
  sf.forEachDescendant((node) => {
    if (LITERAL_KINDS.has(node.getKind())) {
      spans.push([node.getStart(), node.getEnd()]);
    }
  });
  return spans;
}

/** Every real marker in a file, by 1-based line → §4.3 well-formedness. */
function markersIn(sf: SourceFile): Map<number, boolean> {
  const out = new Map<number, boolean>();
  const spans = literalSpans(sf);
  const text = sf.getFullText();
  for (const m of text.matchAll(new RegExp(`@${MARKER_NAME}.*`, "gu"))) {
    if (spans.some(([start, end]) => m.index >= start && m.index < end)) {
      continue;
    }
    const { line } = sf.getLineAndColumnAtPos(m.index);
    out.set(line, MARKER_WELL_FORMED_RE.test(m[0]));
  }
  return out;
}

/** ONE file's UNFORGIVEN sites — the sites a well-formed marker did NOT absolve. The BASELINE GENERATOR's
 *  only entry point, so the committed budget and the live verdict are the same derivation (§4.8: the
 *  generator is the single WRITER; this is the single DERIVATION). */
export function unmarkedSites(sf: SourceFile): readonly ArmToken[] {
  const markers = markersIn(sf);
  const out: ArmToken[] = [];
  sf.forEachDescendant((node) => {
    const arm = provenanceArm(node);
    if (arm === undefined) {
      return;
    }
    const line = markerLineFor(node);
    if (line === undefined || markers.get(line) !== true) {
      out.push(arm);
    }
  });
  return out;
}

// ── pass state ────────────────────────────────────────────────────────────────────────────────────────

type Site = { readonly node: Node; readonly file: string; readonly arm: ArmToken };
let passSites: Site[] = [];
let passMarkers = new Map<string, Map<number, boolean>>();
let passCorpus = new Set<string>();
let passLiterals = 0;

function relOf(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function readBaseline(root: string): Readonly<Record<string, number>> {
  const abs = join(root, BASELINE_REL);
  if (!existsSync(abs)) {
    return {};
  }
  return JSON.parse(readFileSync(abs, "utf8")) as Record<string, number>;
}

/** Detected sites minus the ones a well-formed marker absolved, grouped by file — recording marker
 *  CONSUMPTION so the two-sided arms can judge each marker (0 = stale, >1 = over-exempting). */
function resolveMarkers(consumed: Map<string, number>): Map<string, Site[]> {
  const byFile = new Map<string, Site[]>();
  for (const site of passSites) {
    const line = markerLineFor(site.node);
    const wellFormed = line === undefined ? undefined : passMarkers.get(site.file)?.get(line);
    if (line !== undefined && wellFormed === true) {
      const key = `${site.file}:${line}`;
      consumed.set(key, (consumed.get(key) ?? 0) + 1);
      continue;
    }
    const list = byFile.get(site.file);
    if (list === undefined) {
      byFile.set(site.file, [site]);
    } else {
      list.push(site);
    }
  }
  return byFile;
}

/** The two-sided marker arms (§4.4): malformed · stale · over-exempting. All three are about a COMMENT, so
 *  they are file-anchored by nature — the Finding overload is correct for them and needs no self-marker
 *  (they compute no node position, so this gate does not flag itself for them). */
function judgeMarkers(ctx: GateRunCtx, consumed: ReadonlyMap<string, number>): void {
  for (const [file, lines] of passMarkers) {
    for (const [line, wellFormed] of lines) {
      if (!wellFormed) {
        ctx.report({ file, line, column: 0, message: MSG_MALFORMED });
        continue;
      }
      const uses = consumed.get(`${file}:${line}`) ?? 0;
      if (uses === 0) {
        ctx.report({ file, line, column: 0, message: MSG_STALE_MARKER });
      } else if (uses > 1) {
        // The count is interpolated FIRST and the pointer written LITERALLY last: diagnostic-legibility
        // reads a template's own text, so a pointer hidden behind `${CONST}` is invisible to it.
        ctx.report({ file, line, column: 0, message: `it absolved ${uses} Finding literals. ${MSG_OVER_EXEMPT} See scripts/check/GATE-AUTHORING.md §4.3a.` });
      }
    }
  }
}

/** The shrink-only baseline (§4.8): excess over a file's budget REDs at the site; a budget nothing spends
 *  any more REDs at the baseline (both staleness modes — a file that improved, and a file that is GONE). */
function judgeBaseline(ctx: GateRunCtx, byFile: ReadonlyMap<string, Site[]>): void {
  const baseline = readBaseline(ctx.root);
  for (const [file, sites] of byFile) {
    const budget = baseline[file] ?? 0;
    // Declared debt, surfaced as `admitted-by-ratchet: N` beside the ✓ — a green ratchet gate still names
    // the population it is carrying (Codex GA-H-02).
    ctx.scan({ admitted: Math.min(budget, sites.length) });
    for (const site of sites.slice(budget)) {
      ctx.report(site.node, { token: site.arm, offset: 0 });
    }
  }
  if (passCorpus.size < REAL_CORPUS_MIN) {
    return; // a mini-project holds none of the baselined files: "spent nothing" carries no information
  }
  for (const [file, budget] of Object.entries(baseline)) {
    if (!passCorpus.has(file)) {
      ctx.report({ file: BASELINE_REL, line: 1, column: 0, message: MSG_DEAD_BASELINE(file) });
      continue;
    }
    const actual = byFile.get(file)?.length ?? 0;
    if (actual < budget) {
      ctx.report({ file: BASELINE_REL, line: 1, column: 0, message: MSG_STALE_BASELINE(file, budget, actual) });
    }
  }
}

export const gate: GateDescriptor = {
  name: "finding-overload-provenance",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the marker + baseline ratchets are whole-corpus claims
  message: MESSAGE,
  fix: FIX,
  fsBacked: true, // reads its own baseline JSON off disk
  scanRoot: (p) => p.startsWith(GATES_DIR),
  kinds: [SyntaxKind.ObjectLiteralExpression],
  begin: () => {
    passSites = [];
    passMarkers = new Map();
    passCorpus = new Set();
    passLiterals = 0;
  },
  visitFile: (sf, ctx) => {
    const file = relOf(ctx.root, sf.getFilePath());
    passCorpus.add(file);
    const markers = markersIn(sf);
    if (markers.size > 0) {
      passMarkers.set(file, markers);
    }
  },
  visit: (node, sf, ctx) => {
    if (isFindingLiteral(node)) {
      passLiterals += 1;
    }
    const arm = provenanceArm(node);
    if (arm !== undefined) {
      passSites.push({ node, file: relOf(ctx.root, sf.getFilePath()), arm });
    }
  },
  finalize: (ctx) => {
    const consumed = new Map<string, number>();
    const byFile = resolveMarkers(consumed);
    judgeMarkers(ctx, consumed);
    judgeBaseline(ctx, byFile);
    if (passCorpus.size >= REAL_CORPUS_MIN && passLiterals === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: MSG_BLIND });
    }
  },
  mustFlag: [
    {
      files: {
        "scripts/check/gates/g-col.ts":
          "export function f(node: N, ctx: C): void {\n  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 4, message: 'x' });\n}\n",
      },
      expect: { count: 1, token: "column-derived" },
      why: "the founding shape — an intra-line caret can only come from a node/token position, and `Finding.column` is 0 for a genuinely file-level finding (the no-vanity-alias / ui-skin-fragment-purity defect verbatim)",
    },
    {
      files: {
        "scripts/check/gates/g-lit.ts":
          "export function f(node: N, ctx: C): void {\n  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 0, message: 'x' });\n}\n",
      },
      expect: { count: 1, token: "node-position-in-literal" },
      why: "column 0 hides the caret but the LINE still derives from a node — the shape a column-only heuristic misses (baseui-derives-not-respells ARM A)",
    },
    {
      files: {
        "scripts/check/gates/g-scope.ts":
          "export function f(node: N, ctx: C): void {\n  const { line } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());\n  const v = { file: rel, line, message: 'x' };\n  ctx.report(v);\n}\n",
      },
      expect: { count: 1, token: "node-position-in-scope" },
      why: "the RECORD hop: the literal is built two statements from `ctx.report` and forwarded by IDENTIFIER — the hop every regex sweep of this class fell through",
    },
    {
      files: {
        "scripts/check/gates/g-bare.ts":
          "export function f(node: N, ctx: C): void {\n  // @finding-overload-ok\n  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 4, message: 'x' });\n}\n",
      },
      expect: { messageIncludes: "MALFORMED" },
      why: "§4.3 case 4 — a BARE marker is its OWN flavour of red AND suppresses nothing, so the violation reds too: a marker that exempts nothing must not sit there looking like protection",
    },
    {
      files: {
        "scripts/check/gates/g-stale.ts": "// @finding-overload-ok: nothing here builds a node-anchored Finding any more\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "suppressed NOTHING" },
      why: "§4.4 two-sidedness — a well-formed marker guarding no live violation is a loaded gun: the next Finding-overload written there inherits an exemption nobody granted it",
    },
    {
      files: {
        "scripts/check/gates/g-over.ts":
          "export function f(node: N): void {\n  // @finding-overload-ok: one marker, two literals\n  const vs = [{ file: rel, line: node.getStartLineNumber(), column: 4, message: 'a' }, { file: rel, line: node.getStartLineNumber(), column: 5, message: 'b' }];\n}\n",
      },
      expect: { messageIncludes: "absolved 2 Finding literals" },
      why: "§4.3a — ONE marker over two guarded literals grants an exemption nobody reasoned about to the second; the count is reported so the author sees what they gave away",
    },
  ],
  mustPass: [
    {
      files: {
        "scripts/check/gates/g-ok.ts": "export function f(node: N, ctx: C): void {\n  ctx.report(node, { token: 'x', offset: 0 });\n}\n",
      },
      why: "the CORRECT shape — the NODE overload, which `hasGateIgnore` can read a marker off. Nothing to flag",
    },
    {
      files: {
        "scripts/check/gates/g-filelevel.ts":
          "export function f(ctx: C): void {\n  ctx.report({ file: 'packages/x/y.ts', line: 0, column: 0, message: 'x' });\n}\n",
      },
      why: "a GENUINELY file-level finding — no node in scope, `line`/`column` both literal 0 (contract.ts's own spelling). The Finding overload is correct here and needs no marker",
    },
    {
      files: {
        "scripts/check/gates/g-marked.ts":
          "export function f(node: N, ctx: C): void {\n  // @finding-overload-ok: deliberately non-suppressible — a ledger verdict has no site-local escape; ends if the ban is ever contested\n  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 4, message: 'x' });\n}\n",
      },
      why: "the sanctioned escape: a well-formed marker at the literal, consumed exactly once (the permanent-exemption arm — baseui-derives-not-respells ARM A, schema-banned-shapes)",
    },
    {
      files: {
        "scripts/check/gates/g-bookkeeping.ts":
          "export function f(node: N): void {\n  pending.push({ file: rel, line: node.getStartLineNumber(), name: 'x' });\n}\n",
      },
      why: "DECLARED LIMIT: a `{file, line, <no column, no message>}` BOOKKEEPING record is not a Finding (gate-ignore-inventory's PendingMarker is exactly this shape). The cost is a Finding literal omitting BOTH column and message, which `Finding` forbids at the type level",
    },
    {
      files: {
        "scripts/check/gates/g-textscan.ts": "export function f(sf: S, ctx: C): void {\n  ctx.report({ file: rel, line: 12, column: 0, message: 'x' });\n}\n",
      },
      why: "DECLARED LIMIT, the other side: provenance is SYNTACTIC, so a TEXT-scan position (`getLineAndColumnAtPos(<a regex match index>)` in d-citation-integrity / pd-citation-integrity) is indistinguishable from a node position and DOES flag — those two gates carry a marker. This row pins what is quiet: a finding whose position never touches the position API at all",
    },
  ],
};
