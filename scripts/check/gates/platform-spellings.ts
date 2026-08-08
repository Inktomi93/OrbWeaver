// Gate: platform-spellings — the anti-backslide ratchet for the Node 21→26 maximal-adoption program §8
// (docs/design/node-26-adoption-program.md). Each ACTIVE arm is a RULED ADOPT/AVOID whose modern spelling
// W4 already burned down; the gate keeps the old spelling from creeping back through a copy-paste or an
// agent's pre-node-26 muscle memory. Both active arms land at ZERO on the tree — a LIVE-verified zero: the
// arm inventory was established by RUNNING the gate (node scripts/check/report.ts), not by ast-grep sweeps,
// which returned false negatives here for want of positive controls (and surfaced the 7 §4.5 captures below).
//
// ARM SLEEP (§4.1) — `new Promise((resolve) => setTimeout(resolve, ms))` (expr- or block-body) → the
//   `setTimeout` of `node:timers/promises`. The tell is precise: the executor passes its RESOLVE param
//   DIRECTLY as the timer callback and never references reject. A timeout-REJECT race (`setTimeout(() =>
//   reject(…), ms)`) is NOT a sleep — it passes an arrow, not the bare resolve identifier, and wires reject
//   — so it is never flagged (mustPass). CARVE-OUT `packages/{client,ui}`: those bundle to the BROWSER,
//   where `node:timers/promises` does not exist (route-guards.ts's `wait` is the sanctioned browser sleep,
//   §4.1); flagging it would demand a fix that does not exist, so the arm skips client/ui paths.
//
// ARM ESCAPE-MINT (§4.7) — a hand-rolled `RegExp.escape` re-mint, detected by NAME: a binding declared as
//   `escapeRegExp`/`escapeRegex` (function declaration OR `const … = (…) =>`/function expression).
//   `RegExp.escape` is browser-baseline and a strict superset of every hand-roll; the kit `escapeRegExp` and
//   its duplicates were deleted in W4. DECLARED LIMIT: the arm is NAME-based only. An earlier char-class
//   heuristic ("a regex enumerating ≥8 metacharacters") was BUILT AND REMOVED — measured, it produced 27
//   FALSE POSITIVES on legitimate regexes (color validators, dice notation, markdown fences, a slash-command
//   parser): a real nameless escape-all class is not reliably separable from a complex regex by literal
//   shape. Every real re-mint on this tree was NAMED, so the name arm catches the whole live class at zero;
//   a nameless inline `.replace(/[.*+?…]/g, "\\$&")` (none exist in packages/**) is the accepted blind spot.
//
// ARM DEFERRED→withResolvers (§4.5) — a `new Promise` whose executor ASSIGNS one of its own resolve/reject
//   params OUT of the executor (`let wake; new Promise((r) => { wake = r; })`) → `Promise.withResolvers()`.
//   LANDED by the W4.5 burn-down (2026-08-07): 8 live production captures converted — app-ready signal,
//   preset fork-choice ask, chat-engine lock-lost barrier, the turn DeltaBridge arrival re-arm (×2),
//   frame-queue wake, local-light orphan guard, compose drain notify. The tell is the ASSIGNMENT: a normal
//   executor CALLS resolve/reject, it never hands them out, so it is never flagged (mustPass). The QuickJS
//   bridge's `ctx.newPromise()` is a different construct entirely (not a `new Promise`) and §4.5 excludes it.
//
// ARM SPREAD-SORT (§4.2) — `[...x].sort(fn)` → `x.toSorted(fn)`, but ONLY where the receiver is PROVABLY an
//   array. The split is real: `[...m.entries()].sort()` / `[...new Set(xs)].sort()` MATERIALIZE an iterator,
//   where the spread is mandatory and in-place `.sort` on the fresh array is correct (`toSorted` there is a
//   wasted second copy). W4.2 landed 2026-08-07 — 94 sites converted (21 in `packages/**`), 21 iterator
//   materializations deliberately KEPT, decided with the ts-morph TYPE CHECKER over a tsconfig-loaded project.
//   DECLARED LIMIT — the arm is SYNTACTIC, and that is a HARNESS FACT, not laziness: `pnpm check` builds the
//   PURE-AST workspace (`scripts/ts-workspace.ts` `getWorkspace({root})` — no tsconfig, no `@orb/*`
//   resolution), so a `getType()` here answers as if every cross-package type were unknown; a checker-backed
//   version belongs to a future PUSH-tier typed stage beside `deps:orphan-ratchet`, never the commit bar. So
//   the arm flags only what it can PROVE IN-FILE: an array literal, an array-returning built-in
//   (`map`/`filter`/`slice`/`concat`/`flat`/`flatMap`/`split`/`Object.keys|values|entries`/`Array.from|of`),
//   an `?? []` fallback, or an identifier resolving to a same-file declaration with an ARRAY type annotation
//   (including the destructured-prop idiom `({ rows }: { readonly rows: Row[] })`). MEASURED on the
//   pre-burn-down tree: 14 of the 21 real `packages/**` copies flagged, ZERO of the 13 iterator
//   materializations — precision 100%, recall 67%. The 7 misses are exactly the cross-file/inferred class
//   (an SDK response property, a query `.data`, a `for`-of tuple destructure, a contextually-typed callback
//   param, an awaited port read) — each written as a mustPass row so the blind spot is a BASELINE, not an
//   assumption. Same posture as `brand-in-name-position`'s syntactic-by-necessity limit.
//
// SCOPE: `packages/**` only — tests/ and scripts/ are OUT, matching the LANDED `zod-modern-spellings`
//   precedent (a test may plant an old spelling DELIBERATELY as a fixture) and §8's own §4.1, which
//   explicitly sanctions "a tests/** scope decision." This exclusion is deliberate-and-precedented.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const PROMISE = "Promise";
const SET_TIMEOUT = "setTimeout";
const SORT = "sort";
const ESCAPE_NAMES: ReadonlySet<string> = new Set(["escapeRegExp", "escapeRegex"]);
const SCAN_PREFIX = "packages/";
const BROWSER_ROOTS: readonly string[] = ["packages/client/", "packages/ui/"];
const LEADING_SLASH_RE = /^\/+/u;

