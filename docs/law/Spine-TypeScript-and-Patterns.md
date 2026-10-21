---
kind: law
status: active
updated: 2026-10-17
---

# Orbweaver — Spine: TypeScript & Patterns (Types, Schemas, Dispatch)

Canonical doc for spine §7.4 (types & schemas) and §7.5 (string-union dispatch) — cited elsewhere as "the §7.4 rule" / "spine §7.5"; `Constitution.md` §5 points here. D333 retires custom static type-home and union-redeclaration gates. The type homes remain architecture law; the compiler still checks mapped `Record` and `assertNever` dispatch.

## Types & schemas — one home, one direction, no inline (spine §7.4)

The rule: **one home per shape, derived by who needs it; flows DOWN only.** An ambiguous home lets a shape duplicate and inline types sprout at every call site.

| Shape kind | Home | Consumers (down only) |
| - | - | - |
| **DB row** | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS) | server, client, other domains |
| **domain-internal** | that domain's `contract/` (params/results/views/errors) | only that domain |
| **package-internal API** | sanctioned `src/contract/` in inference, default-content and plugin-toolchain | the owning package and its public API consumers |
| **UI token-authoring API** | `packages/ui/token-contract.ts` (Node) | UI token build and verification |
| **client-only view** | client | client |
| **component or sealed UI primitive API** | the owning component, hook, factory or renderer | primitive callers and tests |
| **server factory API** (a factory's deps, options, handle and result shapes in entry, transport, infra or foundation) | the file that declares the factory | the factory's callers in its tier |
| **server adapter API shared across tiers** | adapter-owned contracts under [Tier-3-Infra](Tier-3-Infra.md#spine-intersections) | permitted server callers; no client reach |
| **transport context, port and driver API** | explicit owners in [Tier-4-Transport](Tier-4-Transport.md#what-this-tier-owns) | permitted server callers |
| **env policy API** | env-owned contract under [D327](../adr/0327-foundation-env-policy-contracts.md) | permitted server callers; no client reach |
| **data-layout API crossing into entry** | `packages/server/src/foundation/data-layout/contract.ts` under [D329](../adr/0329-data-layout-and-portability-registry-type-homes.md) | foundation and entry callers; no client reach |
| **portability registry value shapes** | `packages/server/src/entry/contract/portability.ts` under [D329](../adr/0329-data-layout-and-portability-registry-type-homes.md) | the entry portability registries and their tests |
| **entry request env** | `packages/server/src/entry/http/contract/request-env.ts` under [D329](../adr/0329-data-layout-and-portability-registry-type-homes.md) | entry route registrars |
| **tRPC router type bridge** | `packages/server/src/transport/trpc/router.ts` under [D329](../adr/0329-data-layout-and-portability-registry-type-homes.md) | the client, type-only |
| **server-only pure primitive shape** | `packages/server/src/primitives/` | server callers |
| **tooling result, config and exit shape** | the tool's `contract/`, or `tooling/src/floor/` for retained shared plumbing | the tool and its tests |
| **tooling helper API** (a function's options, handle and result shapes) | the file that declares the function under [D331](../adr/0331-tooling-and-test-shapes-stay-beside-their-function.md) | the function's callers |
| **shared test shape** | the test kit under `tests/support/`, a `fixtures.ts`, `*.fixtures.ts`, `*-fixtures.ts` or `_support.ts` module, or a `contract/` folder | suites in maintained tests |
| **test helper API** | the file that declares the helper function under [D331](../adr/0331-tooling-and-test-shapes-stay-beside-their-function.md) | the helper's callers |
| **pure primitive shape** | `kit` | anyone (it's the bottom) |

**The rule:** exported types, interfaces and schemas belong in the homes above. Domain, wire and database shapes never move into a component.

Standalone package contracts preserve package direction and distribution. They do not move application wire shapes out of contracts or create new public package doors.

Keep token-authoring shapes in the Node contract home. Preserve supported type exports from build helpers through type-only reexports. This home grants neither browser component ownership nor generated-output provenance.

Component-owned prop and render APIs may stay beside their component. Derive native props, callbacks and variants from the installed library types. Derive domain, wire and database data from their canonical owners. A name ending in `Props` does not establish component ownership. Tests use the owning component's exported API type. Otherwise, derive its props through React's type-only `ComponentProps` helper against that component. Neither path bypasses the sealed UI package. Tests never maintain a parallel prop contract. Package direction still applies: UI imports no application contracts. Ledger-sanctioned UI structural mirrors retain their existing cross-package conformance checks.

D42 and D54 place domain-agnostic component, DOM and string-math primitives in UI; [UI-Primitives section 13.9](UI-Primitives-and-Reuse.md#139-homing--the-parked-list) owns that boundary. Their options, handles and supporting shapes stay with the actual primitive API. Establish ownership from its production signature and dependency graph, not a package path or shape name. Unrelated pure engines stay in kit. Generated vocabulary and Node build APIs require their own owner; browser component evidence does not qualify them.

A server factory shape is owned by its production signature: it is a parameter, return type or member of a function declared in the same file (D324). A plain-data shape with a wire-vocabulary name is wire data, not a factory shape, and takes the wire home. Inline application data shapes in `verbs/`, `persistence/`, `service.ts` or transport remain violations. D331 applies the same signature ownership to retained tooling and maintained tests. The sibling legacy source is reference-only and is outside this repository's typecheck population.

Custom static placement checks no longer cover these cases: client exported interfaces other than wire-named plain data, `ui` component APIs, `showcase-plugins`, and exported zod schemas built by a method chain or a non-shape factory. `scripts/` remains a research zone and has no type home. `erasableSyntaxOnly` in `tsconfig.base.json` makes every enum and value namespace a compile error. Ambient `declare global` and module augmentations stay where they augment.

D333 retires custom static placement and union-redeclaration checks. These type-home rules remain architecture law without a custom static check. The compiler still catches missing members in mapped `Record` dispatch.

Wire values that cross a boundary must be parsed, not cast. Use zod schemas at trust boundaries.

## House TypeScript style

The opinionated conventions (strict TypeScript, ESM, `erasableSyntaxOnly`, branded `typeid` IDs, zod and package direction). Typecheck a whole program with `pnpm exec tsc --noEmit --project <tsconfig>`; raw `tsc <file>` is a hard TS5112 error since TS 6. These conventions remain guidance unless the compiler or retained native lint rule enforces them.

## 1. The keystone

A string axis is an `as const` tuple; its union is **derived**, never re-spelled; dispatch is a total `Record` or ends in `assertNever`. The compiler catches missing members in a mapped `Record`; D333 retires custom duplicate-union detection.

## 2. Utility types — the policy

**ADOPT.** `Record<Union,V>` (the dispatch primitive — keeps dot access under `noPropertyAccessFromIndexSignature`, errors on missing keys with `satisfies`) · `Awaited<T>` (unwrap promises, don't hand-roll `infer`) · `Pick<T,K>` (project a contract type; keys are checked, renames propagate) · `NonNullable<T>` (post-guard strip) · `Uppercase/Capitalize/…` (ONLY for type-level key derivation with template literals).

**CONSIDER.** `Readonly<T>` (shallow only — prefer authoring `readonly` props in `contract/`) · `Partial<T>` (patch payloads — but prefer a real zod patch schema so it's validated) · `Required<T>` · `Exclude`/`Extract` (union algebra on discriminants — distributive, collapses to `never` if the filter is wrong) · `Parameters<T>`/`InstanceType<T>` (only to mirror code we don't own) · `NoInfer<T>` (stop a default/2nd arg widening an inferred param in generic factories).

**AVOID.**

- `ReturnType<typeof fn>` as an **exported** type — avoid it for `context.ts`; author the boundary type by hand. OK only as a module-local alias or to mirror a third-party fn.
- `Omit<T,K>` — two traps: (1) **does not distribute over unions** → silently flattens a discriminated union, dropping variant fields; (2) keys aren't validated. Prefer **`Pick` (allow-list)** in `contract/`.
- `ThisType`/`ThisParameterType`/`OmitThisParameter` — OOP/`this`-binding tools orthogonal to our functional+zod style.

## 3. Narrowing — house style

**ADOPT.** Discriminated unions (literal `kind` per variant — the canonical model shape; `z.discriminatedUnion` infers straight into them; always over one-type-with-optional-fields) · `assertNever` in every `switch` default · **`satisfies`** broadly (validate-without-widening; replaces most `as`) · user-defined guards `x is T` (but at a **trust boundary use a zod `.safeParse`** guard — predicates can lie, zod validates) · `in` / `typeof` / `instanceof` (remember `typeof null === "object"`).

**CONSIDER.** Assertion functions `asserts x is T` for invariants (`assertDefined`) — compiler trusts them blindly, keep bodies honest, prefer zod at I/O edges · loose `!= null` (strips null+undefined in one check — the sanctioned `==` exception).

**AVOID.** Truthiness narrowing on `string`/`number` (`if (str)` eats `""`; `if (n)` eats `0`/`NaN`) — require explicit `!== undefined` / `!= null` · cast-based guard bodies (`(x as Fish).swim`) — use `in` or zod inside.

## 4. Objects & nullability under our strict flags

- **`readonly` by default** on contract surfaces (`readonly T[]`); assignment is one-way, safe.
- **`Record<LiteralUnion,V>` over index signatures** (index sigs force bracket access under `noPropertyAccessFromIndexSignature` + lose key safety); **`Map` for open/dynamic keys** (`.get()` is `V | undefined`, matching `noUncheckedIndexedAccess`).
- **`?` vs `| undefined` are NOT interchangeable under `exactOptionalPropertyTypes`**: `x?: T` = may be **absent** (can't pass explicit `undefined`); `x: T | undefined` = must be **present**, may be undefined. Choose by intent — default `?` for genuinely-absent fields.
- **Make a field required and nullable (`x: T | null`) when a reader would take its absence as a default.** Every producer then states the value, even as `null`. Example: `ChatResult.appliedEffort` in `packages/inference/src/contract/chat.ts`. As an optional field, an absent value would read as the requested effort.
- **`interface` for hand-authored object shapes, `type` for unions/aliases** — but in practice most domain models are `z.infer<typeof schema>` (a `type`). `interface extends` over `&` for composition (`extends` errors on conflicts; `&` silently → `never`).
- **Banned habits:** `any` (use `unknown` + narrow — `catch` is already `unknown`) · non-null `!` (use a guard / `?? throw`) · `as` assertions by review (prefer `satisfies`/narrowing/zod; ID casts need a clear boundary reason); `as any as T` is a hard no.
- **`@total-typescript/ts-reset` is on** — one root `reset.d.ts` pulled into every package's compilation via `tsconfig.base.json`'s `include` (`${configDir}/../../reset.d.ts`). It hardens dishonest built-ins: `JSON.parse()` / `Response.json()` return `unknown` (you MUST narrow — pairs with the zod-at-the-boundary rule), `[].filter(Boolean)` strips `null`/`undefined` from the result type, `Array.includes`/`Set.has` widen correctly. Write code expecting these stricter signatures. Declaration-only, zero runtime cost. Its sibling `platform.d.ts` rides the same mechanism for the opposite job — declaring runtime surfaces the lib is MISSING (§9).

## 5. `erasableSyntaxOnly` — the forbidden set (+ erasable replacement)

The compiler flag catches most of these; it does not catch decorators. Do not use decorators: Node's type stripping does not provide their runtime.

| Forbidden | Why | Replacement |
| - | - | - |
| `enum` / `const enum` | emits a runtime object / inlines (a transform); `const enum` also fights `isolatedModules` | `as const` object + derived union (the keystone) |
| `namespace`/`module` with runtime members | emits an IIFE object | ESM modules; `export type` barrels |
| constructor **parameter properties** (`constructor(public x)`) | generates field assignments | declare the field + assign in the body |
| `import x = require()` / `export =` | CommonJS, not ESM (also fights `verbatimModuleSyntax`) | `import`/`export` (+ `import type`) |
| `<T>expr` angle-bracket assertion | not erasable; illegal in `.tsx` anyway | `expr as T` |
| **decorators — legacy AND Stage-3** | not erasable; node's type-stripping has no decorator runtime → **runtime error**. The `erasableSyntaxOnly` flag does NOT flag them | function composition / zod validation; **NO `reflect-metadata` DI**. |

## 6. Classes vs factory services

Default to **composed factory functions** (our service style). Classes carry runtime `this`-binding hazards
and structural-typing surprises — reserve them for genuine identity/inheritance or built-in subclassing
(`extends Error`). Erasable-safe class bits when a class IS warranted: `readonly` fields, **`#private`
(hard-private; prefer over `private`)**, `override` + `noImplicitOverride`, `abstract`, `implements`,
`this`-type guards, `declare` fields. **Not** allowed: parameter properties (§5).

## 7. Async generators for streaming (SSE / scripted runner)

Generators are pure runtime JS (`async function*`) — fully erasable, the right primitive for model-output
streaming. Type the stream as `AsyncIterable<Chunk>` / `AsyncGenerator<Chunk>`; consume with
`for await`. **AbortSignal:** thread it in, wrap the loop in `try/finally` so `finally` releases the
upstream reader on early break/abort, and check `signal.throwIfAborted()` per iteration. The consumer
breaking the `for await` (or calling `.return()`) triggers the generator's `finally` — that's the SSE
socket-teardown hook. Adapt a fetch `ReadableStream` SSE body via its native `[Symbol.asyncIterator]`.

## 8. Declaration-file do's, as house rules (apply to our app code)

From the handbook's `.d.ts` do's-and-don'ts — worth enforcing even though we author app code:

- `void` (not `any`) for ignored-callback return types; `unknown` (not `any`) for "accept anything".
- **Non-optional** callback params; **union params over arg-position overloads** (`f(x: number | string)` not two sigs — overloads break pass-through callers); optional params over trailing-arg overloads.
- Never the boxed types (`Number`/`String`/`Object`); lowercase primitives + `object`. No generic that doesn't use its type param.

## 9. Platform primitives — the ADOPT / CONSIDER / AVOID register

**The platform is node 26 / V8 14.6, and the modern spelling is THE spelling** (owner-ruled posture). This register is not "adopt when convenient": a hand-rolled equivalent of anything in ADOPT is a defect. Typing floor: `tsconfig.base.json` carries `lib: ["es2025", "esnext.disposable"]` and the repo-root `platform.d.ts` declares the V8 14.6 surfaces TypeScript's libs do not ship yet (`Map`/`WeakMap.getOrInsert(Computed)`, `Error.isError`, `Iterator.concat`) — delete a block there when the lib catches up; the duplicate-declaration error IS the reminder.

**ADOPT.** `node:timers/promises` `setTimeout` (never `new Promise` + `setTimeout` sleeps) · `x.toSorted(fn)` (never `[...x].sort(fn)`) · Set algebra `union`/`intersection`/`difference`/`isSubsetOf` · `Object.groupBy` / `Map.groupBy` · `Promise.withResolvers` · `Map.getOrInsert` / `getOrInsertComputed` · `RegExp.escape` — never a hand-rolled `escapeRegExp`; the program's W4 deletes the kit one and its consumers · `Error.isError` at unknown-boundaries — specifically the `kit/error-message` seam, so ~50 consumers inherit cross-realm correctness · `.at(-1)` · `findLast` · `Array.fromAsync` (accumulate-then-return only) · Iterator helpers when the chain is iterator-terminal · `using` / `await using` for every disposal-shaped resource ⚙️ (biome `useDisposables`) · `AbortSignal.timeout` / `AbortSignal.any` per the rubric below · `structuredClone` · `util.parseEnv`.

**CONSIDER.** `getOrInsertComputed` vs plain `getOrInsert` — use the computed form only when the factory has cost or effects · Iterator helpers on a sort-terminal chain: the sort materializes anyway, so convert only a filter/map prefix that drops a real intermediate array, else keep · get-or-set shapes whose SET path differs from the GET path (TTL, eviction) stay hand-written.

**AVOID.**

- `node:sqlite` — sync-only, and the libSQL PRAGMA/transaction knowledge in `db/client/index.ts` is driver-specific and hard-won; a swap re-derives it for a worse concurrency model.
- Web Storage APIs in node.
- Hand-rolled sleeps, regex escapes, deferred-promise captures, and set algebra — the modern spelling exists for each, above.
- `Date.parse` hand-rolls where the `kit/time` seam exists. (luxon still backs that seam; Temporal is blocked on Safari, the ONE deferral, and it carries its trigger.)

**Abort rubric** (per site, not blanket): a pure timeout race → `AbortSignal.timeout` on the operation · merging an external signal with an internal one → `AbortSignal.any([...])` · a forward that runs real CLEANUP on abort → keep the listener and say why inline · a deadline that must not hold the process open → keep a manual `setTimeout(...).unref()` composed via `AbortSignal.any` (`infra/network/egress.ts` is the sanctioned archetype — `AbortSignal.timeout` cannot unref; a declared platform limitation, not our debt).

**Not our realm:** the QuickJS membrane's guest values are `ctx.dump()` products, not `Error` instances of any realm — `Error.isError` is WRONG there, and its deferreds are `ctx.newPromise()`, not `Promise.withResolvers` candidates.

## 10. Compiler worlds

Typecheck each file under the environment its code uses. Node, ISO and DOM declarations are not interchangeable. Component type contracts require DOM declarations; browser behavior requires a browser test. Use the owning TypeScript project rather than compiling a source file in isolation.

## String-union dispatch discipline (spine §7.5)

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. Without a
canonical home an axis gets re-spelled inline at every dispatch site, so adding one variant means finding
and updating every dispatch site by hand.

**The pattern to copy:** `workloads.kind` dispatches through `WorkloadContributions:
{ readonly [K in WorkloadKind]: WorkloadContribution<K> }`, asserted exhaustive and duplicate-free by
`keyByKind` at the compose door (`entry/compose/workload-contributions.ts`, D117) — a **mapped-type
Record**, so a missing kind is a hard compile error. `routing.api`/`source` runner switches use
typed-return / `assertNever`.

**The rule:** every axis has (a) ONE importable canonical union/tuple (no inline re-spelling),
and (b) a mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build).
Orbweaver's axes use this shape (`MESSAGE_ROLES`, `USER_ROLES`, `AUTH_MODES` + `MODE_RESOLVERS`, `WorkloadKind` + `WorkloadContributions`, …). D333 retires custom duplicate-union detection; the compiler still catches missing mapped-`Record` members.

**Coincident axes still get two tuples.** Two axes whose members happen to coincide (for example a
contracts-side tuple and its `@orb/ui` counterpart) each get their own `as const` tuple; neither derives
from the other. The coincidence is exactly what breaks the day one axis grows and the other does not. A
contracts-to-ui pair is forced apart by the package cake regardless (`@orb/ui` depends only on
`@orb/kit`, so it cannot import the `@orb/contracts` half at resolve time even if it wanted to derive
from it). Keep independent tuples when two axes happen to have the same members.
