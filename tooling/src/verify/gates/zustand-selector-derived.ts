// Zustand v5 dropped v4's implicit shallow equality, so a selector that DERIVES a fresh object/array
// every render never satisfies `Object.is` and spins `useSyncExternalStore` forever unless the selector is
// wrapped in `useShallow(...)`. RUNTIME-only, no compile signal — hence a policy
// (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5).
//
// THE DEEP HALF OF A TWO-LAYER BELT. `zustand-selector-stability` judges the NARROW case — a concise arrow
// body that IS an object/array literal — through the store hook's resolved TYPE. This policy judges the
// full selector OUTPUT SET: the concise body, every `return` belonging directly to a BLOCK body, and both
// branches of a `?:` / `??` / `||` / `&&`, and it counts three derivation shapes rather than one
// (fresh literal · `Object.keys/values/entries(...)` · an array-rebuilding `.map/.filter/...`).
//
// FAMILY: a declared SINGLETON under its own id, and the reason is the SUBJECT reader, not the topic.
// The sibling's subject is the callee's resolved TYPE identity (`GatedStoreHook` / zustand's
// `UseBoundStore`). This policy's subject is the callee's TEXT — `/^use[A-Z].*Store$/` plus the vanilla
// adapter shape `useStore(store, selector)` — which the type reader cannot express, because zustand's
// `useStore` is a plain function whose type is not a bound-hook alias. Neither subject reader subsumes the
// other and they share no `lib/` computation, so per §5b.4 a shared topic is not a family.
//
// THE OVERLAP IS DELIBERATE AND PRE-EXISTING. A `use<X>Store((s) => ({ … }))` whose callee also resolves to
// a store-hook type is reported by BOTH policies, exactly as the legacy descriptor and the converted
// sibling already did on every real-tree run. Narrowing either side to de-duplicate would delete a catch:
// the sibling sees a store hook this one cannot name, and this one sees a body shape the sibling cannot
// read. THE MERGE CANDIDACY IS REAL AND IS NOT THIS MODULE'S TO TAKE (§8.3): one policy carrying the
// sibling's type subject AND this policy's output-set reader would subsume both, which means RETIRING a
// converted module with a successor proof — an orchestrator call, raised on #1584 at conversion time.
//
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.includes("packages/client/src/")` is exactly
// the `@client` root (`packages/client/src/`); no path on the tree contains that segment without being
// under it. No `notNamed` fence is added — client tests are central (`tests/client/**`), so `@client`
// admits no spec file and a subtraction would be a fence guarding nothing.
//
// MARKER CENSUS: ZERO. `git grep '@orb-gate-ignore zustand-selector-derived'` over the whole tree returns
// no line at the pre-conversion SHA, so no legacy marker was translated, dropped, or dead-lettered.
//
// LEGACY SHA: 68c8f42d6 (`tooling/src/verify/gates/zustand-selector-derived.ts`, the last commit carrying
// the `GateDescriptor` form).
//
// §4.1 NARROWING MATRIX, measured 2026-09-12 by cutting each fence OPEN (the direction that makes the
// policy flag MORE) in a scratch copy and re-running this module's own rows:
//   name fence `/^use[A-Z].*Store$/`      → RED ×4 (the non-store row, the vanilla mustFlag, both escapes)
//   identifier-callee fence               → RED ×1 (the member-callee row)
//   return-ownership (nearest fn-like)    → RED ×1 (the nested-helper row)
//   ARRAY_REBUILD_METHODS membership      → RED ×2 (the `.join` row + the `Object.freeze` row)
//   OBJECT_DERIVE_METHODS membership      → RED ×1 (the `Object.freeze` row)
//   PASSTHROUGH_OPERATORS membership      → RED ×1 (the string-concat row)
//   population `@client`                  → RED ×1 (the `@server` row, which carries an in-population anchor)
//   `useShallow` early return             → CLEAN — DEAD CODE, retired in this conversion (see `candidateOf`)
//   `isInlineFunction`                    → NOT A NARROWING: cutting it tool-errors, never flags more
//
// THE REPORTED POSITION MOVED, DELIBERATELY, AND IT HAD TO. The legacy finding's token was the derivation
// kind (`fresh Object.keys(...) derivation`), which the central marker grammar's position group
// `[^()\r\n]+` can NEVER parse and which `locateFinding` would refuse anyway — it is not authored text at
// the finding's own line and column. The position is now the STORE HOOK NAME the call is made on, which is
// authored, stable, unique per call site, and the same position the sibling policy uses. The derivation
// kind rides the MESSAGE instead, where a paren is legal.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `zustand-selector-derived` descriptor at 2eaae72bbfb355e1f7cc84291433983e48557177, the parent of the conversion
// `e81ca1979` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `68c8f42d6`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,433 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,319 and final `population` admits 1,319.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { ArrowFunction, CallExpression, FunctionExpression, Node as MorphNode, ReturnStatement } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

/** The store-hook naming convention this policy's subject is. A props-seeded context store can be called
 *  anywhere under `@client`, not only from `state/`, so the population is the whole client tier. */
