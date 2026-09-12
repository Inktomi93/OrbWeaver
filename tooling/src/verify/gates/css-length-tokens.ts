// Gate: css-length-tokens (#955) — raw shell lengths are illegal unless they are one of the structural
// mechanics CSS itself must own. Static class discovery comes from #961's shared provenance walker; this
// gate only judges the exact Tailwind candidates it returns and never maintains a second evaluator.
//
// CARDINALITY BELONGS TO THE SUBJECT, NEVER TO THE ROW (#2101, 2026-09-12; §12.5 bans a count ratchet and
// a reviewed grant is strictly 1:1, so a row carrying its own `count` cannot become one). Twelve of this
// gate's sixteen exemption rows carried an explicit `count` and the two shell.css tables are now keyed on
// the OCCURRENCE instead: a declaration row names the SELECTOR that owns it, a query row names its exact
// at-rule prelude, and each row's liveness arm asks "does this subject still occur", never "does it occur
// exactly N times". This is STRICTLY STRONGER than the ratchet it replaces: `width: 100dvw` was one row
// with `count: 3`, so moving one of the three sites to a fourth selector kept the count at 3 and stayed
// green; the three selectors are now three rows and that move reds.
//
// THE RULE THAT DECIDED IT, stated once for the sibling count-ratchet modules (`css-family-ownership`,
// `css-var-defined`, `duplicate-action-doors`): **a `count` is never the fix for an over-broad subject; it
// is the TELL that the subject is wrong.** Where a row's subject is an occurrence, the count is ceremony
// and deletes. Where a row needs its count to stay safe, the subject is a CONTAINER holding N occurrences
// and the repair is to narrow the subject, never to keep the number.
//
// STRUCTURAL_CLASS_FILES IS THE UNCONVERTED HALF, and it is that second case: its key is a FILE and its
// counts (3/2/1/9) are a per-file budget, so deleting them without narrowing the subject would let a tenth
// raw length into `variants.ts` silently — trading real enforcement for form. Narrowing it to
// `(file, candidate)` needs the REAL-TREE walk to enumerate the candidates, which a scoped lane cannot run:
// measured 2026-09-12, a four-file `walkStaticClassExpressions` probe (with planted positive and negative
// controls, both OK) returned `character-create-actions.tsx` 2, `markdown.tsx` 1, `variants.ts` 9 (7 unique
// candidates, so two repeat) and **`pager-chrome.ts` ZERO against its row's 3** — its class strings are
// exported constants resolved at their CONSUMERS, which that file set did not contain. An enumeration that
// under-reports a row to zero cannot be the basis of the rows replacing it. The next lane runs the whole-tree
// pass and converts these four with the rule above.
//
// MEASURED 2026-09-12, driving the SHELL arm through the legacy dispatcher against the REAL shell.css
// (one scratch module per cut; every anchor asserted to occur exactly once, and the `@media` prelude cut
// REFUSED at 2 occurrences until it was re-anchored on its row line):
//   no cut                                          → 0 findings (all ten declaration rows and all three
//                                                     query rows resolve against the live stylesheet)
//   one `width: 100dvw` row re-keyed to a fourth
//   selector — the analogue of moving one of the
//   three sites, which `count: 3` could NOT see     → 2 (the occurrence is REPORTED and the row reads UNUSED)
//   the sentinel row re-keyed to `.shell-grid`      → 2 (the SELECTOR half of the key is load-bearing)
//   a query row's prelude changed by 1rem           → 2
//   the liveness test INVERTED (drop the `!`)       → 10 (the arm is reached by every live row; it is not
//                                                     vacuous, which is the failure mode a zero-occurrence
//                                                     arm has when its key never matches anything)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Scanner } from "@tailwindcss/oxide";
import type { Node } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "../lib/comment-spans.ts";
import { parseCssRules } from "../lib/css-rules.ts";
import { repoRel } from "../lib/pass.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const SHELL = "packages/client/src/features/app-shell/surfaces/shell.css";
const REAL_TREE_ANCHOR = "packages/ui/src/tokens/index.ts";
const GATE_SELF = "tooling/src/verify/gates/css-length-tokens.ts";
const LENGTH_RE = /(?<![\w-])-?(?:\d*\.)?\d+(?:dvh|dvw|cqh|px|rem|em|ch|vh|vw)(?![\w-])/giu;
const LINE_LENGTH_RE = new RegExp(LENGTH_RE.source, LENGTH_RE.flags);
const RAW_NUMBER_RE = /^-?(?:\d*\.)?\d+$/u;
const MESSAGE =
  "raw non-structural CSS length bypasses the DTCG/token-output contract; shell.css permits only its declared viewport, query, ratio, and measurement mechanics, and class carriers permit only declared structural grid/query values (client-architecture-lockdown.md §4, #955).";

