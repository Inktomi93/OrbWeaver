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
// outside the factories. The whole declared alias CHAIN is walked, not just the name the checker kept: a
// store re-aliased once (`type MyHook = GatedStoreHook<S>`) reports as `MyHook` in the consuming file.
//
// EXECUTION IS entire-population BECAUSE THE ANCHOR IS A PROJECT FILE. The hook-type home is located in the
// effective population, so a narrowed selection that does not carry it DEFERS loudly rather than passing
// every selector in the selection, and a rename resolves zero members and REFUSES.
//
// THREE ANSWERS: a proven store hook is the finding; any type the checker actually resolved and that is not
// one of the two homes passes (both homes are named ALIASES, so an unnamed type proves a non-store); an
// `any`/`unknown` callee is REPORTED (GATE-AUTHORING §5, #944) — type erasure is unreadable, not innocent.
//
// THE SELECTOR BODY IS JUDGED AS AUTHORED, never through the binding reader: `useX(s => DEFAULT)` where
// DEFAULT is a frozen module constant is the sanctioned FIX, so following the alias to its object literal
// would red the remedy the message prescribes.
//
// FAMILY: a declared SINGLETON under its own id. The identity readers it stands on (`resolveTypeIdentityChain`,
// `declaredByFile`/`declaredByPackage` in lib/type-member-origin.ts) are shared with the whole canonical-origin
// wave, but a shared PRIMITIVE is not a family; no sibling policy reads this policy's store-hook subject, and
// `zustand-selector-derived` — the one policy that would share it — is still legacy.
//
// POPULATION: `@authored` minus `*.test.ts`/`*.test.tsx`. The notNamed fence is a
// NARROWING with its own mustPass row; the arity fence and the unnamed-type verdict each have one too.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { TypeIdentityOrigin } from "../contract/type-member-origin.ts";
import { referenceResolutionServices } from "../lib/reference-fact.ts";
import { declaredByFile, declaredByPackage, resolveTypeIdentityChain } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, vendorLookalikeProof } from "./_proof/client-vendors.ts";

/** The app's ONE store-hook type; both store factories return it. */
const STORE_HOOK_HOME = "packages/client/src/state/create-gated-store.ts";
const STORE_HOOK_TYPE = "GatedStoreHook";
const ZUSTAND = "zustand";
/** zustand's OWN bound-hook type, for a store minted outside the two factories. The package alone is not
 *  the identity: `persist`, `devtools` and `subscribeWithSelector` are zustand-declared too, and every one
 *  of them takes an initializer that returns a fresh object — the real tree produced exactly that false
 *  positive (`persist((): S => ({ drafts: {} }), …)`) before this name was required. */
const ZUSTAND_HOOK_TYPE = "UseBoundStore";

const MESSAGE =
  "zustand selector returns a fresh object/array literal — under v5's Object.is this re-renders forever (useSyncExternalStore loop). Select a stored ref, use a frozen module-constant default, or wrap in useShallow. See UI-Lib-Zustand.md C-1/B-2.";
const UNREADABLE = `${MESSAGE} This callee's TYPE has no name the checker can give, so whether it is a store hook CANNOT be established — reported rather than passed.`;

type HookVerdict = "store" | "other" | "unreadable";

/** THREE answers, like every sibling in this family, and the boundary between the last two is exact.
 *
 *  The refusal is NOT routed through the shared `classifyOriginRefusal`: that classifier answers a
 *  MODULE-origin question, where "this binds a local declaration" genuinely proves a different identity.
 *  Here the question is a TYPE identity, and a local binding proves nothing: an `any`-typed
 *  `declare const useThingStore` is a perfectly ordinary local const whose type is erased.
 *
 *  UNREADABLE IS TYPE ERASURE, NOT ABSENCE OF A NAME. Both store homes are declared type ALIASES, so the
 *  checker always names a real store hook; a well-formed but unnamed function type therefore PROVES a
 *  non-store, and `rows.map((row) => ({ … }))` is that shape. Reporting every unnamed callee instead cost
 *  nine false findings on the real tree — array `map`/`flatMap` callbacks in server, tooling and test files
 *  that have nothing to do with zustand (measured 2026-09-06, committed as a mustPass row). Only `any` /
 *  `unknown` — where the checker was given nothing and a store hook COULD be hiding — is fail-closed. */