const HOOK_STORE_RE = /^use[A-Z].*Store$/u;
/** The vanilla adapter: `useStore(store, selector)` takes its selector SECOND. */
const VANILLA_HOOK = "useStore";
const ARRAY_REBUILD_METHODS: ReadonlySet<string> = new Set(["map", "filter", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"]);
const OBJECT_DERIVE_METHODS: ReadonlySet<string> = new Set(["keys", "values", "entries"]);
const OBJECT_GLOBAL = "Object";
/** The only binary operators whose VALUE is one of their operands. `a + b`, `a * b` and every comparison
 *  produce a primitive, so an object/array literal appearing inside one is incidental, not the output. */
const PASSTHROUGH_OPERATORS: ReadonlySet<string> = new Set(["??", "||", "&&"]);

const MESSAGE =
  "zustand selector returns a fresh object/array (or an Object.keys/values/entries / array-rebuilding derivation) — under v5's Object.is default (no implicit shallow compare) this spins useSyncExternalStore forever. Wrap the selector in useShallow(...), narrow it to a single field, or return a frozen module constant (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5).";

type InlineFunction = ArrowFunction | FunctionExpression;

/** An inline arrow/function expression — the only selector shape an AST-only reader can analyze. */
function isInlineFunction(node: MorphNode | undefined): node is InlineFunction {
  return node !== undefined && (Node.isArrowFunction(node) || Node.isFunctionExpression(node));
}

function isFunctionLike(node: MorphNode): boolean {
  return isInlineFunction(node) || Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node);
}

/** The enclosing function-like ancestor — an ANCESTOR walk, which §12.3 sanctions, never a descendant one.
 *  Keeps a helper declared INSIDE the selector body from having its own `return`s read as the selector's. */
function enclosingFunctionLike(node: MorphNode): MorphNode | undefined {
  let current = node.getParent();
  while (current !== undefined && !isFunctionLike(current)) {
    current = current.getParent();
  }
  return current;
}

/** The leftmost identifier name of a call's callee — bare `foo(...)`, NEVER `x.foo(...)`. A
 *  PropertyAccessExpression callee is a snapshot/transient read (`useXStore.getState()`,
 *  `useXStore.subscribe()`), not the `useSyncExternalStore` render path this policy guards. */
function calleeIdentifierText(call: CallExpression): string | undefined {
  const callee = call.getExpression();
  return Node.isIdentifier(callee) ? callee.getText() : undefined;
}

interface Candidate {
  readonly call: CallExpression;
  readonly hook: string;
  readonly selector: InlineFunction;
}

/** The SELECTOR argument of a recognized store-hook call: argument 0 of `use<X>Store(selector)`, argument
 *  1 of the vanilla `useStore(store, selector)`. Undefined when the callee is not a recognized hook. */
function selectorArgumentOf(call: CallExpression, hook: string): MorphNode | undefined {
  const args = call.getArguments();
  if (HOOK_STORE_RE.test(hook)) {
    return args[0];
  }
  return hook === VANILLA_HOOK ? args[1] : undefined;
}

/** A recognized store-hook call whose selector is an INLINE function.
 *
 *  THE `useShallow` ESCAPE NEEDS NO CLAUSE OF ITS OWN, AND THE LEGACY DESCRIPTOR'S WAS DEAD CODE
 *  (measured 2026-09-12 by the §4.1 cut, which came back CLEAN). `useShallow(selector)` is a
 *  CallExpression, so the inline-function test below already rejects it; the legacy explicit
 *  `calleeIdentifierText(arg) === "useShallow"` early return sat AHEAD of that test and could never be
 *  the deciding clause. Cutting it changed no row, and cutting it TOGETHER with the inline-function guard
 *  produced a TOOL ERROR rather than findings — the mutual-redundancy shape §4.1 names. The sanctioned
 *  escape still passes, and the two `useShallow` mustPass rows now state the mechanism that passes it.
 *
 *  `isInlineFunction` IS NOT A NARROWING and no cut can falsify it: it is the TYPE OBLIGATION that makes
 *  `selector.getBody()` expressible at all. Removing it makes the pass throw "selector.getBody is not a
 *  function", which is a tool error, never a finding — so the by-reference row records a DECLARED LIMIT
 *  rather than pretending to pin a fence. */
function candidateOf(call: CallExpression): Candidate | undefined {
  const hook = calleeIdentifierText(call);
  if (hook === undefined) {
    return;
  }
  const argument = selectorArgumentOf(call, hook);
  return isInlineFunction(argument) ? { call, hook, selector: argument } : undefined;
}

/** Is `call` an `Object.keys/values/entries(...)` derivation, or an array-rebuilding method call? Both
 *  mint a brand-new reference every invocation. */
function calleeDerivationKind(call: CallExpression): string | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const receiver = callee.getExpression();
  const name = callee.getName();
  if (Node.isIdentifier(receiver) && receiver.getText() === OBJECT_GLOBAL && OBJECT_DERIVE_METHODS.has(name)) {
    return `Object.${name}(...) derivation`;
  }
  return ARRAY_REBUILD_METHODS.has(name) ? `array-rebuilding .${name}(...) call` : undefined;
}

