// Policy: state-files (ui-architecture-state-and-stack.md §5, §2.1 `state/`) — the gated-Zustand discipline
// for `packages/client/src/state/*.ts` (the FLAT store tier, direct children only). Three arms:
// ONE-MINT-PER-FILE (a second store-minting call in one file is the grab-bag smell), the FIELD CAP (past
// 10 top-level fields a store is doing multiple jobs), and NO-EXPORTED-HANDLE (callers go through
// intent-named actions + narrow read hooks, never a raw `set`/`getState` handle across a module
// boundary). dep-cruiser cannot see call shape or object-literal arity; this policy can.
//
// FAMILY `state-files` — a declared SINGLETON. Re-derived 2026-09-12 across the whole gate corpus for
// the three literals this module owns (`createGatedStore`, `createEntityDraftStore`, and the flat
// `state/` tier): `persisted-store-registry` and `persist-partialize-and-total-migrate` judge the
// PERSISTENCE factories' registration and migration, never the mint ARITY or the handle EXPORT, and
// neither shares a reader with this one. The census proposed a "shared export/member fact"; the export
// question here is `VariableStatement#isExported()` on a declaration this file authored — authored
// syntax with no identity to resolve and no second consumer — so promoting it to `lib/` would be this
// gate's private reader wearing a shared reader's clothes (§11.5).
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was `flatStateRel("/" + p) !== undefined`,
// i.e. the path contains `/packages/client/src/state/`, the remainder has no further `/`, and it is not
// `index.ts`. `{ in: ["@client"], under: ["packages/client/src/state/*"], notNamed: ["index.ts"] }` is
// the same set: the single `*` does not cross a `/`, so it IS the flat-child test, and `notNamed`
// matches the basename. Deliberately NO `ext` filter — the legacy predicate admitted `.tsx` too, and
// eight provider modules live in that tier today (`section-registry-provider.tsx` and siblings), so an
// `ext: ["ts"]` "tidy-up" would silently narrow the policy off them.
//
// TWO INTENTIONAL CORRECTIONS, both forced by the ordinary-waiver contract rather than by taste:
//   1. EVERY exported handle is reported, not just the first. The legacy `exportedHandleLine` used
//      `.find()`, so a file leaking two handles produced ONE file-level finding and the second leak was
//      both invisible and unwaivable. `ordinary-waiver.ts` binds a marker to an exact POSITION, so
//      finding granularity must match waiver granularity or the door does not exist.
//   2. Every arm is NODE-anchored. The legacy mint-count arm reported `{file, line: 0}` and the handle
//      arm a `{file, line}` triple with the synthetic tokens `one-mint-per-file` / `exported-handle` /
//      `field-cap`. `locateFinding` (`lib/ordinary-waiver.ts:394`) requires an ordinary finding's token
//      to be AUTHORED TEXT at its own line/column, so every one of those tokens would have raised a
//      binding failure and an authority alarm on the first real waiver. The anchors move to the mint
//      callee, the initializer's own literal and the exported declaration's NAME. That is an ANCHOR MOVE
//      (§4.6 category 6) and it owes a marker receipt: there are ZERO live `@orb-gate-ignore
//      state-files` markers on the tree (measured 2026-09-12), so nothing re-binds and nothing orphans.
//
// LEGACY SHA: 50088b39b (`git show 50088b39b:tooling/src/verify/gates/state-files.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `state-files` descriptor at a4ed280d18da42e55be62960b8ce1aec1f76ff32, the parent of the conversion `5f8347dca`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `50088b39b` cited above
// is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations resolve to this
// source. Over the SAME 7,429 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 87 and final `population` admits 87.
// legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/state/__cbbhr_in_active-chat-store.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode, ObjectLiteralExpression, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MINT_CALLEES = new Set(["create", "createStore", "createGatedStore", "createEntityDraftStore"]);
const MAX_FIELDS = 10;

const MESSAGE =
  "the minted store handle is exported (never expose raw set/getState across a module boundary — export " +
  "intent-named actions + narrow read hooks instead), more than one store-minting call sits in one file " +
  `(one store per file), or a store initializer declares more than ${MAX_FIELDS} top-level fields (a store ` +
  "doing multiple jobs — split it) (ui-architecture-state-and-stack.md §5).";
const FIX =
  "one store-minting call per file, ≤" +
  `${MAX_FIELDS} top-level fields, and never export the raw handle — expose intent-named actions + narrow read hooks. A deliberate occurrence waives with \`@orb-waive state-files(<position>): <reason + end condition>\`, and the position differs BY ARM because each arm anchors on its own authored node: the SECOND mint's callee name (\`create\`, \`createGatedStore\`, …) for one-mint-per-file; the initializer object literal's first authored token (its first field name) for the field cap; and the EXPORTED DECLARATION'S NAME (\`useX\`) for the exported handle.`;