function hookVerdict(callee: MorphNode, home: SourceFile): HookVerdict {
  const type = callee.getType();
  if (type.isAny() || type.isUnknown()) {
    return "unreadable";
  }
  const chain = resolveTypeIdentityChain(callee);
  if (chain.kind === "unresolved") {
    return "other";
  }
  // THE WHOLE CHAIN, not just the outermost name: the checker keeps the alias the annotation used, so
  // `type MyHook = GatedStoreHook<S>` reports as `MyHook` declared in the CONSUMING file and a home test
  // against one name silently misses a re-aliased store — the alias positive twin this family owes.
  return chain.value.some(isStoreHomeIdentity(home)) ? "store" : "other";
}

function isStoreHomeIdentity(home: SourceFile): (identity: TypeIdentityOrigin) => boolean {
  return (identity) =>
    (identity.name === STORE_HOOK_TYPE && declaredByFile(identity.declarations, home)) ||
    (identity.name === ZUSTAND_HOOK_TYPE && declaredByPackage(identity.declarations, ZUSTAND));
}

/** Does this arrow SELECTOR return a FRESHLY BUILT object/array? Parenthesis, `as` and `satisfies` wrappers
 *  are seen through; a named reference is not followed, because a frozen module constant is the fix.
 *
 *  THE ARITY FENCE IS SEMANTIC, not a filter of convenience: a zustand selector is `(state) => U` and takes
 *  exactly one parameter, so `rows.map((row, index) => ({ … }))` cannot be one. Without it, a two-parameter
 *  array callback in a file the analysis program types loosely reaches the type check and reports as
 *  unreadable — two such survivors in a CT spec's in-browser closure were the last real-tree noise
 *  (measured 2026-09-06, committed as a mustPass row). */
