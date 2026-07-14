// Gate: zustand-selector-derived (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5) —
// Zustand v5 dropped v4's implicit shallow equality (`Object.is`), so a selector that DERIVES a fresh
// object/array every render spins `useSyncExternalStore` forever unless wrapped in `useShallow(...)`.
// RUNTIME-only, no compile signal — hence a gate. The ts-morph half of the two-layer belt (`tools/grit/
// zustand-selector-stability.grit` catches the narrow concise-arrow-body case); reasons over the full selector body across both call shapes.
import type { ArrowFunction, FunctionExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

// The flat + nested client tier — this footgun can occur anywhere a store hook is called, not just
// inside state/ (a props-seeded context store per UI-Lib-Zustand.md §A "initialize-with-props" could
// live under features/**/hooks/ too).
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

// A store-hook call whose inline selector returns a fresh object/array (directly, from a block return, or
// from a ?:/??/||/&& branch), an Object.keys/values/entries, or an array-rebuilding method — unless
// useShallow-wrapped. ONE finding per call site; the derivation kind rides as its token.
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
    {
      files:
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => [s.a, s.b]);\n",
      at: "packages/client/src/state/arr.ts",
      why: "a selector returning a fresh array literal — the v5 Object.is footgun",
    },
    {
      files:
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  return { a: s.a };\n});\n",
      at: "packages/client/src/state/block.ts",
      why: "a block-bodied selector that returns a fresh object literal — reasoned over the full body",
    },
    {
      files: {
        "packages/client/src/state/keys.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const k = useXStore((s) => Object.keys(s.m));\n",
        "packages/client/src/state/values.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const vals = useXStore((s) => Object.values(s.m));\n",
        "packages/client/src/state/entries.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const e = useXStore((s) => Object.entries(s.m));\n",
      },
      expect: { count: 3 },
      why: "Object.keys/values/entries derivations each mint a fresh reference — three findings",
    },
    {
      files:
        "declare const useXStore: (sel: (s: { items: readonly number[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.map((n) => n * 2));\n",
      at: "packages/client/src/state/map.ts",
      why: "an array-rebuilding .map() call mints a fresh array every invocation — flags",
    },
    {
      files:
        "declare const useStore: (store: unknown, sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, (s) => ({ a: s.a, b: s.b }));\n",
      at: "packages/client/src/state/vanilla.ts",
      why: "the vanilla useStore(store, selector) call shape (the createEntityDraftStore adapter) — flags",
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
    {
      files:
        "const EMPTY = Object.freeze({});\ndeclare const useXStore: (sel: (s: { m: Record<string, number> | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.m ?? EMPTY);\n",
      at: "packages/client/src/state/frozen.ts",
      why: "a selector returning a frozen module constant (identifier, not a fresh literal) — passes",
    },
    {
      files:
        "declare const useStore: (store: unknown, sel: unknown) => unknown;\ndeclare const useShallow: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, useShallow((s) => ({ a: s.a, b: s.b })));\n",
      at: "packages/client/src/state/wrapped-vanilla.ts",
      why: "a useShallow-wrapped selector in the vanilla useStore(store, selector) call shape — passes",
    },
    {
      files:
        "const IDLE = { phase: 'idle' } as const;\ndeclare const useXStore: (sel: (s: { id: string | null; turns: Record<string, unknown> }) => unknown) => unknown;\nexport const v = useXStore((s) => (s.id === null ? IDLE : (s.turns[s.id] ?? IDLE)));\n",
      at: "packages/client/src/state/stable-ternary.ts",
      why: "a ternary whose branches are both stable references (no fresh literal on either side) — passes",
    },
    {
      files:
        "declare const useMemo: (fn: () => unknown, deps: unknown[]) => unknown;\nexport const v = useMemo(() => ({ a: 1 }), []);\n",
      at: "packages/client/src/state/non-store.ts",
      why: "a non-store call (callee doesn't match use<X>Store / useStore) is out of scope — passes",
    },
    {
      files:
        "function selectAB(s: { a: number; b: number }) {\n  return { a: s.a, b: s.b };\n}\ndeclare const useXStore: (sel: typeof selectAB) => unknown;\nexport const v = useXStore(selectAB);\n",
      at: "packages/client/src/state/by-ref.ts",
      why: "an indirect (by-reference) selector is out of this AST-only gate's reach — passes",
    },
    {
      files:
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      at: "packages/server/src/domain/x/verbs/act.ts",
      why: "scope: non-client files are not scanned — only packages/client/src, passes",
    },
  ],
};