/** One allowlisted structural declaration, identified by the SELECTOR that owns it — which is what makes
 *  the row an occurrence rather than a class of them, and therefore what removes the need for a `count`. */
interface StructuralDeclaration {
  readonly selector: string;
  readonly prop: string;
  readonly value: string;
  readonly why: string;
}

const STRUCTURAL_DECLARATIONS: readonly StructuralDeclaration[] = [
  {
    selector: ".shell-grid",
    prop: "--list-track",
    value: "0px",
    why: "zero is the closed LIST-track measurement sentinel; it ends only if the track state mechanism changes",
  },
  {
    selector: ".shell-grid",
    prop: "--context-track",
    value: "0px",
    why: "zero is the closed CONTEXT-track measurement sentinel; it ends only if the track state mechanism changes",
  },
  {
    selector: ".shell-grid",
    prop: "height",
    value: "100vh",
    why: "the legacy viewport fallback is the first arm of the vh→dvh pair; it ends only when the fallback is deliberately dropped",
  },
  {
    selector: ".shell-grid",
    prop: "height",
    value: "calc(100dvh - var(--orb-keyboard-inset, 0px))",
    why:
      "the dynamic viewport arm is the shell-height mechanism; it ends only if the shell stops owning the viewport. " +
      "It gained the keyboard subtrahend at #1869: `interactive-widget=resizes-content` is inert on WebKit (bug 259770) " +
      "and dvh is not shrunk by the soft keyboard on ANY browser, so the shell measures the covered band itself " +
      "(@orb/ui readKeyboardInset, written to the root by use-keyboard-inset-var.ts) and subtracts it. The `0px` " +
      "fallback is load-bearing: the hook REMOVES the property when no keyboard is up, and a bare var() inside calc() " +
      "would make this whole declaration IACVT — so the ordinary no-keyboard resolution is calc(100dvh - 0px), " +
      "byte-identical to the bare 100dvh this replaced.",
  },
  {
    selector: ".shell-grid",
    prop: "--pane-deficit",
    value: "max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w)))",
    why: "zero clamps negative deficit and 100dvw is the live viewport operand CSS must resolve; it ends only if the both-docked squeeze algebra changes",
  },
  {
    selector: ".shell-grid",
    prop: "--content-primacy-deficit",
    value: "max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%))",
    why: "zero is the no-deficit sentinel for the content-primacy measurement; it ends only if that CSS-resolved measurement mechanism changes",
  },
  {
    selector: ".shell-content-primacy-sentinel",
    prop: "block-size",
    value: "1px",
    why: "the hidden CSS-resolved measurement sentinel must have a nonzero observable box; it ends if JS no longer reads the sentinel",
  },
  {
    selector: '.shell-panel[data-panel-mode="docked"], .shell-panel[data-panel-mode="overlay"], .shell-panel[data-panel-mode="collapsed"]',
    prop: "width",
    value: "100dvw",
    why: "mobile overlay/list sheets are the dynamic viewport width; this site ends only if the one-shell mobile geometry changes",
  },
  {
    selector:
      '.shell-panel[data-panel-side="list"][data-panel-mode="overlay"], .shell-panel[data-panel-side="list"][data-panel-mode="collapsed"], .shell-panel[data-panel-side="context"][data-panel-mode="overlay"], .shell-panel[data-panel-side="context"][data-panel-mode="collapsed"]',
    prop: "width",
    value: "100dvw",
    why: "mobile overlay/list sheets are the dynamic viewport width; this site ends only if the one-shell mobile geometry changes",
  },
  {
    selector: '.shell-panel[data-panel-side="list"][data-panel-mode="docked"]',
    prop: "width",
    value: "100dvw",
    why: "mobile overlay/list sheets are the dynamic viewport width; this site ends only if the one-shell mobile geometry changes",
  },
] as const;