/** Does `raw` (or a branch it can resolve to) mint a fresh object/array reference? Recurses into `?:` and
 *  the three PASSTHROUGH operators so a stable-default branch (`x ?? EMPTY`) cannot mask a fresh-literal
 *  branch on the other side, and vice versa — either reachable branch being fresh is enough. */
function freshDerivationKind(raw: MorphNode): string | undefined {
  const expr = unwrapExpression(raw);
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
    return PASSTHROUGH_OPERATORS.has(expr.getOperatorToken().getText())
      ? (freshDerivationKind(expr.getLeft()) ?? freshDerivationKind(expr.getRight()))
      : undefined;
  }
  return Node.isCallExpression(expr) ? calleeDerivationKind(expr) : undefined;
}

/** Every expression a candidate selector's BLOCK body hands back, keyed by the selector's compiler node.
 *  A `return` whose nearest function-like ancestor is a helper declared inside the selector belongs to
 *  that helper, never to the selector. */
function returnedBySelector(candidates: readonly Candidate[], returns: readonly ReturnStatement[]): ReadonlyMap<object, readonly MorphNode[]> {
  const owned = new Map<object, MorphNode[]>(candidates.map((candidate) => [candidate.selector.compilerNode, []]));
  for (const statement of returns) {
    const owner = enclosingFunctionLike(statement);
    const bucket = owner === undefined ? undefined : owned.get(owner.compilerNode);
    const expression = statement.getExpression();
    if (bucket !== undefined && expression !== undefined) {
      bucket.push(expression);
    }
  }
  return owned;
}