const MINT_COUNT_MESSAGE =
  "a second store-minting call in one file — one store per file (create/createStore/createGatedStore/createEntityDraftStore); split them (ui-architecture-state-and-stack.md §5).";
const FIELD_CAP_MESSAGE = `a state store initializer declares more than ${MAX_FIELDS} top-level fields — the store is doing multiple jobs; split it (ui-architecture-state-and-stack.md §5).`;
const HANDLE_MESSAGE =
  "the minted store handle is exported — never expose raw set/getState across a module boundary; export intent-named actions + narrow read hooks instead (ui-architecture-state-and-stack.md §5).";

/** The leftmost identifier name of a CallExpression's callee — `create<T>()` → "create",
 *  `createGatedStore(...)` → "createGatedStore". A wrapped application `create<T>()(...)` has a
 *  CallExpression callee (not an identifier) at the OUTER call, so the mint is counted exactly once. */
function calleeName(call: MorphNode): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  return Node.isIdentifier(callee) ? callee.getText() : undefined;
}

function isMintCall(call: MorphNode): boolean {
  const name = calleeName(call);
  return name !== undefined && MINT_CALLEES.has(name);
}

/** Unwrap `(): T => ({...})` / `() => { return {...} }` to the returned object literal, if any. */
function returnedObjectLiteral(fn: MorphNode): ObjectLiteralExpression | undefined {
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
    return;
  }
  const body = fn.getBody();
  if (Node.isParenthesizedExpression(body)) {
    const inner = body.getExpression();
    return Node.isObjectLiteralExpression(inner) ? inner : undefined;
  }
  if (Node.isObjectLiteralExpression(body)) {
    return body;
  }
  if (!Node.isBlock(body)) {
    return;
  }
  const ret = body.getStatements().find((s) => Node.isReturnStatement(s));
  const expr = ret !== undefined && Node.isReturnStatement(ret) ? ret.getExpression() : undefined;
  return expr !== undefined && Node.isObjectLiteralExpression(expr) ? expr : undefined;
}

/** The state initializer object literal a mint call declares — a direct arrow/fn argument returning an
 *  object literal (`createGatedStore(name, () => ({...}))`, `createStore()(persist(() => ({...})))`). */
function initializerObjectLiteral(call: MorphNode): ObjectLiteralExpression | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  return call
    .getArguments()
    .map((arg) => returnedObjectLiteral(arg))
    .find((lit) => lit !== undefined);
}

/** Does this initializer expression wrap (possibly through the `create<T>()(...)` application form) a
 *  store-minting call? Walks the callee spine. */
function initWrapsMint(init: MorphNode): boolean {
  let cursor: MorphNode = init;
  while (Node.isCallExpression(cursor)) {
    if (isMintCall(cursor)) {
      return true;
    }
    cursor = cursor.getExpression();
  }
  return false;
}

/** Every exported `const x = <mint>(...)` declaration in this file — the handles escaping their module.
 *  EVERY one, not the first: a marker binds to an exact position, so a second leak needs a second door. */
function exportedHandleDeclarations(statement: MorphNode): readonly VariableDeclaration[] {
  if (!Node.isVariableStatement(statement)) {
    return [];
  }
  if (!statement.isExported()) {
    return [];
  }
  return statement.getDeclarations().filter((decl) => {
    const init = decl.getInitializer();
    return init !== undefined && initWrapsMint(init);
  });
}