/** One allowlisted at-rule prelude. The prelude text IS the occurrence identity. */
interface StructuralQuery {
  readonly text: string;
  readonly why: string;
}

const STRUCTURAL_QUERIES: readonly StructuralQuery[] = [
  { text: "@supports (backdrop-filter: blur(1px)) {", why: "a supports probe needs a concrete test value and cannot consume a custom property" },
  {
    text: "@container shell-main (max-width: 30rem) {",
    why: "container-query conditions cannot consume custom properties; this is the topbar content budget",
  },
  { text: "@media (max-width: 48rem) {", why: "media-query conditions cannot consume custom properties; the breakpoint twin is sync-tested" },
] as const;

const STRUCTURAL_CLASS_FILES: Readonly<Record<string, { readonly count: number; readonly why: string }>> = {
  "packages/client/src/features/chat/lib/pager-chrome.ts": {
    count: 3,
    why: "the two rem values are container-query conditions that cannot consume variables, and -1ch collapses a mono space by its font-relative advance; the row ends if the pager's measured stand-down mechanism changes",
  },
  "packages/client/src/features/character/components/character-create-actions.tsx": {
    count: 2,
    why: "the two 19rem values are the complementary container-query conditions of the create button's display pair (`@max-[19rem]` / `@[19rem]`), and a container-query condition cannot consume a variable; the row ends if the pair's stand-down mechanism changes or the pane width becomes token-expressible",
  },
  "packages/ui/src/markdown/markdown.tsx": {
    count: 1,
    why: "60cqh is a container-query height budget, not a reusable component length; the row ends if Markdown stops using container-relative overflow",
  },
  "packages/ui/src/layout/variants.ts": {
    // 10 -> 9 (2026-09-04): the `cellFixed` track literal became `var(--orb-grid-cell-fixed)`, the density-selected token.
    count: 9,
    why: "the raw lengths are grid minmax/auto-fill track mechanics or a container-query condition; the row ends when those structural recipes disappear or become token-expressible",
  },
};

function declarationKey(selector: string, prop: string, value: string): string {
  return `${selector}\u0000${prop}\u0000${value}`;
}

function sourceToken(
  segments: readonly StaticClassSegment[],
  valueOffset: number,
  token: string,
): { readonly node: Node; readonly offset: number; readonly token: string } | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  if (segment === undefined) {
    return;
  }
  return {
    node: segment.node,
    offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart(),
    token,
  };
}

interface StaleCount {
  readonly label: string;
  readonly expected: number;
  readonly actual: number;
  readonly why: string;
}

function reportStale(ctx: GateRunCtx, row: StaleCount): void {
  ctx.report({
    file: GATE_SELF,
    line: 1,
    column: 0,
    token: row.label,
    message: `structural length allowlist row drifted: ${row.label} expected ${String(row.expected)}, saw ${String(row.actual)} — ${row.why} (tooling/src/verify/gates/css-length-tokens.ts)`,
  });
}

/** A row whose subject no longer OCCURS is a permission nobody uses — the liveness arm that replaced the
 *  count ratchet (#2101). It says nothing about how many times the subject occurs, only that it does. */
function reportUnused(ctx: GateRunCtx, label: string, why: string): void {
  ctx.report({
    file: GATE_SELF,
    line: 1,
    column: 0,
    token: label,
    message: `structural length allowlist row is UNUSED: ${label} matches nothing in the sanctioned shell stylesheet any more — ${why} (delete the row; tooling/src/verify/gates/css-length-tokens.ts)`,
  });
}

function verifyDeclarationRows(ctx: GateRunCtx, seen: ReadonlySet<string>): void {
  for (const row of STRUCTURAL_DECLARATIONS) {
    if (!seen.has(declarationKey(row.selector, row.prop, row.value))) {
      reportUnused(ctx, `${row.selector} { ${row.prop}: ${row.value} }`, row.why);
    }
  }
}

