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
// STRUCTURAL_CLASS_FILES WAS THE UNCONVERTED HALF, AND IS NOW CONVERTED (#2181, 2026-09-12). It was the
// second case above: its key was a FILE and its counts (3/2/1/9) were a per-file budget, so deleting them
// without narrowing the subject would have let a tenth raw length into `variants.ts` silently. The four
// rows are now THIRTEEN `(file, candidate)` rows and the count is gone as ceremony, not as enforcement.
//
// WHAT UNBLOCKED IT was the measurement this paragraph used to say a scoped lane could not take. The prior
// four-file `walkStaticClassExpressions` probe read `pager-chrome.ts` as ZERO against its row’s 3 — its
// class strings are exported constants resolved at their CONSUMERS, absent from that file set — and an
// enumeration that under-reports a row to zero cannot be the basis of the rows replacing it. Re-measured
// over the WHOLE `@client` + `@ui` tree (1,685 source files) by driving THIS MODULE’S OWN walk through the
// legacy dispatcher rather than re-implementing it, with planted controls both ways: pager-chrome 3 ·
// character-create-actions 2 · variants 9 · markdown 1 — every one of the four counts reproduced exactly,
// and the enumerated candidates are the rows. The lesson is in the method: the previous probe failed
// because it RE-IMPLEMENTED the walk over a subset, and the fix was to reuse the gate’s own walk over the
// whole tree.
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
//
// BOTH LIVENESS ARMS ARE GUARDED BY THE REAL-TREE ANCHOR (#2198, 2026-09-12) — `onRealTree`, the same
// predicate `verifyClassRows` has always used. #2101 replaced the count-drift ratchet with a liveness arm
// and did not carry the guard across, and the two are not interchangeable on a synthetic root: the old
// ratchet compared a COUNT and structurally could not fire inside a fixture, while the new arm asks
// "does this row's subject still OCCUR" — a question only the real stylesheet can answer. Unguarded it
// fired in every conformance fixture, and `mustPass` yielded 8 findings where it expects 0.
//
// THE RULE THIS MINTED, and it is the part worth carrying: **A LEGACY GATE'S PROOF ROWS ARE VISIBLE ONLY
// TO THE PLANTER** (`gate-conformance.repo.int`). `pnpm check:policy-conformance` walks the FINAL roster
// and cannot see a `GateDescriptor`'s rows at all — which is why #2101 measured green honestly, on every
// instrument its author could run, and shipped this anyway. A legacy-side proof edit owes a planter run
// before merge, and that run is the orchestrator's.
//
// THE FOUR PLACEHOLDER-SELECTOR RULES LEFT THE `mustPass` FIXTURE with that guard (#2198). They asserted
// four SELECTORS were legal that the allowlist does not name (`.shell-probe`, `.a`, `.b`, `.c`), which was
// true while only `prop:value` was keyed and became FALSE the moment #2101 made the selector half
// load-bearing — the OCCURRENCE arm reported all four as unallowlisted raw lengths, which is that arm
// working correctly. They are DELETED, never re-keyed onto the real selectors: re-keying would couple a
// conformance fixture to production CSS, so a client lane editing `shell.css` would red a tooling suite
// that sits in no client lane's floor. **Measured coverage delta of the deletion** (read with this
// module's own `LENGTH_RE` over `parseCssRules`, not by eye): the declaration arm still exercises `0px`
// x5, `100vh`, `100dvh` and `100dvw` — every viewport and zero form survives — and loses only a NONZERO
// `px` declaration (`block-size: 1px`). No mechanism goes with it: `LENGTH_RE` has one branch for every
// unit, so `0px` walks the identical path, and `1px` itself is still carried by the kept
// `@supports (backdrop-filter: blur(1px))` prelude and by the class arm's `hover:w-[137px]` row. A
// replacement `1px` line inside `.shell-grid` is NOT available as a remedy: its key would not be
// allowlisted either, so it would report as an occurrence and red the very row it was meant to restore.
//
// DECLARED LIMIT, recorded so #2181 inherits it rather than rediscovering it: the `mustPass` fixture is
// still coupled to production through the `.shell-grid` SELECTOR itself — rename that class and the six
// declarations under it become unallowlisted occurrences and this row reds. That coupling is inherent to
// any `mustPass` which writes into `shell.css` at all, it predates #2101, and it dissolves when #2181
// converts these rows to reviewed grants with central liveness.
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