function returnsFreshLiteral(argument: MorphNode | undefined): boolean {
  if (argument === undefined || !Node.isArrowFunction(argument) || argument.getParameters().length !== 1) {
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
  fix: "select a stored ref, use a frozen module-constant default, or wrap in useShallow. A deliberate fresh literal waives that occurrence with `@orb-waive zustand-selector-stability(<hook>): <reason + end condition>`, where `<hook>` is the STORE HOOK NAME the call is made on — the report anchors the token on the callee's last member segment (`store.useUser` reports `useUser`), never the selector parameter and never the literal itself.",
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
        // Located by scanning the effective population rather than through `ctx.sourceFile`, which THROWS on
        // an absent path: a missing home is a receipt refusal this policy authors, not an exception it
        // swallows, and a swallowed one would be an unproven caught-failure site besides.
        const home = ctx.files.find((file) => ctx.relativePath(file) === STORE_HOOK_HOME);
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
          const verdict = hookVerdict(callee, home);
          if (verdict === "other") {
            continue;
          }
          // Anchored on the STORE HOOK inside the call, which is the position an author names in a waiver
          // and the token the legacy finding carried. The selector itself opens with a parameter name that
          // is neither stable nor unique, so it cannot be the position.
          const text = callee.getText();
          const token = text.slice(text.lastIndexOf(".") + 1);
          ctx.report.node(node, {
            ...(verdict === "unreadable" ? { message: UNREADABLE } : {}),
            token,
            offset: Math.max(node.getText().lastIndexOf(token), 0),
          });
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
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/components/foo.tsx":
          "declare const useThingStore: any;\nexport const A = (): unknown => useThingStore((s: any) => ({ a: s.a }));\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED (#944): an `any`-typed callee has no TYPE NAME at all, so whether it is a store hook is UNKNOWN. Returning false here would make an untyped binding the one supported way past this law — the review's own reproduction",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/components/foo.tsx":
          'import type { GatedStoreHook } from "../state/create-gated-store.ts";\ntype MyHook = GatedStoreHook<{ user: string }>;\ndeclare const useUserStore: MyHook;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      expect: { count: 1, token: "useUserStore" },
      why: "A ONE-HOP TYPE ALIAS: the checker keeps the OUTERMOST alias the annotation used, so this callee reports as `MyHook` declared in the CONSUMING file. Testing the outermost name alone missed a real store hook entirely — the alias positive twin, closed by walking the declared alias chain to its home",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/state/hooks.ts":
          'import type { GatedStoreHook } from "./create-gated-store.ts";\nexport type UserHook = GatedStoreHook<{ user: string }>;\n',
        "packages/client/src/components/foo.tsx":
          'import type { UserHook } from "../state/hooks.ts";\ntype LocalHook = UserHook;\ndeclare const useUserStore: LocalHook;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      expect: { count: 1 },
      why: "THE ALIAS DECLARED IN ANOTHER MODULE: `useUserStore` is typed by `UserHook` from state/hooks.ts (the local `type LocalHook = UserHook` carries no type arguments, so TS collapses it and reports `UserHook`). The walk follows the alias symbol through the IMPORT DOOR to `GatedStoreHook` in its home — the cross-module half of the same twin",
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
    {
      mode: "types",
      files: {
        "node_modules/zustand/middleware/index.d.ts":
          "export declare function persist<T>(initializer: (set: unknown) => T, options: { name: string }): () => T;\nexport declare function devtools<T>(initializer: (set: unknown) => T, options: { name: string }): () => T;\n",
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/state/create-entity-draft-store.ts":
          'import { persist } from "zustand/middleware";\nexport const store = persist((set): { drafts: Record<string, string> } => ({ drafts: {} }), { name: "drafts" });\n',
      },
      why: "THE REAL-TREE FALSE POSITIVE THIS ROW WAS MINTED FROM: `persist((): S => ({ drafts: {} }), …)` in create-entity-draft-store.ts is a zustand MIDDLEWARE whose initializer legitimately returns a fresh object once at creation, not a selector that runs every render. Admitting anything zustand-declared would red it, so the hook TYPE name is part of the identity and not the package alone",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/server/src/domain/chat/persistence/identity.ts":
          "interface Row {\n  readonly id: string;\n  readonly name: string;\n}\nexport const shape = (rows: readonly Row[]): readonly unknown[] => rows.map((row) => ({ kind: 'character', id: row.id }));\n",
      },
      why: "THE SECOND REAL-TREE FALSE POSITIVE (nine of them, measured 2026-09-06): an ordinary `rows.map((row) => ({ … }))` has an UNNAMED function type, and reporting every unnamed callee red array callbacks across server, tooling and test files. Both store homes are named type ALIASES, so an unnamed type PROVES a non-store — only type erasure is unreadable",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "tests/client/features/chat/components/composer.ct.tsx":
          "declare const properties: any;\nexport const durations = (): unknown => properties.map((property: any, index: number) => ({ property, index }));\n",
      },
      why: "THE ARITY FENCE, and the last two real-tree survivors: a two-parameter `.map((property, index) => ({ … }))` inside a CT spec's in-browser closure is typed `any` by this analysis program (the root tsconfig is DOM-less), so the erasure check alone would report it. A zustand selector is `(state) => U` and takes exactly ONE parameter, so a two-parameter callback is provably not one — the fence is semantic, not a convenience filter",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/foo.test.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      why: "THE notNamed POPULATION FENCE, pinned: mustFlag[0]'s exact bytes under a `*.test.tsx` name are NOT admitted, because a re-render loop in a spec is a test's own business. Deleting `notNamed` leaves every other row green — this is the only row that dies without it",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]:
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
        "packages/client/src/components/waived.tsx":
          'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\n// @orb-waive zustand-selector-stability(useUserStore): the proof stand-in reason; ends when this fixture stops flagging.\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      why: "POSITIONAL IDENTITY: the report anchors on the CALL but its token is the callee's last member segment, so an author waives the STORE HOOK NAME `useUserStore` — never the selector parameter `s`, which is neither stable nor unique, and never the object literal the message is about. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
        "packages/client/src/components/elsewhere.ts":
          "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\ndeclare const useUserStore: GatedStoreHook<{ user: string }>;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n",
      },
      why: "#1999 — THE `GatedStoreHook` HOME HALF, PINNED: `isStoreHomeIdentity` (:85-89) requires the NAME `GatedStoreHook` AND `declaredByFile(…, home)`; a LOCAL type of the same name declared in a different file is a proven different declaration and must pass — the name alone is not the identity, only the two factories' canonical home is. Cutting `declaredByFile(identity.declarations, home)` (keeping the name check) turns this red",
    },
    {
      mode: "types",
      files: {
        [STORE_HOOK_HOME]: "export type GatedStoreHook<T> = {\n  (): T;\n};\nexport declare const unused: number;\n",
        "node_modules/zustand-lookalike/index.d.ts": "export type UseBoundStore<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\n",
        "packages/client/src/components/foo.tsx":
          'import type { UseBoundStore } from "zustand-lookalike";\ndeclare const useUserStore: UseBoundStore<{ user: string }>;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
      },
      why: "#1999 — THE `UseBoundStore` PACKAGE HALF, PINNED: `isStoreHomeIdentity` (:85-89) requires the NAME `UseBoundStore` AND `declaredByPackage(…, ZUSTAND)`; a same-named type declared by an UNRELATED package is a proven different declaration and must pass — this is the sibling of the real-tree `persist`/`devtools` false positive (:45-49), one clause over. Cutting `declaredByPackage(identity.declarations, ZUSTAND)` (keeping the name check) turns this red",
    },
  ],
});