/** Array-instance methods whose return type is unconditionally a fresh array — the syntactic proof that a
 *  spread source is an array without asking the (unavailable, see the header) type checker. */
const ARRAY_RETURNING_METHODS: ReadonlySet<string> = new Set([
  "map",
  "filter",
  "slice",
  "concat",
  "flat",
  "flatMap",
  "split",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
]);
/** Statics whose return is always an array, matched on the WHOLE callee text (`Object.keys`, not `keys`). */
const ARRAY_STATICS: ReadonlySet<string> = new Set(["Object.keys", "Object.values", "Object.entries", "Array.from", "Array.of"]);
const ARRAY_TYPE_NAMES: ReadonlySet<string> = new Set(["Array", "ReadonlyArray"]);
/** Resolution depth for the identifier→declaration→initializer walk. Three hops covers every live shape;
 *  the bound exists so a self-referential or cyclic same-file chain cannot spin. */
const MAX_RESOLVE_HOPS = 3;

const SLEEP_MESSAGE =
  "a hand-rolled sleep `new Promise((resolve) => setTimeout(resolve, ms))` — import `setTimeout` from " +
  "`node:timers/promises` and `await setTimeout(ms)` (node-26 adoption program §4.1). A timeout-REJECT race " +
  "is a different construct and is never flagged.";

const DEFERRED_MESSAGE =
  "a hand-rolled deferred promise — the `new Promise` executor hands its resolve/reject OUT to an enclosing " +
  "binding. Use `Promise.withResolvers()` (node-26 adoption program §4.5): `const { promise, resolve } = " +
  "Promise.withResolvers<T>()`. An executor that CALLS resolve/reject is a normal promise and is never flagged.";