/** The structural class candidates, keyed on `(file, candidate)` — NOT on the file with a budget.
 *
 *  #2101 re-keyed the other twelve rows onto their occurrence and left this table as the unconverted half,
 *  because its key was a FILE and its counts (3/2/1/9) were a per-file budget: deleting the numbers without
 *  narrowing the subject would have let a tenth raw length into `variants.ts` silently. §12.5's rule is that
 *  a `count` is the TELL that the subject is wrong, so the repair is the narrower subject, and the count
 *  then deletes as ceremony rather than as enforcement.
 *
 *  WHY A SCOPED LANE COULD NOT DO THIS, and what changed. The header recorded a four-file probe that read
 *  `pager-chrome.ts` as ZERO against its row's 3 — its class strings are exported constants resolved at
 *  their CONSUMERS, which that file set did not contain, and an enumeration that under-reports a row to zero
 *  cannot be the basis of the rows replacing it. Re-measured 2026-09-12 over the WHOLE `@client` + `@ui`
 *  tree (1,685 source files) by driving THIS MODULE'S OWN walk through the legacy dispatcher — never a
 *  re-implementation, which is what under-reported last time — with planted controls both ways (a row's file
 *  enumerates non-zero; a file no row names never appears). Every one of the four counts reproduced exactly:
 *  pager-chrome 3 · character-create-actions 2 · variants 9 · markdown 1.
 *
 *  A CANDIDATE MAY REPEAT, AND THAT IS THE DELIBERATE EDGE. `variants.ts` has 9 occurrences across 7 unique
 *  candidates (two grid recipes appear twice). A `(file, candidate)` row therefore covers every occurrence of
 *  that exact candidate in that file, which is the point: the reviewed thing is the RECIPE, and using a
 *  reviewed recipe twice is not a new exemption. What the old budget bought — "a tenth raw length is caught" —
 *  survives strictly, because a tenth length is a NEW candidate and no row names it; what it loses is only
 *  the ability to distinguish two uses of an already-reviewed recipe from one, which was never the subject. */
