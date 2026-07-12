// Gate: zustand-selector-derived (docs/architecture/core/UI-Lib-Zustand.md §A "Selectors + equality" +
// §C-1 + UI-Gates-and-Lessons.md §7 "Zustand × React" + §8 PARKED "the zustand-selector gate" + §11.5
// "extend the selector gate to ALL keyed stores") — Zustand v5 dropped v4's implicit shallow equality
// (default is `Object.is`), so a selector that DERIVES a fresh object/array every render
// (`(s) => ({a,b})`, `(s) => [a,b]`, `Object.keys/values/entries(s)`, a rebuilt `.map()`/`.filter()`
// array) spins `useSyncExternalStore` forever unless the call site wraps it in `useShallow(...)`. This
// is RUNTIME-only — no compile signal — which is why it needs a gate, not just a lint of style.
//
// This is the Layer-3 (structural, ts-morph) HALF of the two-layer belt: `tools/grit/
// zustand-selector-stability.grit` (Layer 2, biome-wired) already flags the narrow "arrow concise-body
// IS an object/array literal" shape. This gate reasons over the FULL selector body — block-bodied
// `return`s, either branch of a `? :`/`??`/`||`/`&&`, and the `Object.keys/values/entries(...)` +
// array-rebuilding-method (`.map/.filter/.flatMap/.slice/.concat/.toSorted/.toReversed/.toSpliced`)
// shapes a Grit AST pattern can't express — the §11.5 "extend to ALL keyed stores" ask. It also covers
// the SECOND call shape the codebase uses: `useStore(vanillaStore, selector)` (`zustand/react`, the
// door `createEntityDraftStore`'s `useDraft`/`useHasDraft` read through), not just `use<X>Store(selector)`.
//
// FLAGS: a call to a Zustand selector-accepting hook —
//   • `use<X>Store(selector)` — the hook-shaped stores (`createGatedStore`/`createPersistedStore`)
//   • `useStore(store, selector)` — the vanilla-store adapter (`zustand/react`)
// — whose selector argument is an INLINE arrow/function expression that returns (directly, from a
// block body, or from either reachable branch of a `?:`/`??`/`||`/`&&`) a fresh object/array literal,
// an `Object.keys/values/entries(...)` call, or an array-rebuilding method call — UNLESS the selector
// argument is wrapped in `useShallow(...)` (the sanctioned escape).
//
// Does NOT flag: a single-field selector (`(s) => s.field`); a selector returning an identifier (a
// frozen module constant, e.g. `IDLE_TURN`/`EMPTY`, or any other stable reference); an already-
// `useShallow`-wrapped selector (either call shape); an INDIRECT selector passed by reference (a named
// function declared elsewhere) — tracing that requires cross-scope resolution this AST-only gate
// doesn't attempt (the same scope limit `state-files.ts`'s literal-only scan documents).
import type { ArrowFunction, FunctionExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

// The flat + nested client tier — this footgun can occur anywhere a store hook is called, not just
// inside state/ (a props-seeded context store per UI-Lib-Zustand.md §A "initialize-with-props" could
// live under features/**/hooks/ too).
const CLIENT_SRC_DIR = "/packages/client/src/";
const HOOK_STORE_RE = /^use[A-Z].*Store$/u;
const ARRAY_REBUILD_METHODS = new Set([
  "map",
  "filter",
  "flatMap",
  "slice",
  "concat",
  "toSorted",
  "toReversed",
  "toSpliced",
]);
const OBJECT_DERIVE_METHODS = new Set(["keys", "values", "entries"]);

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC_DIR);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC_DIR.length)}`;
}

// The leftmost identifier name of a CallExpression's callee — bare `foo(...)`, NOT `x.foo(...)` (a
// PropertyAccessExpression callee, e.g. `useXStore.getState()`/`.subscribe()`, returns undefined —
// those are snapshot/transient reads, not the `useSyncExternalStore` render path this gate guards).
function calleeIdentifierText(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  return Node.isIdentifier(callee) ? callee.getText() : undefined;
}

// The selector-argument node of a recognized store-hook call, or undefined if `call` isn't one:
// `use<X>Store(selector)` (arg 0) or `useStore(store, selector)` (arg 1, the vanilla adapter).
function selectorArgOf(call: Node): Node | undefined {
  const name = calleeIdentifierText(call);
  if (name === undefined || !Node.isCallExpression(call)) {
    return;
  }
  const args = call.getArguments();
  if (HOOK_STORE_RE.test(name)) {
    return args[0];
  }
  return name === "useStore" ? args[1] : undefined;
}

// An inline arrow/function expression — the only selector shape this AST-only gate can analyze
// (an indirect by-reference selector is out of scope, see header).
function isInlineFunction(n: Node): n is ArrowFunction | FunctionExpression {
  return Node.isArrowFunction(n) || Node.isFunctionExpression(n);
}

// The enclosing function-like ancestor of `node` — used to keep a nested function's own `return`s
// (e.g. a helper declared inside the selector body) from being misread as the selector's output.
function isFunctionLike(n: Node): boolean {
  return isInlineFunction(n) || Node.isFunctionDeclaration(n);
}

function enclosingFunctionLike(n: Node): Node | undefined {
  let cur = n.getParent();
  while (cur !== undefined && !isFunctionLike(cur)) {
    cur = cur.getParent();
  }
  return cur;
}

// Every expression `fn` can hand back to its caller: the concise-body expression itself (arrow-only),
// or every `return <expr>` belonging DIRECTLY to `fn`'s block body (not a nested function's).
function collectReturnedExpressions(fn: Node, out: Node[]): void {
  if (!isInlineFunction(fn)) {
    return;
  }
  const body = fn.getBody();
  if (!Node.isBlock(body)) {
    out.push(body); // concise body: `(s) => expr` (possibly parenthesized, e.g. `(s) => ({...})`).
    return;
  }
  for (const ret of body.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    if (enclosingFunctionLike(ret) !== fn) {
      continue;
    }
    const expr = ret.getExpression();
    if (expr !== undefined) {
      out.push(expr);
    }
  }
}

// Strip `as`/`satisfies`/parens so the underlying literal/call is reachable (mirrors
// diagnostic-legibility.ts's `unwrap`).
function unwrap(node: Node): Node {
  let n = node;
  while (
    Node.isAsExpression(n) ||
    Node.isSatisfiesExpression(n) ||
    Node.isParenthesizedExpression(n)
  ) {
    n = n.getExpression();
  }
  return n;
}

// Is `call` an `Object.keys/values/entries(...)` derivation, or an array-rebuilding method call
// (`.map/.filter/...`)? Both mint a brand-new object/array reference every invocation.
function calleeDerivationKind(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const receiver = callee.getExpression();
  const name = callee.getName();
  if (
    Node.isIdentifier(receiver) &&
    receiver.getText() === "Object" &&
    OBJECT_DERIVE_METHODS.has(name)
  ) {
    return `Object.${name}(...) derivation`;
  }
  return ARRAY_REBUILD_METHODS.has(name) ? `array-rebuilding .${name}(...) call` : undefined;
}

// Does `expr` (or a branch it can resolve to) mint a fresh object/array reference? Recurses into
// `?:`/`??`/`||`/`&&` so a stable-default branch (`x ?? EMPTY`) can't mask a fresh-literal branch on
// the other side, and vice versa — either reachable branch being fresh is enough to flag the call.
function freshDerivationKind(raw: Node): string | undefined {
  const expr = unwrap(raw);
  if (Node.isObjectLiteralExpression(expr)) {
    return "object literal";
  }
  if (Node.isArrayLiteralExpression(expr)) {
    return "array literal";
  }
  if (Node.isConditionalExpression(expr)) {
    return freshDerivationKind(expr.getWhenTrue()) ?? freshDerivationKind(expr.getWhenFalse());
  }
  if (Node.isBinaryExpression(expr)) {
    const op = expr.getOperatorToken().getText();
    return op === "??" || op === "||" || op === "&&"
      ? (freshDerivationKind(expr.getLeft()) ?? freshDerivationKind(expr.getRight()))
      : undefined;
  }
  return Node.isCallExpression(expr) ? calleeDerivationKind(expr) : undefined;
}

function scanFile(sf: SourceFile, rel: string, out: Violation[]): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const arg = selectorArgOf(call);
    if (arg === undefined) {
      continue;
    }
    if (Node.isCallExpression(arg) && calleeIdentifierText(arg) === "useShallow") {
      continue; // the sanctioned wrap — memoizes the derived output via a shallow compare.
    }
    if (!isInlineFunction(arg)) {
      continue; // an indirect (by-reference) selector — out of this AST-only gate's reach.
    }
    const returned: Node[] = [];
    collectReturnedExpressions(arg, returned);
    for (const expr of returned) {
      const kind = freshDerivationKind(expr);
      if (kind === undefined) {
        continue;
      }
      out.push({
        file: rel,
        line: expr.getStartLineNumber(),
        message:
          `zustand selector returns a fresh ${kind} — under v5's Object.is default (no implicit ` +
          "shallow compare) this spins useSyncExternalStore forever. Wrap the selector in " +
          "useShallow(...), narrow it to a single field, or return a frozen module constant " +
          "(UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5).",
      });
      break; // one diagnostic per call site is enough signal.
    }
  }
}