const SPREAD_SORT_MESSAGE =
  "a `[...arr].sort(fn)` defensive copy — use `arr.toSorted(fn)` (node-26 adoption program §4.2). Only a " +
  "PROVABLE array is flagged: an iterator materialization (`[...map.entries()].sort()`, `[...new Set(x)]" +
  ".sort()`) needs its spread and is never flagged.";

const ESCAPE_MESSAGE =
  "a hand-rolled RegExp-escape re-mint — use the platform `RegExp.escape(str)` (node-26 adoption program " +
  "§4.7). It is browser-baseline and a strict superset of every hand-roll; the kit `escapeRegExp` and its " +
  "duplicates were deleted in W4.";

const GROUP_MESSAGE =
  "a superseded pre-node-26 spelling — the node-26 maximal-adoption program (docs/design/" +
  "node-26-adoption-program.md §8) ruled the modern spelling is THE spelling and W4 burned the sites down. " +
  "`new Promise(setTimeout)` sleeps → `node:timers/promises` setTimeout (§4.1); a `new Promise` that hands " +
  "its resolver out → `Promise.withResolvers()` (§4.5); `[...arr].sort(fn)` → `arr.toSorted(fn)` (§4.2); a " +
  "hand-rolled RegExp escape (a function named escapeRegExp/escapeRegex) → `RegExp.escape` (§4.7).";

const FIX =
  'SLEEP: `import { setTimeout } from "node:timers/promises"; await setTimeout(ms)`. DEFERRED: `const { promise, resolve } = Promise.withResolvers<T>()`. SPREAD-SORT: `arr.toSorted(fn)`. ESCAPE: `RegExp.escape(str)` — delete the hand-rolled escapeRegExp.';

function repoRel(path: string): string {
  const idx = path.indexOf(`/${SCAN_PREFIX}`);
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

function isBrowserPath(rel: string): boolean {
  return BROWSER_ROOTS.some((root) => rel.startsWith(root));
}

/** The executor (first arg) of `new Promise(<executor>)` when it is an arrow/function with ≥1 parameter. */
function promiseExecutor(node: Node): Node | undefined {
  if (!node.isKind(SyntaxKind.NewExpression) || node.getExpression().getText() !== PROMISE) {
    return;
  }
  const executor = node.getArguments()[0];
  if (executor === undefined || !(executor.isKind(SyntaxKind.ArrowFunction) || executor.isKind(SyntaxKind.FunctionExpression))) {
    return;
  }
  return executor.getParameters().length > 0 ? executor : undefined;
}

function paramNames(executor: Node): readonly string[] {
  if (!(executor.isKind(SyntaxKind.ArrowFunction) || executor.isKind(SyntaxKind.FunctionExpression))) {
    return [];
  }
  return executor.getParameters().flatMap((p) => {
    const name = p.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? [name.getText()] : [];
  });
}

/** ARM SLEEP: the executor passes its resolve param DIRECTLY to `setTimeout` and never references reject. */
function isSleepPromise(node: Node): boolean {
  const executor = promiseExecutor(node);
  if (executor === undefined) {
    return false;
  }
  const names = paramNames(executor);
  const resolveName = names[0];
  if (resolveName === undefined) {
    return false;
  }
  const rejectName = names[1];
  const identsInBody = executor.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText());
  if (rejectName !== undefined && identsInBody.includes(rejectName)) {
    return false; // reject is wired → a timeout-reject race, not a sleep
  }
  return executor.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    if (call.getExpression().getText() !== SET_TIMEOUT) {
      return false;
    }
    const first = call.getArguments()[0];
    if (first === undefined || !first.isKind(SyntaxKind.Identifier)) {
      return false;
    }
    return first.getText() === resolveName;
  });
}