const STRUCTURAL_CLASS_CANDIDATES: readonly { readonly file: string; readonly candidate: string; readonly why: string }[] = [
  // packages/client/src/features/chat/lib/pager-chrome.ts — the pager's measured stand-down mechanism.
  {
    file: "packages/client/src/features/chat/lib/pager-chrome.ts",
    candidate: "@max-[12rem]/pager:sr-only",
    why: "a container-query condition cannot consume a variable; this is the pager's narrowest stand-down step. Ends if the pager's measured stand-down mechanism changes",
  },
  {
    file: "packages/client/src/features/chat/lib/pager-chrome.ts",
    candidate: "@max-[13rem]/pager:gap-tight",
    why: "the second container-query step of the same stand-down pair; a container-query condition cannot consume a variable. Ends with the mechanism above",
  },
  {
    file: "packages/client/src/features/chat/lib/pager-chrome.ts",
    candidate: "@max-[13rem]/pager:[word-spacing:-1ch]",
    why: "-1ch collapses a mono space by its own font-relative advance, which no token can express. Ends if the pager stops collapsing mono spacing",
  },
  // packages/client/src/features/character/components/character-create-actions.tsx — the display pair.
  {
    file: "packages/client/src/features/character/components/character-create-actions.tsx",
    candidate: "@max-[19rem]:hidden",
    why: "the narrow half of the create button's complementary display pair; a container-query condition cannot consume a variable. Ends if the pair's stand-down mechanism changes or the pane width becomes token-expressible",
  },
  {
    file: "packages/client/src/features/character/components/character-create-actions.tsx",
    candidate: "@[19rem]:hidden",
    why: "the wide half of the same pair — the two are complementary and must stay in sync. Ends with its twin above",
  },
  // packages/ui/src/markdown/markdown.tsx
  {
    file: "packages/ui/src/markdown/markdown.tsx",
    candidate: "max-h-[60cqh]",
    why: "60cqh is a container-query height budget, not a reusable component length. Ends if Markdown stops using container-relative overflow",
  },
  // packages/ui/src/layout/variants.ts — grid track mechanics and container-query conditions.
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "@md:grid-cols-[repeat(auto-fill,8.5rem)]",
    why: "an auto-fill track recipe: the 8.5rem is the track SIZE inside a grid function, which is structural mechanics rather than a reusable component length. Ends when the recipe disappears or becomes token-expressible",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "@min-[100rem]:grid-cols-[1.5fr_1.05fr]",
    why: "a container-query condition (100rem) selecting an fr-ratio track pair; neither half is token-expressible. Ends with the wide-viewport split",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "@min-[100rem]:grid-cols-2",
    why: "the same 100rem container-query condition selecting the two-column fallback; a container-query condition cannot consume a variable. Ends with the wide-viewport split",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "grid-cols-[repeat(auto-fit,minmax(min(5rem,100%),1fr))]",
    why: "an auto-fit minmax track recipe; the length is a track floor inside a grid function. Ends when the recipe disappears or becomes token-expressible",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))]",
    why: "the same auto-fit recipe at the card track floor. Ends with its siblings",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
    why: "the same auto-fit recipe at the wide-card track floor. Ends with its siblings",
  },
  {
    file: "packages/ui/src/layout/variants.ts",
    candidate: "grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
    why: "the same auto-fit recipe at the widest track floor. Ends with its siblings",
  },
];

/** The `(file, candidate)` pairs this table exempts, as a lookup key. */
function classCandidateKey(file: string, candidate: string): string {
  return `${file}\u0000${candidate}`;
}

const STRUCTURAL_CLASS_KEYS: ReadonlySet<string> = new Set(STRUCTURAL_CLASS_CANDIDATES.map(({ file, candidate }) => classCandidateKey(file, candidate)));

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

/** Is this run standing on the REAL tree? The liveness arms below ask whether an allowlist row's subject
 *  still OCCURS, which is a question only the real `shell.css` can answer — a synthetic conformance root
 *  carries a stylesheet written to exercise the OCCURRENCE direction, not to reproduce all thirteen
 *  subjects. `verifyClassRows` has always been guarded this way; #2101 re-keyed the two shell tables onto
 *  the occurrence and replaced their count-drift arm with a liveness arm WITHOUT carrying the guard across
 *  (#2198), so the new arm fired inside every fixture. The old ratchet structurally could not. */
function onRealTree(ctx: GateRunCtx): boolean {
  return existsSync(join(ctx.root, REAL_TREE_ANCHOR));
}

function verifyDeclarationRows(ctx: GateRunCtx, seen: ReadonlySet<string>): void {
  if (!onRealTree(ctx)) {
    return;
  }
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
  if (!onRealTree(ctx)) {
    return;
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
  seenCandidates: Set<string>,
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
    const key = classCandidateKey(rel, token);
    if (STRUCTURAL_CLASS_KEYS.has(key)) {
      seenCandidates.add(key);
    } else {
      ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
    }
  }
  return scanned;
}

/** The ZERO-OCCURRENCE liveness arm, the same shape #2101 gave the other twelve rows: a row whose
 *  `(file, candidate)` no longer occurs on the real tree is a permission nobody uses. It asks whether the
 *  subject still OCCURS, never how many times — which is why it is guarded by `onRealTree` exactly as
 *  `verifyClassRows` always was: only the real source tree can answer it, and unguarded it fires inside
 *  every conformance fixture (#2198, which is how the last unguarded liveness arm shipped red). */