/** The selector's output set: the concise body expression, or every `return` this selector owns. */
function outputsOf(selector: InlineFunction, owned: ReadonlyMap<object, readonly MorphNode[]>): readonly MorphNode[] {
  const body = selector.getBody();
  return Node.isBlock(body) ? (owned.get(selector.compilerNode) ?? []) : [body];
}

export const gate = defineGate({
  id: "zustand-selector-derived",
  family: "zustand-selector-derived",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "wrap the selector in useShallow(...), narrow it to a single field, or return a frozen module constant. A deliberate fresh derivation waives that occurrence with `@orb-waive zustand-selector-derived(<hook>): <reason + end condition>`, where `<hook>` is the STORE HOOK NAME the call is made on (`useUserStore`, or `useStore` for the vanilla adapter) — the report anchors on the call and its token is the callee identifier, never the selector parameter and never the derivation the message names.",
  create: (ctx) => {
    const candidates: Candidate[] = [];
    const returns: ReturnStatement[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const candidate = candidateOf(node);
            if (candidate !== undefined) {
              candidates.push(candidate);
            }
          },
        },
        {
          // The BLOCK-BODY half, inverted. The legacy reader called `getDescendantsOfKind(ReturnStatement)`
          // on each selector body; the one kind-indexed walk delivers every `return` instead, and the
          // ancestor test below decides which selector owns it.
          kinds: [SyntaxKind.ReturnStatement],
          visit: (node): void => {
            if (Node.isReturnStatement(node)) {
              returns.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        const owned = returnedBySelector(candidates, returns);
        for (const { call, hook, selector } of candidates) {
          // ONE finding per call site — the FIRST fresh output's kind, which is the legacy reader's
          // break-on-first. Two fresh returns in one selector are one defect with one fix.
          const kind = outputsOf(selector, owned)
            .map((output) => freshDerivationKind(output))
            .find((found) => found !== undefined);
          if (kind !== undefined) {
            ctx.report.node(call, { message: `${MESSAGE} DERIVATION: ${kind}.`, token: hook, offset: 0 });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/state/x.ts":
          "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      },
      expect: { count: 1, token: "useXStore", messageIncludes: "DERIVATION: object literal." },
      why: "THE FOUNDING SHAPE — a selector returning a fresh object literal, the v5 Object.is footgun. The token pins the position move: the legacy finding carried `fresh object literal`, which the marker grammar cannot parse",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/y.ts":
          "declare const useXStore: (sel: (s: { items: readonly number[] | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items ?? []);\n",
      },
      expect: { count: 1, messageIncludes: "DERIVATION: array literal." },
      why: "THE FRESH BRANCH ON THE FAR SIDE OF A `??` — the stable-default branch alone cannot mask it, so both operands of a passthrough operator are read",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/arr.ts":
          "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => [s.a, s.b]);\n",
      },
      expect: { count: 1, messageIncludes: "DERIVATION: array literal." },
      why: "a selector returning a fresh ARRAY literal is the same fresh reference — both literal kinds, kept from the legacy proof",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/block.ts":
          "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  return { a: s.a };\n});\n",
      },
      expect: { count: 1, line: 2, messageIncludes: "DERIVATION: object literal." },
      why: "THE BLOCK-BODY REACH — a `return` belonging directly to the selector's block body is read, which is the shape the narrow sibling `zustand-selector-stability` structurally cannot see",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/keys.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const k = useXStore((s) => Object.keys(s.m));\n",
        "packages/client/src/state/values.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const vals = useXStore((s) => Object.values(s.m));\n",
        "packages/client/src/state/entries.ts":
          "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const e = useXStore((s) => Object.entries(s.m));\n",
      },
      expect: { count: 3, messageIncludes: "DERIVATION: Object." },
      why: "all three `Object.keys/values/entries` derivations mint a fresh reference — three files, three findings, one per call site",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/map.ts":
          "declare const useXStore: (sel: (s: { items: readonly number[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.map((n) => n * 2));\n",
      },
      expect: { count: 1, messageIncludes: "DERIVATION: array-rebuilding .map(...) call." },
      why: "an array-rebuilding `.map()` mints a fresh array every invocation. The DERIVATION clause is in the message rather than the token precisely because `array-rebuilding .map(...) call` contains parens and is therefore unwaivable as a position",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/vanilla.ts":
          "declare const useStore: (store: unknown, sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, (s) => ({ a: s.a, b: s.b }));\n",
      },
      expect: { count: 1, token: "useStore" },
      why: "THE VANILLA ADAPTER `useStore(store, selector)` (the createEntityDraftStore shape) — the selector is the SECOND argument, and the waiver position is `useStore` itself",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/as-wrapped.ts":
          "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a }) as { a: number });\n",
      },
      expect: { count: 1, messageIncludes: "DERIVATION: object literal." },
      why: "an `as`-wrapped literal is still a fresh reference. Cutting `unwrapExpression` makes the policy flag FEWER, not more, so §4.1's cut does not apply to it — this POSITIVE row is its enforcement instead",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/state/ok.ts":
          "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.a);\n",
      },
      why: "a single-field selector returns a stable primitive — the shape this policy exists to preserve",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/wrapped.ts":
          "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const useShallow: <T>(s: T) => T;\nexport const v = useXStore(useShallow((s) => ({ a: s.a, b: s.b })));\n",
      },
      why: "THE SANCTIONED ESCAPE PASSES — and the MECHANISM is the inline-function test, not a `useShallow` clause. `useShallow(selector)` is a CallExpression, so no inline function reaches the output reader. The legacy descriptor's explicit `useShallow` early return was DEAD CODE (its §4.1 cut came back clean and is retired in the conversion); this row is what keeps the escape honest",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/wrapped-vanilla.ts":
          "declare const useStore: (store: unknown, sel: unknown) => unknown;\ndeclare const useShallow: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, useShallow((s) => ({ a: s.a, b: s.b })));\n",
      },
      why: "the same escape in the VANILLA `useStore(store, selector)` shape — the second-argument reach is its own clause and owes its own row, because a reader that took argument 0 here would judge the STORE and pass everything",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/frozen.ts":
          "const EMPTY = Object.freeze({});\ndeclare const useXStore: (sel: (s: { m: Record<string, number> | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.m ?? EMPTY);\n",
      },
      why: "THE PRESCRIBED FIX: a frozen module constant is a stable reference. The selector body is judged AS AUTHORED — resolving `EMPTY` to its object literal would red the remedy the message names",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/stable-ternary.ts":
          "const IDLE = { phase: 'idle' } as const;\ndeclare const useXStore: (sel: (s: { id: string | null; turns: Record<string, unknown> }) => unknown) => unknown;\nexport const v = useXStore((s) => (s.id === null ? IDLE : (s.turns[s.id] ?? IDLE)));\n",
      },
      why: "a ternary whose branches are BOTH stable references passes — the branch recursion widens what is read, it does not assume a branch is fresh",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/non-store.ts":
          "declare const useMemo: (fn: () => unknown, deps: unknown[]) => unknown;\nexport const v = useMemo(() => ({ a: 1 }), []);\n",
      },
      why: "THE NAME NARROWING, pinned: `useMemo` matches neither `/^use[A-Z].*Store$/` nor `useStore`, and memoizing a fresh literal is the FIX this policy prescribes. Cutting `HOOK_STORE_RE` (admitting any single-argument call) turns this red. MEASURED: that cut reds FOUR rows — this one plus the vanilla mustFlag and both `useShallow` rows, because an unfenced name makes `useShallow(...)` and `useStore(store, …)` candidates in their own right",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/member-callee.ts":
          "declare const handle: { useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown; getState: () => { a: number } };\nexport const v = handle.useXStore((s) => ({ a: s.a, b: s.b }));\n",
      },
      why: "THE IDENTIFIER-CALLEE NARROWING, pinned: a PROPERTY-ACCESS callee is a snapshot/transient read (`useXStore.getState()`, `.subscribe()`), outside the useSyncExternalStore render path this policy guards. Cutting the `Node.isIdentifier(callee)` test in `calleeIdentifierText` (falling back to the member NAME) turns this red — the only row that dies without it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/nested-helper.ts":
          "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  const shape = () => {\n    return { a: s.a };\n  };\n  void shape;\n  return s.a;\n});\n",
      },
      why: "THE OWNERSHIP NARROWING, pinned: the fresh literal is returned by a HELPER declared inside the selector, not by the selector, so the selector's own output is the stable `s.a`. Cutting `enclosingFunctionLike(statement) === selector` (attributing every nested `return` to the selector) turns this red — the only row that dies without it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/join.ts":
          "declare const useXStore: (sel: (s: { items: readonly string[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.join(','));\n",
      },
      why: "THE ARRAY-REBUILD SET NARROWING, pinned: `.join()` returns a STRING — a primitive that compares by value under Object.is — so it is not in `ARRAY_REBUILD_METHODS`. Cutting the set membership test (admitting every method call) turns this red, together with the `Object.freeze` row below — those two and no others",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/object-freeze.ts":
          "const EMPTY: Record<string, number> = {};\ndeclare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const v = useXStore((s) => Object.freeze(EMPTY));\n",
      },
      why: "THE OBJECT-DERIVE SET NARROWING, pinned: `Object.freeze(x)` returns x — the SAME reference, not a derivation — so it is not in `OBJECT_DERIVE_METHODS`. Cutting the OBJECT_DERIVE membership test (admitting every `Object.*` call) turns this red and only this row. It is also the one row that dies under BOTH set cuts, because an unfenced ARRAY_REBUILD set catches `.freeze` on the fall-through",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/concat.ts":
          "declare const useXStore: (sel: (s: { label: string; a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.label + [s.a, s.b]);\n",
      },
      why: "THE PASSTHROUGH-OPERATOR NARROWING, pinned: `+` produces a STRING, so the array literal that is its DIRECT right operand never reaches Object.is as a reference. Cutting `PASSTHROUGH_OPERATORS` (recursing into every BinaryExpression) turns this red — the only row that dies without it. The first attempt at this row, `s.n * [1, 2].length`, was NOT discriminating and the cut came back clean: the array literal sat under a PropertyAccessExpression, which the reader never descends into, so the row measured the wrong thing",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/by-ref.ts":
          "function selectAB(s: { a: number; b: number }) {\n  return { a: s.a, b: s.b };\n}\ndeclare const useXStore: (sel: typeof selectAB) => unknown;\nexport const v = useXStore(selectAB);\n",
      },
      why: "DECLARED LIMIT: an indirect (by-reference) selector is out of this syntax-plane policy's reach. `isInlineFunction` is NOT a narrowing and no fixture can falsify it — it is the TYPE OBLIGATION behind `selector.getBody()`, and cutting it (measured) makes the pass raise `PASS TOOL ERROR [evaluate] selector.getBody is not a function` rather than produce a finding. A tool error is not a catch, so this row records the limit rather than pretending to pin a fence",
    },
    {
      mode: "source",
      files: {
        // The IN-POPULATION ANCHOR. Without it `@client` admits zero paths and the row comes back a
        // `[population]` TOOL ERROR rather than a pass, which is not the same claim at all.
        "packages/client/src/state/anchor.ts":
          "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const anchor = useXStore((s) => s.a);\n",
        "packages/server/src/domain/x/verbs/act.ts":
          "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      },
      why: 'THE POPULATION FENCE, pinned: mustFlag[0]\'s exact bytes under `@server` are not admitted. Deleting `population: "@client"` (widening to `@authored`) turns this red — the only row that dies without it',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/waived.ts":
          "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n// @orb-waive zustand-selector-derived(useXStore): the proof stand-in reason; ends when this fixture stops flagging.\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the CALL and its token is the callee identifier, so an author waives the STORE HOOK NAME `useXStore` — never the selector parameter `s`, never the derivation the message names. The fixture is mustFlag[0] plus the marker line, so exactly ONE occurrence exists for the one marker to consume",
    },
  ],
});