/** ARM DEFERRED: the executor ASSIGNS one of its own params to something OUTSIDE itself — the deferred-promise
 *  shape `Promise.withResolvers()` replaces. A normal executor CALLS resolve/reject and never hands them out. */
function isDeferredCapture(node: Node): boolean {
  const executor = promiseExecutor(node);
  if (executor === undefined) {
    return false;
  }
  const names = new Set(paramNames(executor));
  if (names.size === 0) {
    return false;
  }
  return executor.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((bin) => {
    if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      return false;
    }
    const rhs = bin.getRight();
    if (!(rhs.isKind(SyntaxKind.Identifier) && names.has(rhs.getText()))) {
      return false;
    }
    // The capture is only "deferred" if the TARGET outlives the executor: a `let x` declared inside it is
    // a local shuffle, not a hand-out.
    const lhs = bin.getLeft();
    if (!lhs.isKind(SyntaxKind.Identifier)) {
      return true; // `ref.current = resolve` / `obj.slot = resolve` — a property target is always outside
    }
    const decl = lhs.getSymbol()?.getDeclarations()?.[0];
    return decl === undefined || !decl.getAncestors().includes(executor);
  });
}

/** A type ANNOTATION that is unambiguously an array: `T[]`, a tuple, `readonly …`, `Array<T>`/`ReadonlyArray<T>`,
 *  or a union of those. Deliberately conservative — anything else answers "not proven", never "not an array". */
function isArrayTypeNode(t: Node | undefined): boolean {
  if (t === undefined) {
    return false;
  }
  if (t.isKind(SyntaxKind.ArrayType) || t.isKind(SyntaxKind.TupleType)) {
    return true;
  }
  if (t.isKind(SyntaxKind.ParenthesizedType)) {
    return isArrayTypeNode(t.getTypeNode());
  }
  if (t.isKind(SyntaxKind.TypeOperator)) {
    return t.getChildren().some((c) => isArrayTypeNode(c));
  }
  if (t.isKind(SyntaxKind.UnionType)) {
    return t.getTypeNodes().every((u) => isArrayTypeNode(u));
  }
  return t.isKind(SyntaxKind.TypeReference) && ARRAY_TYPE_NAMES.has(t.getTypeName().getText());
}

/** The annotated type of a name destructured out of an OBJECT pattern whose binder carries a TypeLiteral —
 *  `function Rows({ rows }: { readonly rows: readonly Row[] })`, the client's dominant prop-reading idiom.
 *  Without this the arm goes blind on every destructured component prop. */
function destructuredPropertyTypeNode(decl: Node): Node | undefined {
  if (!decl.isKind(SyntaxKind.BindingElement)) {
    return;
  }
  const pattern = decl.getParent();
  if (!pattern.isKind(SyntaxKind.ObjectBindingPattern)) {
    return;
  }
  const binder = pattern.getParent();
  if (!(binder.isKind(SyntaxKind.Parameter) || binder.isKind(SyntaxKind.VariableDeclaration))) {
    return;
  }
  const annotation = binder.getTypeNode();
  if (annotation === undefined || !annotation.isKind(SyntaxKind.TypeLiteral)) {
    return;
  }
  return annotation.getProperty((decl.getPropertyNameNode() ?? decl.getNameNode()).getText())?.getTypeNode();
}

/** ARM SPREAD-SORT's precision core: is this spread source PROVABLY an array, using only same-file syntax?
 *  Returns false for "cannot tell" — the arm's declared limit (see the header) is under-reach, never a
 *  false positive, so an iterator/Set/Map receiver can never be flagged. */