function recordDeclaration(
  ctx: GateRunCtx,
  declaration: { readonly selector: string; readonly prop: string; readonly value: string; readonly line: number },
  allowed: ReadonlySet<string>,
  seen: Set<string>,
): void {
  const key = declarationKey(declaration.selector, declaration.prop, declaration.value);
  if (allowed.has(key)) {
    seen.add(key);
    return;
  }
  ctx.report({ file: SHELL, line: declaration.line, column: 0, token: `${declaration.prop}:${declaration.value}` });
}

function scanDeclarations(ctx: GateRunCtx, raw: string): { readonly declarations: number; readonly values: number } {
  const allowed = new Set(STRUCTURAL_DECLARATIONS.map((row) => declarationKey(row.selector, row.prop, row.value)));
  const seen = new Set<string>();
  let declarations = 0;
  let values = 0;
  for (const rule of parseCssRules(raw)) {
    for (const declaration of rule.declarations) {
      declarations += 1;
      const hits = declaration.value.match(LENGTH_RE) ?? [];
      const rawLineHeight = declaration.prop === "line-height" && RAW_NUMBER_RE.test(declaration.value);
      values += Math.max(hits.length, rawLineHeight ? 1 : 0);
      if (hits.length === 0 && !rawLineHeight) {
        continue;
      }
      recordDeclaration(ctx, { ...declaration, selector: rule.selectorList }, allowed, seen);
    }
  }
  verifyDeclarationRows(ctx, seen);
  return { declarations, values };
}

function scanQueries(ctx: GateRunCtx, raw: string): void {
  const querySeen = new Set<string>();
  const blanked = blankCssComments(raw);
  for (const [index, line] of blanked.split("\n").entries()) {
    if (!(line.trimStart().startsWith("@") && LINE_LENGTH_RE.test(line))) {
      LINE_LENGTH_RE.lastIndex = 0;
      continue;
    }
    LINE_LENGTH_RE.lastIndex = 0;
    const text = line.trim();
    const row = STRUCTURAL_QUERIES.find((candidate) => candidate.text === text);
    if (row === undefined) {
      ctx.report({ file: SHELL, line: index + 1, column: 0, token: text });
    } else {
      querySeen.add(text);
    }
  }
  for (const row of STRUCTURAL_QUERIES) {
    if (!querySeen.has(row.text)) {
      reportUnused(ctx, row.text, row.why);
    }
  }
}

function scanShell(ctx: GateRunCtx): void {
  const path = join(ctx.root, SHELL);
  if (!existsSync(path)) {
    if (existsSync(join(ctx.root, REAL_TREE_ANCHOR))) {
      ctx.report({
        file: SHELL,
        line: 0,
        column: 0,
        token: "missing-shell",
        message: "required sanctioned shell stylesheet is missing; the length census cannot be clean (tooling/src/verify/gates/css-length-tokens.ts)",
      });
    }
    return;
  }
  const raw = readFileSync(path, "utf8");
  const { declarations, values } = scanDeclarations(ctx, raw);
  scanQueries(ctx, raw);
  ctx.scan({ unit: "CSS declaration/value", candidates: declarations, scanned: declarations, skipped: { "token-backed-or-unitless": declarations - values } });
}

function scanCandidate(
  ctx: GateRunCtx,
  scanner: Scanner,
  candidate: ReturnType<typeof walkStaticClassExpressions>["candidates"][number],
  allowedCounts: Map<string, number>,
): number {
  let scanned = 0;
  for (const result of scanner.getCandidatesWithPositions({ content: candidate.value, extension: "html" })) {
    const token = result.candidate;
    const match = LENGTH_RE.exec(token);
    LENGTH_RE.lastIndex = 0;
    if (match === null) {
      continue;
    }
    scanned += 1;
    const anchored = sourceToken(candidate.segments, Number(result.position) + match.index, token);
    if (anchored === undefined) {
      continue;
    }
    const rel = repoRel(ctx.root, anchored.node.getSourceFile().getFilePath());
    if (rel in STRUCTURAL_CLASS_FILES) {
      allowedCounts.set(rel, (allowedCounts.get(rel) ?? 0) + 1);
    } else {
      ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
    }
  }
  return scanned;
}