export const gate = defineGate({
  id: "state-files",
  family: "state-files",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/state/*"], notNamed: ["index.ts"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Per-FILE mint tallies, allocated inside `create` (never module scope): the one-mint-per-file arm
    // is a within-file ordinal, so the second and later mints in a file are the findings.
    const mintsSeen = new Map<string, number>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!isMintCall(node)) {
              return;
            }
            const path = ctx.relativePath(sourceFile);
            const ordinal = (mintsSeen.get(path) ?? 0) + 1;
            mintsSeen.set(path, ordinal);
            const name = calleeName(node) as string;
            if (ordinal > 1) {
              ctx.report.node(node, { token: name, offset: node.getText().indexOf(name), message: MINT_COUNT_MESSAGE, fix: FIX });
            }
            const lit = initializerObjectLiteral(node);
            if (lit !== undefined && lit.getProperties().length > MAX_FIELDS) {
              ctx.report.node(lit, { message: FIELD_CAP_MESSAGE, fix: FIX });
            }
          },
        },
        {
          kinds: [SyntaxKind.VariableStatement],
          visit: (node): void => {
            for (const declaration of exportedHandleDeclarations(node)) {
              ctx.report.node(declaration.getNameNode(), { message: HANDLE_MESSAGE, fix: FIX });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/state/grab-bag.ts":
          "declare const create: (f: () => unknown) => unknown;\nexport const useA = create(() => ({}));\nexport const useB = create(() => ({}));\n",
      },
      expect: { count: 3, token: "create", line: 3 },
      why: "THE FOUNDING ROW — two store-minting calls in one file, the grab-bag smell §5 forbids. Three findings, and the arithmetic is the point: ONE one-mint-per-file finding anchored on the SECOND mint's callee (line 3, token `create` — the first mint is legal and is not a finding), plus TWO exported-handle findings, one per leaked declaration. The legacy descriptor reported only the FIRST handle (`.find()`), which left `useB` unwaivable",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/big.ts":
          'const useX = createGatedStore("x", () => ({ f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0, f8: 0, f9: 0, f10: 0 }));\nexport const v = () => useX();\n',
      },
      expect: { count: 1, token: "f0", messageIncludes: "top-level fields" },
      why:
        "rule 2: a store initializer with 11 top-level fields — past the ≤" +
        `${MAX_FIELDS} cap, split it. The finding anchors on the INITIALIZER LITERAL and its derived position token is the literal's first authored token, the first field name`,
    },
    {
      mode: "source",
      files: { "packages/client/src/state/leak.ts": 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n' },
      expect: { count: 1, token: "useX", messageIncludes: "minted store handle is exported" },
      why: "rule 3: an exported minted store handle — never expose raw set/getState across a module boundary. The position is the DECLARATION NAME, which is what an author waives",
    },
    {
      mode: "source",
      files: { "packages/client/src/state/wrapped.ts": "export const s = create<{ n: number }>()(() => ({ n: 0 }));\n" },
      expect: { count: 1, token: "s", messageIncludes: "minted store handle is exported" },
      why: "rule 3: the wrapped `create<T>()(...)` APPLICATION form is caught too — `initWrapsMint` walks the callee spine, and the mint is still counted exactly once because the OUTER call's callee is a CallExpression rather than an identifier",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/two-leaks.ts":
          'export const useA = createGatedStore("a", () => ({ n: 0 }));\nexport const useB = createEntityDraftStore({ name: "b" });\n',
      },
      expect: { count: 3, token: "useB" },
      why: "THE GRANULARITY CORRECTION, pinned: two exported handles produce TWO separately-waivable findings (`useA`, `useB`) beside the one-mint-per-file finding on the second mint — three in all. Restore the legacy `.find()` and this row drops to 2 and `useB` loses its door",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/state/one.ts": "declare const create: (f: () => unknown) => unknown;\nconst useOne = create(() => ({}));\n" },
      why: "the sanctioned single-store shape: one mint, handle NOT exported, small initializer. It is also the EXPORT fence's row — drop `isExported()` and this is the row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/edge.ts":
          'const useX = createGatedStore("x", () => ({ f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0, f8: 0, f9: 0 }));\nexport const v = () => useX();\n',
      },
      why: "rule 2 BOUNDARY: exactly 10 fields is AT the cap, not past it. It is also the mint-WRAPPING fence's row — `export const v = () => useX()` is an exported const whose initializer is an arrow, not a mint, so dropping `initWrapsMint` from the handle arm makes this row flag",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/state/sub/nested.ts": 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
        "packages/client/src/state/index.ts": 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
        "packages/client/src/data/x.ts": 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
      },
      why: "THE POPULATION FENCE, pinned three ways with one in-population anchor so the row admits paths rather than tool-erroring: a NESTED state bucket (the flat `state/*` single-star), the `index.ts` BARREL (`notNamed`), and a non-state client file (the `under` prefix) all carry the identical leak and none is a finding. Cut any one of the three and exactly the corresponding file starts flagging",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/not-a-mint.ts":
          "declare function configure(f: () => unknown): unknown;\nconst a = configure(() => ({}));\nconst b = configure(() => ({}));\nexport const c = configure(() => ({}));\n",
      },
      why: "THE MINT VOCABULARY FENCE, pinned: `configure(...)` is not one of the four minting factories, so three of them in one file — one of them exported — is not a store at all. Cut `MINT_CALLEES` and this row flags on all three arms at once; it is the only row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/waived.ts":
          "// @orb-waive state-files(useX): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
      },
      why: "POSITIONAL IDENTITY (§4.2): the exported-handle arm anchors on the DECLARATION NAME, so an author waives the leaked handle `useX` — not the file and not the mint call it is bound to. The fixture is mustFlag[2] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