function provablyArray(node: Node, hops: number): boolean {
  if (hops > MAX_RESOLVE_HOPS) {
    return false;
  }
  const n = unwrapExpression(node);
  if (n.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return true;
  }
  if (n.isKind(SyntaxKind.NonNullExpression)) {
    return provablyArray(n.getExpression(), hops + 1);
  }
  if (n.isKind(SyntaxKind.BinaryExpression)) {
    const op = n.getOperatorToken().getKind();
    // `data ?? []` — the fallback proves the whole expression is an array however the left side is typed.
    const isFallback = op === SyntaxKind.QuestionQuestionToken || op === SyntaxKind.BarBarToken;
    return isFallback && (provablyArray(n.getRight(), hops + 1) || provablyArray(n.getLeft(), hops + 1));
  }
  if (n.isKind(SyntaxKind.ConditionalExpression)) {
    return provablyArray(n.getWhenTrue(), hops + 1) && provablyArray(n.getWhenFalse(), hops + 1);
  }
  if (n.isKind(SyntaxKind.CallExpression)) {
    const callee = n.getExpression();
    return callee.isKind(SyntaxKind.PropertyAccessExpression) && (ARRAY_STATICS.has(callee.getText()) || ARRAY_RETURNING_METHODS.has(callee.getName()));
  }
  return n.isKind(SyntaxKind.Identifier) && identifierProvablyArray(n, hops);
}

/** The identifier arm of {@link provablyArray}: resolve the name to its SAME-FILE declaration and read an
 *  array proof off it (annotation, initializer, or the destructured-prop TypeLiteral member). A cross-file
 *  declaration is UNRESOLVED in the pure-AST harness (see the header), so it answers "not proven". */
function identifierProvablyArray(node: Node, hops: number): boolean {
  const decl = node.getSymbol()?.getDeclarations()?.[0];
  if (decl === undefined || decl.getSourceFile() !== node.getSourceFile()) {
    return false;
  }
  if (decl.isKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    return isArrayTypeNode(decl.getTypeNode()) || (init !== undefined && provablyArray(init, hops + 1));
  }
  if (decl.isKind(SyntaxKind.Parameter)) {
    return isArrayTypeNode(decl.getTypeNode());
  }
  return isArrayTypeNode(destructuredPropertyTypeNode(decl));
}

/** ARM SPREAD-SORT: the single spread source of `[...X].sort(…)`, when X is provably an array. */
function spreadSortReceiver(node: Node): Node | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === SORT)) {
    return;
  }
  const recv = callee.getExpression();
  if (!recv.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return;
  }
  const elements = recv.getElements();
  const only = elements.length === 1 ? elements[0] : undefined;
  if (only === undefined || !only.isKind(SyntaxKind.SpreadElement)) {
    return; // `[...a, ...b].sort()` / `[x].sort()` — not a defensive copy of one array
  }
  const src = only.getExpression();
  return provablyArray(src, 0) ? src : undefined;
}

/** ARM ESCAPE-MINT: a binding named `escapeRegExp`/`escapeRegex` that is a function. Returns its name node. */
function escapeMintName(node: Node): Node | undefined {
  if (node.isKind(SyntaxKind.FunctionDeclaration)) {
    const nameNode = node.getNameNode();
    return nameNode !== undefined && ESCAPE_NAMES.has(nameNode.getText()) ? nameNode : undefined;
  }
  if (!(node.isKind(SyntaxKind.VariableDeclaration) && ESCAPE_NAMES.has(node.getName()))) {
    return;
  }
  const init = node.getInitializer();
  return init !== undefined && (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) ? node.getNameNode() : undefined;
}

function report(node: Node, rel: string, message: string, ctx: GateRunCtx): void {
  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 0, message });
}