function verifyClassRows(ctx: GateRunCtx, allowedCounts: ReadonlyMap<string, number>): void {
  if (!existsSync(join(ctx.root, REAL_TREE_ANCHOR))) {
    return;
  }
  for (const [rel, row] of Object.entries(STRUCTURAL_CLASS_FILES)) {
    const actual = allowedCounts.get(rel) ?? 0;
    if (actual !== row.count) {
      reportStale(ctx, { label: rel, expected: row.count, actual, why: row.why });
    }
  }
}

function scanClasses(ctx: GateRunCtx): void {
  const files = ctx.files.filter((source) => {
    const path = repoRel(ctx.root, source.getFilePath());
    return path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/");
  });
  const walked = walkStaticClassExpressions(files);
  const scanner = new Scanner({ sources: [] });
  const allowedCounts = new Map<string, number>();
  let scanned = 0;
  for (const candidate of walked.candidates) {
    scanned += scanCandidate(ctx, scanner, candidate, allowedCounts);
  }
  for (const unresolved of walked.unresolved) {
    ctx.report(unresolved.node, { token: `unresolved:${unresolved.reason}`, offset: 0 });
  }
  verifyClassRows(ctx, allowedCounts);
  ctx.scan({
    unit: "CSS declaration or static class value",
    candidates: walked.candidates.length + walked.runtimePrefixes.length + walked.unresolved.length + walked.opaque.length,
    scanned,
    skipped: { "opaque-runtime": walked.opaque.length, "runtime-prefix": walked.runtimePrefixes.length },
  });
}

export const gate: GateDescriptor = {
  name: "css-length-tokens",
  docRow: "client-architecture-lockdown.md §4.3/§4.4 (#955)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "use an existing token, add a portable DTCG token, or put an inherently runtime CSS output in tokens.json orb.cssValues; only declared structural shell/query/class mechanics remain literal.",
  scanRoot: (path) => path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/"),
  run: (ctx) => {
    scanShell(ctx);
    scanClasses(ctx);
  },
  mustFlag: [
    {
      files: { [SHELL]: ".shell-grid { height: calc(100dvh - var(--orb-keyboard-inset, 0px)); }\n.paint { gap: 7px; }\n" },
      expect: { token: "gap:7px" },
      why: "a paint/component length in the sanctioned shell stylesheet is raw and RED",
    },
    {
      files: { [SHELL]: ".shell-label { line-height: 1; }\n" },
      expect: { token: "line-height:1" },
      why: "unitless raw line-height is a reusable typographic value and RED even though it has no length unit",
    },
    {
      files: 'export const G = <div className="hover:w-[137px]" />;\n',
      at: "packages/ui/src/x.tsx",
      expect: { token: "hover:w-[137px]" },
      why: "a raw arbitrary length discovered through the shared #961 class provenance is RED",
    },
    {
      files: { [REAL_TREE_ANCHOR]: "export const x = 1;\n" },
      expect: { token: "missing-shell" },
      why: "the real-tree anchor without the required sanctioned shell home fails loud",
    },
  ],
  mustPass: [
    {
      files: {
        [SHELL]:
          ".shell-grid { --list-track: 0px; --context-track: 0px; height: 100vh; height: calc(100dvh - var(--orb-keyboard-inset, 0px)); --pane-deficit: max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w))); --content-primacy-deficit: max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%)); }\n.shell-probe { block-size: 1px; }\n.a { width: 100dvw; }\n.b { width: 100dvw; }\n.c { width: 100dvw; }\n@supports (backdrop-filter: blur(1px)) {\n}\n@container shell-main (max-width: 30rem) {\n}\n@media (max-width: 48rem) {\n}\n",
      },
      why: "the exact structural viewport, query, zero, and measurement literals remain legal",
    },
    {
      files: 'export const G = <div className="w-(--dimension-rail) gap-row" />;\n',
      at: "packages/ui/src/x.tsx",
      why: "token-backed class carriers contain no raw length and pass",
    },
  ],
};