export const zustandSelectorDerived: Check = {
  name: "zustand-selector-derived",
  run: ({ project }): Violation[] => {
    const out: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = clientRel(sf.getFilePath());
      if (rel !== undefined) {
        scanFile(sf, rel, out);
      }
    }
    return out;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The legacy predicate as a CallExpression subscription: a store-hook call whose inline selector returns
// a fresh object/array (directly, from a block return, or from a ?:/??/||/&& branch), an Object.keys/
// values/entries, or an array-rebuilding method — unless useShallow-wrapped. scanRoot mirrors the legacy
// clientRel filter. ONE finding per call site (the legacy `break`); the derivation kind rides the finding
// as its token, so the grouped output shows what each site returned. Kept ALONGSIDE the legacy Check.
const ZUSTAND_MESSAGE =
  "zustand selector returns a fresh object/array (or an Object.keys/values/entries / array-rebuilding derivation) — under v5's Object.is default (no implicit shallow compare) this spins useSyncExternalStore forever. Wrap the selector in useShallow(...), narrow it to a single field, or return a frozen module constant (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5).";

/** The fresh-derivation kind of a store-hook call's selector, or undefined if the call is clean / not a
 *  recognized store hook / useShallow-wrapped / an indirect selector (the legacy scanFile predicate,
 *  returning the first fresh-returned-expression's kind). */
function callDerivationKind(call: Node): string | undefined {
  const arg = selectorArgOf(call);
  if (arg === undefined) {
    return;
  }
  if (Node.isCallExpression(arg) && calleeIdentifierText(arg) === "useShallow") {
    return;
  }
  if (!isInlineFunction(arg)) {
    return;
  }
  const returned: Node[] = [];
  collectReturnedExpressions(arg, returned);
  // First fresh-returned-expression's kind (the legacy scanFile's break-on-first). As a trailing return
  // EXPRESSION so no path falls off the end (tsc noImplicitReturns) — mirrors clientRel's shape.
  return returned.map((expr) => freshDerivationKind(expr)).find((kind) => kind !== undefined);
}

export const gate: GateDescriptor = {
  name: "zustand-selector-derived",
  docRow: "UI-Lib-Zustand.md §A/§C-1 (UI-Gates-and-Lessons.md §7/§11.5)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: ZUSTAND_MESSAGE,
  fix: "wrap the selector in useShallow(...), narrow it to a single field, or return a frozen module constant.",
  scanRoot: (p) => p.includes("packages/client/src/"),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    const kind = callDerivationKind(node);
    if (kind !== undefined) {
      ctx.report(node, { token: `fresh ${kind}`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      at: "packages/client/src/state/x.ts",
      why: "a selector returning a fresh object literal — the v5 Object.is footgun",
    },
    {
      files:
        "declare const useXStore: (sel: (s: { items: readonly number[] | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items ?? []);\n",
      at: "packages/client/src/state/y.ts",
      why: "the fresh branch on the far side of a ?? — the stable-default branch alone can't mask it",
    },
  ],
  mustPass: [
    {
      files:
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.a);\n",
      at: "packages/client/src/state/ok.ts",
      why: "a single-field selector passes — it returns a stable primitive, no fresh reference",
    },
    {
      files:
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const useShallow: <T>(s: T) => T;\nexport const v = useXStore(useShallow((s) => ({ a: s.a, b: s.b })));\n",
      at: "packages/client/src/state/wrapped.ts",
      why: "a useShallow-wrapped selector is the sanctioned escape — memoizes the derived output",
    },
  ],
};