export const gate: GateDescriptor = {
  name: "platform-spellings",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — docs/design/node-26-adoption-program.md §8",
  status: "active",
  scopeSafety: "incremental-safe", // per-file, syntactic verdicts — no cross-file state
  message: GROUP_MESSAGE,
  fix: FIX,
  // Scanned home, tests/scripts OUT — the zod-modern-spellings precedent + §8 §4.1 (see the header).
  scanRoot: (p) => p.includes(SCAN_PREFIX),
  kinds: [SyntaxKind.NewExpression, SyntaxKind.CallExpression, SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration],

  visit: (node, sf, ctx) => {
    const rel = repoRel(sf.getFilePath());
    if (node.isKind(SyntaxKind.NewExpression)) {
      // SLEEP is node-only (the client/ui carve-out); DEFERRED is browser-baseline, so it applies everywhere.
      if (!isBrowserPath(rel) && isSleepPromise(node)) {
        report(node, rel, SLEEP_MESSAGE, ctx);
      } else if (isDeferredCapture(node)) {
        report(node, rel, DEFERRED_MESSAGE, ctx);
      }
      return;
    }
    if (node.isKind(SyntaxKind.CallExpression)) {
      const receiver = spreadSortReceiver(node);
      if (receiver !== undefined) {
        report(receiver, rel, SPREAD_SORT_MESSAGE, ctx);
      }
      return;
    }
    const nameNode = escapeMintName(node);
    if (nameNode !== undefined) {
      report(nameNode, rel, ESCAPE_MESSAGE, ctx);
    }
  },

  mustFlag: [
    {
      files: "export const nap = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
      at: "packages/server/src/domain/probe-sleep/expr.ts",
      expect: { count: 1, messageIncludes: "node:timers/promises" },
      why: "ARM SLEEP expr-body — the exact hand-roll W4.1 burned across seven production sites; resolve is passed DIRECTLY to setTimeout",
    },
    {
      files: "export function nap(ms: number): Promise<void> {\n  return new Promise((resolve) => {\n    setTimeout(resolve, ms);\n  });\n}\n",
      at: "packages/server/src/domain/probe-sleep/block.ts",
      expect: { count: 1 },
      why: "ARM SLEEP block-body — the same sleep with a statement body, proving the arm is not expression-body-only",
    },
    {
      files: "export function escapeRegExp(s: string): string {\n  return s;\n}\n",
      at: "packages/server/src/kit/probe-escape/decl.ts",
      expect: { count: 1, messageIncludes: "RegExp.escape" },
      why: "ARM ESCAPE-MINT decl — a function DECLARATION named escapeRegExp, the kit export W4.7 deleted",
    },
    {
      files: "export const escapeRegex = (s: string): string => s;\n",
      at: "packages/server/src/kit/probe-escape/arrow.ts",
      expect: { count: 1 },
      why: "ARM ESCAPE-MINT decl (arrow) — the `const escapeRegex = (…) =>` local re-mint form (body.ts carried its own copy); the name-binding arm covers both spellings",
    },
    {
      files:
        "export function bridge(): { readonly ready: Promise<void>; readonly wake: () => void } {\n" +
        "  let wake = (): void => undefined;\n" +
        "  const ready = new Promise<void>((resolve) => {\n" +
        "    wake = resolve;\n" +
        "  });\n" +
        "  return { ready, wake };\n" +
        "}\n",
      at: "packages/server/src/domain/probe-deferred/resolve.ts",
      expect: { count: 1, messageIncludes: "Promise.withResolvers()" },
      why: "ARM DEFERRED founding shape — the resolve hand-out W4.5 burned at six production sites (app-ready, frame-queue wake, the turn DeltaBridge re-arm, compose drain notify)",
    },
    {
      files:
        "export function barrier(): Promise<never> {\n" +
        "  let fail!: (err: unknown) => void;\n" +
        "  const lost = new Promise<never>((_resolve, reject) => {\n" +
        "    fail = reject;\n" +
        "  });\n" +
        '  setTimeout(() => fail(new Error("lost")), 1);\n' +
        "  return lost;\n" +
        "}\n",
      at: "packages/server/src/domain/probe-deferred/reject.ts",
      expect: { count: 1 },
      why: "ARM DEFERRED, the REJECT half with a definite-assignment `let x!` — the chat-engine lock-lost barrier + the local-light orphan guard; proves the arm is not resolve-only and reads past the `!` modifier",
    },
    {
      files:
        "type Row = { readonly rank: number };\n" +
        "export function order(rows: readonly Row[]): readonly Row[] {\n" +
        "  return [...rows].sort((a, b) => a.rank - b.rank);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-spread-sort/annotated.ts",
      expect: { count: 1, messageIncludes: "toSorted" },
      why: "ARM SPREAD-SORT founding shape — an ANNOTATED array parameter defensively copied to avoid mutating it; the single commonest of the 21 packages/** sites W4.2 converted",
    },
    {
      files:
        "type Row = { readonly rank: number };\n" +
        "export function order(all: readonly Row[]): readonly Row[] {\n" +
        "  return [...all.filter((r) => r.rank > 0)].sort((a, b) => a.rank - b.rank);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-spread-sort/method.ts",
      expect: { count: 1 },
      why: "ARM SPREAD-SORT via an array-RETURNING built-in — `.filter()` already produced a fresh array, so the spread is a second wasted copy; proves the proof does not depend on a type annotation",
    },
    {
      files:
        'import type { ReactElement } from "react";\n' +
        "type Row = { readonly rank: number };\n" +
        "export function Rows({ rows }: { readonly rows: readonly Row[] }): ReactElement | null {\n" +
        "  const ranked = [...rows].sort((a, b) => a.rank - b.rank);\n" +
        "  return ranked.length === 0 ? null : null;\n" +
        "}\n",
      at: "packages/client/src/features/probe-spread-sort/components/destructured.tsx",
      expect: { count: 1 },
      why: "ARM SPREAD-SORT through the DESTRUCTURED-PROP idiom (`{ rows }: { rows: Row[] }`) — the client's dominant prop shape; without this resolution the arm would go blind on every component, which is how it reaches the rpg-journal / corpus-similarity sites",
    },
  ],
  mustPass: [
    {
      files:
        "export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {\n" +
        "  return Promise.race([\n" +
        "    work,\n" +
        "    new Promise<T>((_resolve, reject) => {\n" +
        '      setTimeout(() => reject(new Error("timeout")), ms);\n' +
        "    }),\n" +
        "  ]);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-race/index.ts",
      why: "DECLARED DISTINCTION — a timeout-REJECT race wires reject and passes an ARROW (not the bare resolve) to setTimeout; it is not a sleep and has no node:timers/promises drop-in",
    },
    {
      files: "export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
      at: "packages/client/src/features/auth/lib/route-guards.ts",
      why: "DECLARED LIMIT (client/ui carve-out) — route-guards.ts's browser sleep; node:timers/promises does not exist in a browser bundle (§4.1), so this exact sleep MUST pass under packages/client",
    },
    {
      files: 'import { setTimeout } from "node:timers/promises";\nexport const nap = (ms: number): Promise<void> => setTimeout(ms);\n',
      at: "packages/server/src/domain/probe-ok-sleep/index.ts",
      why: "ARM SLEEP's remedy — the node:timers/promises call; a bare setTimeout(ms) is not a `new Promise`, so it never matches",
    },
    {
      files:
        "export function once(url: string): Promise<Response> {\n" +
        "  return new Promise((resolve, reject) => {\n" +
        "    fetch(url).then(resolve, reject);\n" +
        "  });\n" +
        "}\n",
      at: "packages/server/src/domain/probe-normal-promise/index.ts",
      why: "a NORMAL Promise executor — it CALLS resolve/reject; the SLEEP arm keys on a setTimeout(resolve, …), which is absent here, so it passes",
    },
    {
      files: "export const remedy = (s: string): string => RegExp.escape(s);\n",
      at: "packages/server/src/kit/probe-ok-escape/index.ts",
      why: "ARM ESCAPE-MINT's remedy — the platform RegExp.escape; the binding is not named escapeRegExp/escapeRegex",
    },
    {
      files: "export const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;\nexport const DICE = /^(\\d*)d(\\d+)([+-]\\d+)?$/iu;\n",
      at: "packages/server/src/kit/probe-complex-regex/index.ts",
      why: "DECLARED LIMIT / REGRESSION FENCE — the exact class of regexes the REMOVED char-class heuristic false-flagged (a color validator + dice notation, each enumerating ≥8 metacharacters). The name-only ESCAPE arm never touches regex literals, so these must pass; this row pins that the 27-false-positive heuristic stays gone",
    },
    {
      files:
        'import { setTimeout } from "node:timers/promises";\n' +
        "export function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (v: T) => void } {\n" +
        "  const { promise, resolve } = Promise.withResolvers<T>();\n" +
        "  void setTimeout(1);\n" +
        "  return { promise, resolve };\n" +
        "}\n",
      at: "packages/server/src/domain/probe-ok-deferred/index.ts",
      why: "ARM DEFERRED's remedy — `Promise.withResolvers()` is not a `new Promise`, so the arm can never match its own fix",
    },
    {
      files:
        "export function local(): Promise<void> {\n" +
        "  return new Promise<void>((resolve) => {\n" +
        "    let inner: () => void = (): void => undefined;\n" +
        "    inner = resolve;\n" +
        "    inner();\n" +
        "  });\n" +
        "}\n",
      at: "packages/server/src/domain/probe-deferred-local/index.ts",
      why: "DECLARED DISTINCTION — the assignment TARGET is declared INSIDE the executor, so the resolver never outlives it. That is a local shuffle, not a deferred promise, and `withResolvers` is not its fix",
    },
    {
      files:
        "export function counts(m: ReadonlyMap<string, number>): readonly [string, number][] {\n" +
        "  return [...m.entries()].sort((a, b) => b[1] - a[1]);\n" +
        "}\n" +
        "export function unique(xs: readonly string[]): readonly string[] {\n" +
        "  return [...new Set(xs)].sort((a, b) => b.length - a.length);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-spread-keep/index.ts",
      why: "ARM SPREAD-SORT's DECLARED SPLIT — an iterator/Set materialization MUST keep its spread (in-place `.sort` on the fresh array is correct; `toSorted` there is a wasted second copy). These are the 13 packages/** sites W4.2 deliberately did NOT convert",
    },
    {
      files:
        "export function seen(): readonly string[] {\n" +
        "  const bucket = new Set<string>();\n" +
        '  bucket.add("a");\n' +
        "  return [...bucket].sort((a, b) => a.length - b.length);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-spread-set-ident/index.ts",
      why: "ARM SPREAD-SORT precision — a BARE IDENTIFIER holding a Set. The arm resolves the declaration and finds `new Set(…)`, not an array proof, so it stays silent: an identifier spread is never flagged on sight",
    },
    {
      files:
        'import type { EmbedResponse } from "@orb/contracts/embeddings";\n' +
        "export function ordered(response: EmbedResponse): readonly { readonly index?: number }[] {\n" +
        "  return [...response.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));\n" +
        "}\n",
      at: "packages/server/src/domain/probe-spread-crossfile/index.ts",
      why: "DECLARED LIMIT (the harness is PURE-AST — see the header) — a property of a CROSS-PACKAGE type cannot be proven an array without the checker, so this real converted site (openrouter embed/image runners) is UNREACHABLE and passes. Same class: a query `.data`, a `for`-of tuple destructure, a contextually-typed callback param, an awaited port read. A checker-backed arm belongs at push tier",
    },
    {
      files:
        "type Row = { readonly rank: number };\n" +
        "export function order(rows: readonly Row[]): readonly Row[] {\n" +
        "  return rows.toSorted((a, b) => a.rank - b.rank);\n" +
        "}\n",
      at: "packages/server/src/domain/probe-ok-sorted/index.ts",
      why: "ARM SPREAD-SORT's remedy — `toSorted` has no `[...]` receiver, so the arm can never match its own fix",
    },
  ],
};
