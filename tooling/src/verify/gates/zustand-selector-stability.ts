// A zustand selector that returns a fresh object/array literal re-renders forever under v5's `Object.is`
// (the useSyncExternalStore loop). Select a stored ref, use a frozen module-constant default, or wrap in
// useShallow.
//
// THE SUBJECT IS A STORE HOOK, resolved through the callee's TYPE identity. The legacy gate tested the
// callee's TEXT against `/^use[A-Z].*Store$/`, so any function whose name happened to end in "Store" was a
// zustand store ("any `use*Store` text can match shadows") while a store hook that did not follow the
// naming convention was invisible. The app mints every store through `createGatedStore` /
// `createPersistedStore`, both of which return `GatedStoreHook<T>` — that alias, declared in its own home,
// IS the store identity. zustand's own `UseBoundStore` is admitted as the second home for a store minted
// outside the factories.
//
// EXECUTION IS entire-population BECAUSE THE ANCHOR IS A PROJECT FILE. The hook-type home is read through
// `ctx.sourceFile`, so a narrowed selection that does not carry it DEFERS loudly rather than passing every
// selector in the selection, and a rename resolves zero members and REFUSES.
//
// THE SELECTOR BODY IS JUDGED AS AUTHORED, never through the binding reader: `useX(s => DEFAULT)` where
// DEFAULT is a frozen module constant is the sanctioned FIX, so following the alias to its object literal
// would red the remedy the message prescribes.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { referenceResolutionServices } from "../lib/reference-fact.ts";
import { declaredByFile, declaredByPackage, resolveTypeIdentityOrigin } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, vendorLookalikeProof } from "./_proof/client-vendors.ts";

/** The app's ONE store-hook type; both store factories return it. */
const STORE_HOOK_HOME = "packages/client/src/state/create-gated-store.ts";
const STORE_HOOK_TYPE = "GatedStoreHook";
const ZUSTAND = "zustand";

const MESSAGE =
  "zustand selector returns a fresh object/array literal — under v5's Object.is this re-renders forever (useSyncExternalStore loop). Select a stored ref, use a frozen module-constant default, or wrap in useShallow. See UI-Lib-Zustand.md C-1/B-2.";

function isStoreHook(callee: MorphNode, home: SourceFile): boolean {
  const identity = resolveTypeIdentityOrigin(callee);
  if (identity.kind === "unresolved") {
    return false;
  }
  if (identity.value.name === STORE_HOOK_TYPE && declaredByFile(identity.value.declarations, home)) {
    return true;
  }
  return declaredByPackage(identity.value.declarations, ZUSTAND);
}

/** Does this arrow selector return a FRESHLY BUILT object/array? Parenthesis, `as` and `satisfies` wrappers
 *  are seen through; a named reference is not followed, because a frozen module constant is the fix. */
function returnsFreshLiteral(argument: MorphNode | undefined): boolean {
  if (argument === undefined || !Node.isArrowFunction(argument)) {
    return false;
  }
  const body = referenceResolutionServices.unwrapExpression(argument.getBody());
  return Node.isObjectLiteralExpression(body) || Node.isArrayLiteralExpression(body);
}

export const gate = defineGate({
  id: "zustand-selector-stability",
  family: "zustand-selector-stability",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "select a stored ref, use a frozen module-constant default, or wrap in useShallow.",
  create: (ctx) => {
    const candidates: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (Node.isCallExpression(node) && returnsFreshLiteral(node.getArguments()[0])) {
              candidates.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        let home: SourceFile | undefined;
        try {
          home = ctx.sourceFile(STORE_HOOK_HOME);
        } catch {
          home = undefined;
        }
        const declared = home?.getExportSymbols().filter((symbol) => symbol.getName() === STORE_HOOK_TYPE) ?? [];
        // ZERO members is a REFUSAL: the store-hook type moved or was renamed, and the policy's whole
        // subject would silently retire with it.
        ctx.receipt({ kind: "population", source: STORE_HOOK_TYPE, members: declared.length, unresolved: 0 });
        if (home === undefined || declared.length === 0) {
          return;
        }
        for (const node of candidates) {
          if (!Node.isCallExpression(node)) {
            continue;
          }
          const callee = node.getExpression();
          if (!isStoreHook(callee, home)) {
            continue;
          }
          // Anchored on the STORE HOOK inside the call, which is the position an author names in a waiver
          // and the token the legacy finding carried. The selector itself opens with a parameter name that
          // is neither stable nor unique, so it cannot be the position.
          const text = callee.getText();
          const token = text.slice(text.lastIndexOf(".") + 1);
          ctx.report.node(node, { token, offset: Math.max(node.getText().lastIndexOf(token), 0) });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      expect: { count: 1 },
      why: "the founding shape — a selector returning a fresh object literal, which never satisfies Object.is and re-renders forever",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => [s.user, 1]);\n',
      },
      expect: { count: 1 },
      why: "an ARRAY literal is the same fresh reference — both literal kinds, kept from the legacy proof",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nexport const readUser = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => readUser((s) => ({ a: s.user }));\n',
      },
      expect: { count: 1 },
      why: "A STORE HOOK THAT DOES NOT FOLLOW THE NAMING CONVENTION: `readUser` never matches `/^use[A-Z].*Store$/`, so the legacy gate could not see it at all. The resolved hook TYPE does",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }) as { a: string });\n',
      },
      expect: { count: 1 },
      why: "an `as`-wrapped literal is still a fresh reference — the wrapper is seen through, where the legacy check handled only the parenthesized form",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => s.user);\n',
      },
      why: "selecting a stored ref is the shape this policy exists to preserve",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst EMPTY = { a: "" };\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => (s.user === "" ? EMPTY : EMPTY));\n',
      },
      why: "THE PRESCRIBED FIX: a frozen module-constant default is stable across renders. This row is why the selector body is judged AS AUTHORED — resolving the reference to its object literal would red the remedy the message names",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/components/foo.tsx":
          "declare function useUserStore<U>(selector: (state: { user: string }) => U): U;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n",
      },
      why: "SAME NAME SHAPE, NOT A STORE: a local `useUserStore` helper matches the legacy regex exactly and is not a zustand store at all — the shadow the manifest recorded, cleared by the resolved type",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/components/foo.tsx":
          'import type { Options } from "vendor-lookalike";\ndeclare function useThemeStore<U>(selector: (state: Options) => U): U;\nexport const A = (): unknown => useThemeStore((s) => ({ a: s.staleTime }));\n',
      },
      why: `a hook typed by an unrelated package (${LOOKALIKE_HOME}) is not a zustand store; only the two declared homes admit`,
    },
  ],
});
