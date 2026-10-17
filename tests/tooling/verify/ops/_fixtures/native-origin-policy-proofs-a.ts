// Founding and nearest-legal policy inputs, retained verbatim when their descriptors move to native rules.
import type { GatePolicy } from "../../../../../tooling/src/verify/contract/policy.ts";

export const NATIVE_ORIGIN_POLICY_PROOFS_A: readonly Pick<GatePolicy, "id" | "mustFlag" | "mustPass">[] = [
  {
    id: "list-row-adoption",
    mustFlag: [
      {
        mode: "types",
        files: {
          "packages/client/src/features/demo/surfaces/demo-library-surface.tsx":
            'import { LibrarySurfaceShell } from "#components";\nexport const X = () => (\n  <LibrarySurfaceShell>\n    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n  </LibrarySurfaceShell>\n);\n',
        },
        expect: {
          count: 1,
          token: "div",
        },
        why: "a LIST-surface file's `.map()` row rooted in a plain `<div onClick>` — not ListRow/LibraryRow, flags",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx":
            'import { LibraryListLayout } from "#components";\nimport { VirtualList } from "@orb/ui/virtual-list";\nconst renderRow = (item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>;\nexport const X = () => (\n  <LibraryListLayout>\n    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n  </LibraryListLayout>\n);\n',
        },
        expect: {
          count: 1,
          token: "div",
        },
        why: "a LIST-surface file's `renderItem` prop resolves to a local `renderRow` rooted in a plain `<div onClick>` — the renderItem/renderRow hole, flags",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "packages/client/src/features/demo/surfaces/demo-library-surface.tsx":
            'import { LibraryRow } from "#components";\nimport { LibraryListLayout } from "#components";\nexport const X = () => (\n  <LibraryListLayout>\n    {items.map((item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />)}\n  </LibraryListLayout>\n);\n',
        },
        why: "a `.map()` row rooted in LibraryRow — the legal composite, passes",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx":
            'import { LibraryRow } from "#components";\nimport { LibraryListLayout } from "#components";\nimport { VirtualList } from "@orb/ui/virtual-list";\nconst renderRow = (item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />;\nexport const X = () => (\n  <LibraryListLayout>\n    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n  </LibraryListLayout>\n);\n',
        },
        why: "a `renderItem` prop resolving to a local `renderRow` rooted in LibraryRow — the legal composite, passes",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/demo/surfaces/demo-plain-list.tsx":
            "export const X = () => (\n  <div>\n    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n  </div>\n);\n",
        },
        why: "a hand-rolled interactive `.map()` row, but the file imports none of the 3 list-surface primitives — not a LIST-surface file, passes",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/settings/components/theme-setting-row.tsx":
            'import { createCollectionSurface } from "#data";\nexport const useX = createCollectionSurface({});\nexport const X = () => (\n  <div data-slot="setting-row" onClick={() => toggle()}>{label}</div>\n);\n',
        },
        why: "a settings *-row.tsx: a bare interactive div, but NO `.map()` at all in this file — the carve-out species pass (message/facet/setting rows use none of the 3 primitives in a list rendering loop)",
      },
    ],
  },
  {
    id: "no-mint-via-cast",
    mustFlag: [
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { randomUUID as uuid } from "node:crypto";\nimport { castId as brand } from "../../kit/src/ids/index";\nexport const x = brand(uuid());\n',
        },
        expect: {
          count: 1,
          token: "brand",
        },
        why: "aliases cannot hide the canonical cast seam or Node randomUUID. THE TOKEN IS THE CLAIM (#1968): the `why` says ALIASES, and `brand` — the local import alias, not `castId` — is what the report anchors on, so a bare `{ count: 1 }` would pass just as happily if the policy had anchored on the canonical name and the alias claim were untested",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
          "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.randomUUID());\n',
        },
        expect: {
          count: 1,
          token: "castId",
        },
        // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
        why: 'THE GLOBAL ARM (`target.kind === "global"`), reached by no row before #2047 — a `throw` planted in it left every row green. The ambient `crypto` needs no plant: the proof workspace loads TypeScript\'s own lib files, which `isAmbientGlobalDeclaration` trusts, so the browser/worker spelling `crypto.randomUUID()` resolves to the global rather than to a `node:crypto` import and takes the branch the two `mustFlag` rows above cannot. Its twin is the `local same-named function` mustPass row, which uses the SAME global expression through a non-canonical seam',
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { nanoid } from "nanoid";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(nanoid());\n',
        },
        expect: {
          count: 1,
        },
        why: "nanoid output must use the canonical prefixless mint instead of cast laundering",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\ndeclare function opaque(): any;\nexport const x = castId(opaque().newId());\n',
        },
        expect: {
          count: 1,
          messageIncludes: "CANNOT be established",
        },
        why: "THE FAIL-CLOSED THIRD ANSWER (#944), and until #2041 this policy FAILED OPEN here: the argument is a call off an OPAQUE `any`-typed receiver, so its callee binds no declaration at all and `classifyOriginRefusal` answers case (b). A HARD ban that acquits a subject it cannot read is the fail-open shape, so it is now REPORTED. The `messageIncludes` is the whole row — the unreadable arm emits the SAME single finding the generator verdict does and differs only in message, so a bare `{ count: 1 }` would pass unchanged if the arm were failed open again",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { randomUUID } from "node:crypto";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(randomUUID().replace("-", ""));\n',
        },
        expect: {
          count: 1,
          token: "castId",
          messageIncludes: "castId wraps a fresh-id generator",
        },
        why: "THE RESULT-METHOD HOP (#2042), MODULE ARM. A method call on a generator's RESULT was the laundering spelling this policy could not see: `argumentVerdict` asks only the argument call's OWN callee, which here is `String#replace` — a real declaration, so the pre-hop verdict was case (a) `other` and a HARD ban said nothing about a fresh uuid being branded. The gap was not hypothetical and was not new: the `crypto.getRandomValues` mustPass row's own `why` already recorded that a draft wrapping the call in `.toString()` \"passed for a reason unrelated to this fence\". THE VOCABULARY IS UNCHANGED — only the POSITION the policy is willing to look at moved, which is why the cut direction is FLAGS MORE. THE `messageIncludes` IS LOAD-BEARING AND WAS PAID FOR: a first draft used an UNTYPED generator (`nanoid()`, no @types in the proof workspace, so its result is `any`), which made the method callee bind nothing and the row PASSED AT TIP through the fail-closed UNREADABLE arm — a bare `{ count: 1, token }` cannot tell the hop from the third answer, because both emit exactly one finding on the same node",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
            'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.randomUUID().replace("-", "").slice(0, 12));\n',
        },
        expect: {
          count: 1,
          token: "castId",
          messageIncludes: "castId wraps a fresh-id generator",
        },
        why: "THE HOP IS A WALK, NOT ONE STEP, and this row is what dies if it is cut back to a single step: the generator sits TWO receivers deep behind `.replace(…).slice(…)`, which is the realistic short-id laundering rather than a contrived depth. It also carries the walk over the GLOBAL arm (`crypto.randomUUID`), whose one-step twin reaches the same predicate through the DIRECT position — so the walk and the global generator test are falsified together here and separately above. Same `messageIncludes` reason as the row above",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\ndeclare const row: { id: string };\nexport const x = castId(row.id);\n',
        },
        why: "branding an id read from an untyped seam is the helper's intended use",
      },
      {
        mode: "types",
        files: {
          // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
          "packages/server/src/x.ts": "function castId(value: string): string { return value; }\nexport const x = castId(crypto.randomUUID());\n",
        },
        why: "a local same-named function is not the kit cast seam",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.getRandomValues(new Uint8Array(1)));\n',
        },
        why: '§4.1 NARROWING (THE GLOBAL ARM\'S MEMBER): `target.memberPath.join(".") === "randomUUID"`. The SAME ambient global, a DIFFERENT member — `crypto.getRandomValues` is entropy, not an id mint. THE ARGUMENT MUST BE THE GLOBAL CALL ITSELF: `argumentVerdict` resolves the origin of the argument call\'s OWN callee, so a first draft of this row wrapping it in `.toString()` asked about `Uint8Array#toString`, passed for a reason unrelated to this fence, and SURVIVED the cut — which is how it was caught. Its twin below plants a different global carrying the same member name, so the arm\'s two clauses are falsified separately',
      },
      {
        mode: "types",
        files: {
          "node_modules/@types/crypto-lookalike/index.d.ts": "declare var lookalikeCrypto: { randomUUID(): string };\n",
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
          "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(lookalikeCrypto.randomUUID());\n',
        },
        // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
        why: "§4.1 NARROWING (THE GLOBAL ARM'S NAME): `target.globalName === \"crypto\"`. Nothing but the resolved global NAME separates this row from the `crypto.randomUUID()` mustFlag row — same member, same shape, same call. The lookalike is planted under `node_modules/@types/` because `isAmbientGlobalDeclaration` trusts only TypeScript's own lib files and `@types` packages; a bare script-global would be refused before the comparison and the row would pass for the wrong reason (`_proof/node-types.ts` records that asymmetry). Widening the trust rule to make a fixture resolve would weaken a real identity fence, so the fixture moves instead",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/slug.ts": 'export function makeSlug(): string { return "s"; }\n',
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\nimport { makeSlug } from "./slug";\nexport const x = castId(makeSlug());\n',
        },
        why: "§4.1 NARROWING (THE GENERATOR VOCABULARY): `MODULE_GENERATORS`. A project function returning a string, called through the CANONICAL cast seam, passes — `castId(<call>)` is not the offence, `castId(<a library mint>)` is. Before #2047 the table was unpinned: replacing the lookup with `true` left every row green, so the policy would have banned branding the result of ANY call and nothing said otherwise",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { nanoid } from "nanoid";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(nanoid.customAlphabet());\n',
        },
        why: '§4.1 NARROWING (THE EXPORT ITSELF, NOT A MEMBER OF IT): `target.memberPath.length === 0`. A MEMBER call hanging off a named generator export is a different function from the generator — `nanoid.customAlphabet()` builds a generator, it does not mint. Note which fixture does NOT discriminate here and why: `castId(ids.nanoid())` through `import * as ids from "nanoid"` still FLAGS at tip, because the shared reader canonicalises a namespace member down to the module\'s own export and hands back an EMPTY member path. The distinction the fence draws is about the resolved origin, not about the authored dots',
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "tests/server/x.test.ts":
            'import { nanoid } from "nanoid";\nimport { castId } from "../../packages/kit/src/ids/index";\nexport const x = castId(nanoid());\n',
        },
        why: "tests are outside this production mint policy",
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.getRandomValues(new Uint8Array(32)).toString());\n',
        },
        why: 'ENTROPY IS NOT AN ID MINT, AND NOW THROUGH THE WALK (#2042) — this is the shape of the SESSION-TOKEN MINT, `packages/server/src/domain/sessions/tokens/tokens.ts` `mintSessionToken`, which brands `randomBytes(32).toString("base64url")` and MUST stay silent. `randomBytes`/`getRandomValues` are CSPRNG BYTE SOURCES — raw bytes, no identity semantics, no uniqueness contract, no format — whereas every member of `MODULE_GENERATORS` returns a finished IDENTIFIER this codebase has a canonical mint for. A session token is not an id at all: it is a 256-bit opaque BEARER SECRET, looked up by peppered HMAC digest, and `castId` sits inside that one function precisely so no other module can conjure one. THIS ROW EXISTS TO STOP A FUTURE LANE \'FIXING\' THAT SITE: the two remedies this policy\'s own message prescribes both mint a TypeID — a UUIDv7 carrying an embedded millisecond timestamp and roughly 74 random bits — so obeying the ban there would trade an opaque 256-bit secret for a timestamped, materially lower-entropy one, and a gate whose remedy WEAKENS the thing it polices is worse than no gate. That is why the vocabulary is NOT widened to `randomBytes` and why this is a `mustPass` rather than a waiver on correct code. IT IS THE GLOBAL ARM\'S MEMBER CLAUSE THROUGH THE WALK (`memberPath === "randomUUID"`), the `.toString()` draft the sibling `getRandomValues` row above records as having "passed for a reason unrelated to this fence" — before the walk it did; now it reaches the fence and is pinned there. THE FIXTURE IS THE AMBIENT GLOBAL, NOT `node:crypto`, AND THAT IS A MEASURED WORKSPACE LIMIT, NOT A WEAKER CLAIM: the isolated proof workspace cannot type an `@types/node` RETURN value, so `randomBytes(32).toString(…)` binds no method declaration there and the row would go red through the UNREADABLE arm for a reason that has nothing to do with this fence (measured 2026-09-12; `crypto.getRandomValues` returns a `Uint8Array` from TypeScript\'s OWN lib, which does resolve). The live site is unaffected either way, because the walk answers `false` at `randomBytes` and hands the verdict back unchanged',
      },
      {
        mode: "types",
        files: {
          "packages/kit/src/ids/index.ts":
            "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport function castId<T extends string>(raw: string): T { return raw as T; }\n",
          "packages/server/src/slug.ts": 'export function makeSlug(): string { return "s"; }\n',
          "packages/server/src/x.ts":
            'import { castId } from "../../kit/src/ids/index";\nimport { makeSlug } from "./slug";\nexport const x = castId(makeSlug().toUpperCase());\n',
        },
        why: "§4.1 NARROWING (THE VOCABULARY, THROUGH THE WALK): the receiver walk asks the SAME `isGenerator` question the direct position asks, so a project function called through a result method is not the offence. Replace the walk's vocabulary test with `true` and this row reddens while every hop `mustFlag` row stays green — which is the whole claim, since a walk that flagged any call-on-a-call would ban `castId(row.load().trim())` across the tree. IT IS THE MODULE HALF OF `isGenerator`, AND ITS TWIN ABOVE IS THE GLOBAL HALF — cut-measured 2026-09-12, the two are NOT redundant: opening the global member clause (`memberPath === \"randomUUID\"` → any `crypto` member) reddens the session-mint row and the direct `getRandomValues` row and leaves THIS one green, while cutting the walk's vocabulary test reddens both of these and leaves the direct row green",
      },
    ],
  },
  {
    id: "zustand-selector-stability",
    mustFlag: [
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        expect: {
          count: 1,
        },
        why: "the founding shape — a selector returning a fresh object literal, which never satisfies Object.is and re-renders forever",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => [s.user, 1]);\n',
        },
        expect: {
          count: 1,
        },
        why: "an ARRAY literal is the same fresh reference — both literal kinds, kept from the legacy proof",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nexport const readUser = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => readUser((s) => ({ a: s.user }));\n',
        },
        expect: {
          count: 1,
        },
        why: "A STORE HOOK THAT DOES NOT FOLLOW THE NAMING CONVENTION: `readUser` never matches `/^use[A-Z].*Store$/`, so the legacy gate could not see it at all. The resolved hook TYPE does",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }) as { a: string });\n',
        },
        expect: {
          count: 1,
        },
        why: "an `as`-wrapped literal is still a fresh reference — the wrapper is seen through, where the legacy check handled only the parenthesized form",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/components/foo.tsx":
            "declare const useThingStore: any;\nexport const A = (): unknown => useThingStore((s: any) => ({ a: s.a }));\n",
        },
        expect: {
          count: 1,
          messageIncludes: "CANNOT be established",
        },
        why: "FAIL-CLOSED (#944): an `any`-typed callee has no TYPE NAME at all, so whether it is a store hook is UNKNOWN. Returning false here would make an untyped binding the one supported way past this law — the review's own reproduction",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/components/foo.tsx":
            'import type { GatedStoreHook } from "../state/create-gated-store.ts";\ntype MyHook = GatedStoreHook<{ user: string }>;\ndeclare const useUserStore: MyHook;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        expect: {
          count: 1,
          token: "useUserStore",
        },
        why: "A ONE-HOP TYPE ALIAS: the checker keeps the OUTERMOST alias the annotation used, so this callee reports as `MyHook` declared in the CONSUMING file. Testing the outermost name alone missed a real store hook entirely — the alias positive twin, closed by walking the declared alias chain to its home",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/state/hooks.ts":
            'import type { GatedStoreHook } from "./create-gated-store.ts";\nexport type UserHook = GatedStoreHook<{ user: string }>;\n',
          "packages/client/src/components/foo.tsx":
            'import type { UserHook } from "../state/hooks.ts";\ntype LocalHook = UserHook;\ndeclare const useUserStore: LocalHook;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        expect: {
          count: 1,
        },
        why: "THE ALIAS DECLARED IN ANOTHER MODULE: `useUserStore` is typed by `UserHook` from state/hooks.ts (the local `type LocalHook = UserHook` carries no type arguments, so TS collapses it and reports `UserHook`). The walk follows the alias symbol through the IMPORT DOOR to `GatedStoreHook` in its home — the cross-module half of the same twin",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => s.user);\n',
        },
        why: "selecting a stored ref is the shape this policy exists to preserve",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst EMPTY = { a: "" };\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => (s.user === "" ? EMPTY : EMPTY));\n',
        },
        why: "THE PRESCRIBED FIX: a frozen module-constant default is stable across renders. This row is why the selector body is judged AS AUTHORED — resolving the reference to its object literal would red the remedy the message names",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/components/foo.tsx":
            "declare function useUserStore<U>(selector: (state: { user: string }) => U): U;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n",
        },
        why: "SAME NAME SHAPE, NOT A STORE: a local `useUserStore` helper matches the legacy regex exactly and is not a zustand store at all — the shadow the manifest recorded, cleared by the resolved type",
      },
      {
        mode: "types",
        files: {
          "node_modules/vendor-lookalike/index.d.ts":
            "export declare class QueryClient {\n  cancelQueries(filters?: unknown): Promise<void>;\n  setQueryData(key: unknown, updater: unknown): unknown;\n  invalidateQueries(filters?: unknown): Promise<void>;\n  getQueryData(key: unknown): unknown;\n  removeQueries(filters?: unknown): void;\n  resetQueries(filters?: unknown): Promise<void>;\n}\nexport interface Options {\n  staleTime?: number | 'static';\n}\nexport declare function configure(options: Options): void;\nexport declare function useQueryClient(): QueryClient;\nexport declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  handleSubmit(): Promise<void>;\n}\nexport declare function useForm(options?: unknown): unknown;\nexport declare function createFormHook(options: unknown): { useAppForm: unknown };\nexport declare function createFormHookContexts(): { useFieldContext: <T>() => T };\nexport interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/components/foo.tsx":
            'import type { Options } from "vendor-lookalike";\ndeclare function useThemeStore<U>(selector: (state: Options) => U): U;\nexport const A = (): unknown => useThemeStore((s) => ({ a: s.staleTime }));\n',
        },
        why: "a hook typed by an unrelated package (node_modules/vendor-lookalike/index.d.ts) is not a zustand store; only the two declared homes admit",
      },
      {
        mode: "types",
        files: {
          "node_modules/zustand/middleware/index.d.ts":
            "export declare function persist<T>(initializer: (set: unknown) => T, options: { name: string }): () => T;\nexport declare function devtools<T>(initializer: (set: unknown) => T, options: { name: string }): () => T;\n",
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/state/create-entity-draft-store.ts":
            'import { persist } from "zustand/middleware";\nexport const store = persist((set): { drafts: Record<string, string> } => ({ drafts: {} }), { name: "drafts" });\n',
        },
        why: "THE REAL-TREE FALSE POSITIVE THIS ROW WAS MINTED FROM: `persist((): S => ({ drafts: {} }), …)` in create-entity-draft-store.ts is a zustand MIDDLEWARE whose initializer legitimately returns a fresh object once at creation, not a selector that runs every render. Admitting anything zustand-declared would red it, so the hook TYPE name is part of the identity and not the package alone",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/server/src/domain/chat/persistence/identity.ts":
            "interface Row {\n  readonly id: string;\n  readonly name: string;\n}\nexport const shape = (rows: readonly Row[]): readonly unknown[] => rows.map((row) => ({ kind: 'character', id: row.id }));\n",
        },
        why: "THE SECOND REAL-TREE FALSE POSITIVE (nine of them, measured 2026-09-06): an ordinary `rows.map((row) => ({ … }))` has an UNNAMED function type, and reporting every unnamed callee red array callbacks across server, tooling and test files. Both store homes are named type ALIASES, so an unnamed type PROVES a non-store — only type erasure is unreadable",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "tests/client/features/chat/components/composer.ct.tsx":
            "declare const properties: any;\nexport const durations = (): unknown => properties.map((property: any, index: number) => ({ property, index }));\n",
        },
        why: "THE ARITY FENCE, and the last two real-tree survivors: a two-parameter `.map((property, index) => ({ … }))` inside a CT spec's in-browser closure is typed `any` by this analysis program (the root tsconfig is DOM-less), so the erasure check alone would report it. A zustand selector is `(state) => U` and takes exactly ONE parameter, so a two-parameter callback is provably not one — the fence is semantic, not a convenience filter",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/foo.test.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        why: "THE notNamed POPULATION FENCE, pinned: mustFlag[0]'s exact bytes under a `*.test.tsx` name are NOT admitted, because a re-render loop in a spec is a test's own business. Deleting `notNamed` leaves every other row green — this is the only row that dies without it",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare function createGatedStore<T>(name: string, initial: T): GatedStoreHook<T>;\n",
          "packages/client/src/components/waived.tsx":
            'import { createGatedStore } from "../state/create-gated-store.ts";\nconst useUserStore = createGatedStore("user", { user: "a" });\n// @orb-waive zustand-selector-stability(useUserStore): the proof stand-in reason; ends when this fixture stops flagging.\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        why: "POSITIONAL IDENTITY: the report anchors on the CALL but its token is the callee's last member segment, so an author waives the STORE HOOK NAME `useUserStore` — never the selector parameter `s`, which is neither stable nor unique, and never the object literal the message is about. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\nexport declare const unused: number;\n",
          "packages/client/src/components/elsewhere.ts":
            "export type GatedStoreHook<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\ndeclare const useUserStore: GatedStoreHook<{ user: string }>;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n",
        },
        why: "#1999 — THE `GatedStoreHook` HOME HALF, PINNED: `isStoreHomeIdentity` (:85-89) requires the NAME `GatedStoreHook` AND `declaredByFile(…, home)`; a LOCAL type of the same name declared in a different file is a proven different declaration and must pass — the name alone is not the identity, only the two factories' canonical home is. Cutting `declaredByFile(identity.declarations, home)` (keeping the name check) turns this red",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/state/create-gated-store.ts": "export type GatedStoreHook<T> = {\n  (): T;\n};\nexport declare const unused: number;\n",
          "node_modules/zustand-lookalike/index.d.ts": "export type UseBoundStore<T> = {\n  (): T;\n  <U>(selector: (state: T) => U): U;\n};\n",
          "packages/client/src/components/foo.tsx":
            'import type { UseBoundStore } from "zustand-lookalike";\ndeclare const useUserStore: UseBoundStore<{ user: string }>;\nexport const A = (): unknown => useUserStore((s) => ({ a: s.user }));\n',
        },
        why: "#1999 — THE `UseBoundStore` PACKAGE HALF, PINNED: `isStoreHomeIdentity` (:85-89) requires the NAME `UseBoundStore` AND `declaredByPackage(…, ZUSTAND)`; a same-named type declared by an UNRELATED package is a proven different declaration and must pass — this is the sibling of the real-tree `persist`/`devtools` false positive (:45-49), one clause over. Cutting `declaredByPackage(identity.declarations, ZUSTAND)` (keeping the name check) turns this red",
      },
    ],
  },
  {
    id: "test-fixture-imports",
    mustFlag: [
      {
        mode: "types",
        files: {
          "tests/server/x.test.ts": 'import { expect, test } from "vitest";\nexport const t = [test, expect];\n',
        },
        expect: {
          count: 2,
          token: "test",
        },
        why: "the founding shape — `test`/`expect` taken straight from the runner, which skips the composed db/clock/ids fixture entirely (§4)",
      },
      {
        mode: "types",
        files: {
          "tests/server/alias.test.ts": 'import { test as scenario } from "vitest";\nexport const t = scenario;\n',
        },
        expect: {
          count: 1,
          token: "test",
        },
        why: "AN IMPORT ALIAS enters the same door — the specifier's `getName()` is the exported name, so renaming the binding is not an escape",
      },
      {
        mode: "types",
        files: {
          "tests/server/ns.test.ts": 'import * as runner from "vitest";\nexport const t = runner.test;\n',
        },
        expect: {
          count: 1,
          token: "test",
        },
        why: "A NAMESPACE IMPORT produces no ImportSpecifier at all — the legacy specifier-keyed detector was offered no node whatsoever, a silent green (#1506)",
      },
      {
        mode: "types",
        files: {
          "tests/e2e-mirror/flow.test.ts": 'import { expect } from "@playwright/test";\nexport const e = expect;\n',
        },
        expect: {
          count: 1,
          token: "expect",
        },
        why: "the Playwright half of the same ban — only `tests/e2e/**` runs its own lane, and a Playwright import anywhere else is the doctrine's other founding case",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
          "tests/tooling/snapx/y.test.ts": 'import { expect, test } from "../../support/fixtures.ts";\nexport const t = [test, expect];\n',
        },
        expect: {
          count: 2,
          token: "test",
        },
        why: "the §4.8 arm — the PLAIN composed door inside the tooling mirror. It is a legitimate door everywhere else; here it skips the RESULT serializer and bakes unnormalized inline snapshots",
      },
      {
        mode: "types",
        files: {
          "tests/tooling/unreadable.test.ts": 'import { test } from "./missing-door.ts";\nexport const t = test;\n',
        },
        expect: {
          count: 1,
          token: "test",
        },
        why: "FAIL-CLOSED — a relative door that resolves to no module cannot be shown to install the serializer, and an unreadable door is not a licence",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "node_modules/@playwright/experimental-ct-react/index.ts": "export declare const test: unknown;\nexport declare const expect: unknown;\n",
          "tests/tooling/snap/overflow.ct.tsx": 'import { expect, test } from "@playwright/experimental-ct-react";\nexport const t = [test, expect];\n',
        },
        why: "THE EXTERNAL-DOOR CONTROL — a typed workspace resolves a PACKAGE specifier to its shipped declarations, so a package door answers `getModuleSpecifierSourceFile()` with a real file. Reading that as a composed project door made the tooling mirror demand a serializer registration from a third-party runner: four false positives on the real tree, on the CT specs that legitimately enter through the CT runner. DECLARED LIMIT: the ban names the two doors the doctrine names, and the CT runner is not one of them",
      },
      {
        mode: "types",
        files: {
          "tests/kit/regex.test.ts":
            "export const matches = (pattern: RegExp, value: string): boolean => pattern.test(value);\nexport const has = (bag: { readonly expect: number }): number => bag.expect;\n",
        },
        why: "THE MEMBER COUNTERFACTUAL — `pattern.test(value)` and a property named `expect` spell the doctrine's three words on receivers that are not namespace imports at all. Reading an unresolved door as fail-closed HERE produced 89 confident false positives on the real tree, nearly all of them `RegExp.prototype.test`; fail-closure belongs to a DECLARED import door and nowhere else",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
          "tests/server/y.test.ts": 'import { expect, test } from "../support/fixtures.ts";\nexport const t = [test, expect];\n',
        },
        why: "the sanctioned composed door OUTSIDE the tooling mirror — the ordinary case for the whole test tree",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
          "tests/support/tool-fixtures.ts":
            'import { expect, test as houseTest } from "./fixtures.ts";\nexport const test = houseTest;\nexport { expect } from "./fixtures.ts";\nexpect.addSnapshotSerializer({ serialize: () => "" });\n',
          "tests/tooling/snapx/z.test.ts": 'import { expect, test } from "../../support/tool-fixtures.ts";\nexport const t = [test, expect];\n',
        },
        why: "the §4.8 door, identified by the SERIALIZER REGISTRATION it performs rather than by its path — this is the whole reason a second door exists, and reading it structurally means the door may be renamed freely",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
          "tests/support/renamed-tool-door.ts":
            'import { expect, test as houseTest } from "./fixtures.ts";\nexport const test = houseTest;\nexport { expect } from "./fixtures.ts";\nexpect.addSnapshotSerializer({ serialize: () => "" });\n',
          "tests/tooling/snapx/renamed.test.ts": 'import { expect, test } from "../../support/renamed-tool-door.ts";\nexport const t = [test, expect];\n',
        },
        why: "THE RENAME CONTROL — the same door under a different filename still passes. A path regex (`support/fixtures$`) would have judged this by its spelling; the registration is what is actually being asked about",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
          "tests/tooling/types.test-d.ts": 'import { expect, test } from "vitest";\nexport const t = [test, expect];\n',
          "tests/tooling/quiet.test.ts": "export const quiet = 1;\n",
        },
        why: "a `.test-d.ts` is a tsc-only type project that never touches the runtime fixture — outside the population by design (docs/law/Spine-Testing.md §1)",
      },
      {
        mode: "types",
        files: {
          "tests/tooling/third-party.test.ts": 'import { expect } from "chai";\nexport const e = expect;\n',
        },
        why: "DECLARED LIMIT — an `expect` from some OTHER package is not one of the two runner doors the doctrine names. The subject is the composed-fixture bypass, not every assertion helper in the ecosystem",
      },
      {
        mode: "types",
        files: {
          "tests/server/waived.test.ts":
            '// @orb-waive test-fixture-imports(test): this spec drives the fixture composition itself and must reach the bare runner; ends when the composition has a testable seam.\nimport { test } from "vitest";\nexport const t = test;\n',
        },
        why: "the ONE central positioned waiver naming the exact reported binding — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
      },
      {
        mode: "types",
        files: {
          "tests/e2e/flow.spec.ts": 'import { expect, test } from "@playwright/test";\nexport const t = [test, expect];\n',
          "tests/server/anchor.test.ts": "export const quiet = 1;\n",
        },
        why: "THE POPULATION FENCE, `tests/e2e/**` half — the Playwright runner entered DIRECTLY inside the e2e lane, beside an in-population anchor. e2e runs its own runner and has no composed db/clock/ids fixture to enter through, which is exactly why the legacy `scanRoot` subtracted it; the `e2e-mirror` mustFlag row above is the control showing the exclusion is a PATH, not the word 'e2e'. Dropping the e2e exclusion reds this row (w9 :262, #2046)",
      },
      {
        mode: "types",
        files: {
          "tests/support/fixtures.ts": 'import { expect, test } from "vitest";\nexport { expect, test };\n',
          "tests/server/anchor.test.ts": "export const quiet = 1;\n",
        },
        why: "THE POPULATION FENCE, `tests/support/**` half — the composed door's OWN source, which must import the runner directly or there is no door at all. A rule banning the runner import cannot apply to the one file whose job is making that import once. Dropping the support exclusion reds this row (w9 :262, #2046)",
      },
    ],
  },
];