function verifyClassRows(ctx: GateRunCtx, seenCandidates: ReadonlySet<string>): void {
  if (!onRealTree(ctx)) {
    return;
  }
  for (const row of STRUCTURAL_CLASS_CANDIDATES) {
    if (!seenCandidates.has(classCandidateKey(row.file, row.candidate))) {
      reportStale(ctx, { label: `${row.file} :: ${row.candidate}`, expected: 1, actual: 0, why: row.why });
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
  const seenCandidates = new Set<string>();
  let scanned = 0;
  for (const candidate of walked.candidates) {
    scanned += scanCandidate(ctx, scanner, candidate, seenCandidates);
  }
  for (const unresolved of walked.unresolved) {
    ctx.report(unresolved.node, { token: `unresolved:${unresolved.reason}`, offset: 0 });
  }
  verifyClassRows(ctx, seenCandidates);
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
      files: {
        [REAL_TREE_ANCHOR]: "export const x = 1;\n",
        [SHELL]:
          ".shell-grid { --list-track: 0px; --context-track: 0px; height: 100vh; height: calc(100dvh - var(--orb-keyboard-inset, 0px)); --pane-deficit: max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w))); --content-primacy-deficit: max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%)); }\n@supports (backdrop-filter: blur(1px)) {\n}\n@container shell-main (max-width: 30rem) {\n}\n",
      },
      expect: { token: "@media (max-width: 48rem) {" },
      why: "THE GUARDED LIVENESS ARMS' ONLY PROOF (#2198), and it is not optional: once both arms sit behind the real-tree anchor NOTHING else reaches them, and a guarded arm with no control is how an arm goes vacuous — the failure the header's last measured line (`the liveness test INVERTED -> 10`) exists to refuse. The token is the QUERY liveness arm's and only its: the declaration arm emits `<selector> { <prop>: <value> }` and the class arm emits file paths, so no other arm can produce it. MEASURED CARDINALITY, stated because this row does NOT isolate one finding: planting the anchor necessarily also switches on the sibling arms it guards, so this fixture yields NINE — this one, the three panel + one sentinel declaration rows no fixture can carry without production selectors, and the STRUCTURAL_CLASS_CANDIDATES rows that need real client files. That is the guard working on all three arms at once. THE EXACT CARDINALITY MOVED WITH #2181 and is deliberately NOT restated as a number here: the four per-file rows became thirteen `(file, candidate)` rows, so the count this fixture yields changed, and a LEGACY gate’s proof rows are visible ONLY to the planter (`gate-conformance.repo.int`) — `check:policy-conformance` walks the FINAL roster and cannot see them. A number nobody in this lane can measure is the rotting-count shape, so the MECHANISM is stated and the planter owns the figure. THE FALSIFIER IS THE ANCHOR: drop `REAL_TREE_ANCHOR` from this row's file map and the identical stylesheet yields ZERO (measured 2026-09-12), which is the guard itself cut in the direction that matters",
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
          ".shell-grid { --list-track: 0px; --context-track: 0px; height: 100vh; height: calc(100dvh - var(--orb-keyboard-inset, 0px)); --pane-deficit: max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w))); --content-primacy-deficit: max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%)); }\n@supports (backdrop-filter: blur(1px)) {\n}\n@container shell-main (max-width: 30rem) {\n}\n@media (max-width: 48rem) {\n}\n",
      },
      why: "the exact structural viewport, query, zero, and measurement literals remain legal. THE FOUR PLACEHOLDER-SELECTOR RULES ARE GONE (#2198): `.shell-probe`/`.a`/`.b`/`.c` carried allowlisted prop/value pairs under selectors the allowlist does not name, which was legal while only `prop:value` was keyed and became FALSE when #2101 made the selector load-bearing — the occurrence arm reported all four as unallowlisted raw lengths. They are DELETED rather than re-keyed to the real selectors: re-keying would couple this conformance fixture to production CSS, so a client lane editing shell.css would red a tooling suite in no client lane's floor. What the row claims is carried by the `.shell-grid` block and the three at-rules",
    },
    {
      files: 'export const G = <div className="w-(--dimension-rail) gap-row" />;\n',
      at: "packages/ui/src/x.tsx",
      why: "token-backed class carriers contain no raw length and pass",
    },
  ],
};
