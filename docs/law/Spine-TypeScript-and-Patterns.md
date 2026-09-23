---
kind: law
status: active
updated: 2026-08-03
---

# Orbweaver — Spine: TypeScript & Patterns (Types, Schemas, Dispatch)

Canonical doc for spine §7.4 (types & schemas) and §7.5 (string-union dispatch) — cited elsewhere as "the §7.4 rule" / "spine §7.5"; `Constitution.md` §5 points here. The gates are LIVE: `no-inline-types` (`tooling/src/verify/gates/`), `no-inline-union-redecl` (`tooling/src/verify/gates/`), `exhaustive-dispatch` (compile-time by construction — the mapped-`Record`/`assertNever` pattern below; constitution row in `Core-0-Architecture-and-Structure.md §7`).

## Types & schemas — one home, one direction, no inline (spine §7.4)

The rule: **one home per shape, derived by who needs it; flows DOWN only.** (Neo's failure mode: the home was ambiguous, so shapes duplicated and inline types sprouted everywhere.)

| Shape kind | Home | Consumers (down only) |
| - | - | - |
| **DB row** | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS) | server, client, other domains |
| **domain-internal** | that domain's `contract/` (params/results/views/errors) | only that domain |
| **package-internal** | that package's sanctioned `src/contract/` (`@orb/inference` today) | only that package and its public root |
| **client-only view** | client | client |
| **pure primitive shape** | `kit` | anyone (it's the bottom) |

**The gate — `no-inline-types` (ts-morph, live):** no exported `type`/`interface`/`z.object` (and no structural cast) declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / a sanctioned package `src/contract/` / `kit`. Inline shapes in `verbs/`, `persistence/`, `service.ts`, transport, or client components are RED. Companion: `types-in-contract` (`tooling/src/verify/gates/`) requires each feature's `contract/service.ts` to declare its exported service interface and bans exported `ReturnType<typeof fn>` for `context.ts`.

## House TypeScript style

The opinionated conventions (TS 6.0.x, strict everything, ESM, `erasableSyntaxOnly`, branded `typeid` IDs, zod, the package cake). `pnpm typecheck` runs on **tsgo** — the TS7 native-preview compiler (`@typescript/native-preview`), not classic `tsc`. Raw `tsc <file>` is a hard TS5112 error since TS 6, so per-file type checks are project-scoped `tsgo -p <owning tsconfig>` (the `.claude/hooks/biome-check.sh` type leg). ⚙️ = gate- or biome-enforced; the enforcement machinery is catalogued in `Core-Enforcement-Active-Gates.md`. This section is the "how we write it" reference those gates protect.

## 1. The keystone

A string axis is an `as const` tuple; its union is **derived**, never re-spelled; dispatch is a total `Record` or ends in `assertNever` (⚙️ `no-inline-union-redecl` + `exhaustive-dispatch` — see the home-rule + gates above).

## 2. Utility types — the policy

**ADOPT.** `Record<Union,V>` (the dispatch primitive — keeps dot access under `noPropertyAccessFromIndexSignature`, errors on missing keys with `satisfies`) · `Awaited<T>` (unwrap promises, don't hand-roll `infer`) · `Pick<T,K>` (project a contract type; keys are checked, renames propagate) · `NonNullable<T>` (post-guard strip) · `Uppercase/Capitalize/…` (ONLY for type-level key derivation with template literals).

**CONSIDER.** `Readonly<T>` (shallow only — prefer authoring `readonly` props in `contract/`) · `Partial<T>` (patch payloads — but prefer a real zod patch schema so it's validated) · `Required<T>` · `Exclude`/`Extract` (union algebra on discriminants — distributive, collapses to `never` if the filter is wrong) · `Parameters<T>`/`InstanceType<T>` (only to mirror code we don't own) · `NoInfer<T>` (stop a default/2nd arg widening an inferred param in generic factories).

**AVOID.**

- `ReturnType<typeof fn>` as an **exported** type — ⚙️ banned for `context.ts` (`types-in-contract`); author the boundary type by hand. OK only as a module-local alias or to mirror a third-party fn.
- `Omit<T,K>` — two traps: (1) **does not distribute over unions** → silently flattens a discriminated union, dropping variant fields; (2) keys aren't validated. Prefer **`Pick` (allow-list)** in `contract/`.
- `ThisType`/`ThisParameterType`/`OmitThisParameter` — OOP/`this`-binding tools orthogonal to our functional+zod style.

## 3. Narrowing — house style

**ADOPT.** Discriminated unions (literal `kind` per variant — the canonical model shape; `z.discriminatedUnion` infers straight into them; always over one-type-with-optional-fields) · `assertNever` in every `switch` default ⚙️ (`exhaustive-dispatch`) · **`satisfies`** broadly (validate-without-widening; replaces most `as`) · user-defined guards `x is T` (but at a **trust boundary use a zod `.safeParse`** guard — predicates can lie, zod validates) · `in` / `typeof` / `instanceof` (remember `typeof null === "object"`).

**CONSIDER.** Assertion functions `asserts x is T` for invariants (`assertDefined`) — compiler trusts them blindly, keep bodies honest, prefer zod at I/O edges · loose `!= null` (strips null+undefined in one check — the sanctioned `==` exception).

**AVOID.** Truthiness narrowing on `string`/`number` (`if (str)` eats `""`; `if (n)` eats `0`/`NaN`) — require explicit `!== undefined` / `!= null` · cast-based guard bodies (`(x as Fish).swim`) — use `in` or zod inside.

## 4. Objects & nullability under our strict flags

- **`readonly` by default** on contract surfaces (`readonly T[]`); assignment is one-way, safe.
- **`Record<LiteralUnion,V>` over index signatures** (index sigs force bracket access under `noPropertyAccessFromIndexSignature` + lose key safety); **`Map` for open/dynamic keys** (`.get()` is `V | undefined`, matching `noUncheckedIndexedAccess`).
- **`?` vs `| undefined` are NOT interchangeable under `exactOptionalPropertyTypes`**: `x?: T` = may be **absent** (can't pass explicit `undefined`); `x: T | undefined` = must be **present**, may be undefined. Choose by intent — default `?` for genuinely-absent fields.
- **Make a field required and nullable (`x: T | null`) when a reader would take its absence as a default.** Every producer then states the value, even as `null`. Example: `ChatResult.appliedEffort` in `packages/inference/src/contract/chat.ts`. As an optional field, an absent value would read as the requested effort.
- **`interface` for hand-authored object shapes, `type` for unions/aliases** — but in practice most domain models are `z.infer<typeof schema>` (a `type`). `interface extends` over `&` for composition (`extends` errors on conflicts; `&` silently → `never`).
- **Banned habits:** `any` ⚙️ (use `unknown` + narrow — `catch` is already `unknown`) · non-null `!` ⚙️ (`noNonNullAssertion`; use a guard / `?? throw`) · `as` assertions by review (prefer `satisfies`/narrowing/zod; ID casts hard-gated by the `no-loose-id-cast`/`no-mint-via-cast` gates); `as any as T` is a hard no.
- **`@total-typescript/ts-reset` is on** — one root `reset.d.ts` pulled into every package's compilation via `tsconfig.base.json`'s `include` (`${configDir}/../../reset.d.ts`). It hardens dishonest built-ins: `JSON.parse()` / `Response.json()` return `unknown` (you MUST narrow — pairs with the zod-at-the-boundary rule), `[].filter(Boolean)` strips `null`/`undefined` from the result type, `Array.includes`/`Set.has` widen correctly. Write code expecting these stricter signatures. Declaration-only, zero runtime cost. Its sibling `platform.d.ts` rides the same mechanism for the opposite job — declaring runtime surfaces the lib is MISSING (§9).

## 5. `erasableSyntaxOnly` — the forbidden set (+ erasable replacement)

The compiler flag catches most of these; **decorators it does NOT catch** — they need a lint gate.

| Forbidden | Why | Replacement |
| - | - | - |
| `enum` / `const enum` | emits a runtime object / inlines (a transform); `const enum` also fights `isolatedModules` | `as const` object + derived union (the keystone) |
| `namespace`/`module` with runtime members | emits an IIFE object | ESM modules; `export type` barrels |
| constructor **parameter properties** (`constructor(public x)`) | generates field assignments | declare the field + assign in the body |
| `import x = require()` / `export =` | CommonJS, not ESM (also fights `verbatimModuleSyntax`) | `import`/`export` (+ `import type`) |
| `<T>expr` angle-bracket assertion | not erasable; illegal in `.tsx` anyway | `expr as T` |
| **decorators — legacy AND Stage-3** ⚙️ | not erasable; node's type-stripping has no decorator runtime → **runtime error**. The `erasableSyntaxOnly` flag does NOT flag them | function composition / zod validation; **NO `reflect-metadata` DI**. Gated by `tooling/src/verify/gates/no-decorators.ts` (the compiler is silent here). |

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

**The platform is node 26 / V8 14.6, and the modern spelling is THE spelling** (owner-ruled posture). This register is not "adopt when convenient": a hand-rolled equivalent of anything in ADOPT is a defect, and the burn-down that removed the existing ones is that program's W3/W4. Typing floor: `tsconfig.base.json` carries `lib: ["es2025", "esnext.disposable"]` and the repo-root `platform.d.ts` declares the V8 14.6 surfaces TypeScript's libs do not ship yet (`Map`/`WeakMap.getOrInsert(Computed)`, `Error.isError`, `Iterator.concat`) — delete a block there when the lib catches up; the duplicate-declaration error IS the reminder.

**ADOPT.** `node:timers/promises` `setTimeout` (never `new Promise` + `setTimeout` sleeps) · `x.toSorted(fn)` (never `[...x].sort(fn)`) · Set algebra `union`/`intersection`/`difference`/`isSubsetOf` · `Object.groupBy` / `Map.groupBy` · `Promise.withResolvers` · `Map.getOrInsert` / `getOrInsertComputed` · `RegExp.escape` — never a hand-rolled `escapeRegExp`; the program's W4 deletes the kit one and its consumers · `Error.isError` at unknown-boundaries — specifically the `kit/error-message` seam, so ~50 consumers inherit cross-realm correctness · `.at(-1)` · `findLast` · `Array.fromAsync` (accumulate-then-return only) · Iterator helpers when the chain is iterator-terminal · `using` / `await using` for every disposal-shaped resource ⚙️ (biome `useDisposables`) · `AbortSignal.timeout` / `AbortSignal.any` per the rubric below · `structuredClone` · `util.parseEnv`.

**CONSIDER.** `getOrInsertComputed` vs plain `getOrInsert` — the computed arm only when the factory has cost or effects · Iterator helpers on a sort-terminal chain: the sort materializes anyway, so convert only a filter/map prefix that drops a real intermediate array, else keep · get-or-set shapes whose SET path differs from the GET path (TTL, eviction) stay hand-written.

**AVOID.**

- `node:sqlite` — sync-only, and the libSQL PRAGMA/transaction knowledge in `db/client/index.ts` is driver-specific and hard-won; a swap re-derives it for a worse concurrency model.
- Web Storage APIs in node.
- Hand-rolled sleeps, regex escapes, deferred-promise captures, and set algebra — the modern spelling exists for each, above.
- `Date.parse` hand-rolls where the `kit/time` seam exists. (luxon still backs that seam; Temporal is blocked on Safari, the ONE deferral, and it carries its trigger.)

**Abort rubric** (per site, not blanket): a pure timeout race → `AbortSignal.timeout` on the operation · merging an external signal with an internal one → `AbortSignal.any([...])` · a forward that runs real CLEANUP on abort → keep the listener and say why inline · a deadline that must not hold the process open → keep a manual `setTimeout(...).unref()` composed via `AbortSignal.any` (`infra/network/egress.ts` is the sanctioned archetype — `AbortSignal.timeout` cannot unref; a declared platform limitation, not our debt).

**Not our realm:** the QuickJS membrane's guest values are `ctx.dump()` products, not `Error` instances of any realm — `Error.isError` is WRONG there, and its deferreds are `ctx.newPromise()`, not `Promise.withResolvers` candidates.

## 10. Compiler worlds and derived tool configuration

Every authored TypeScript file has an intended world (ISO, Node or DOM) and exactly one primary compiler program. The facts have one home each:

| Fact | Home |
| - | - |
| Intended world and primary owner | `tooling/src/_shared/project-worlds.ts` |
| Test kinds, compiler intent and mirror rules | `tooling/src/_shared/test-kinds.ts` |
| Generated world templates and runnable configs | `tooling/src/_shared/type-config-intent.ts` |
| Compiler roots, references and inherited inputs | `tooling/src/verify/lib/policy-program-membership.ts` |
| Native import closures and the membership report | `tooling/src/verify/ops/tests-type-membership.ts` |
| File-to-program routing for the hook and scoped verification | `tooling/src/verify/ops/typecheck-plan.ts` |

Why the worlds are separate programs:

- Being in some program does not prove the file is in the right one, and a correct root does not prove its import closure fits the world. The membership stage (`pnpm check:type-ownership`) checks roots, closures and ambient sets against intent, and rejects Node declarations in an ISO program and DOM libraries in an ISO or Node program.
- `types: []` stops automatic ambient inclusion only. An imported declaration can still add Node globals, so ISO acceptance reads the actual declaration closure.
- A Node compile cannot prove a browser contract. React ships fallback DOM declarations that make distinct element, event and ref types look the same, so those contracts need the DOM world.
- A barrel front door such as `#lib`, `#state` or `@orb/ui/lib` must not import a DOM module into a Node-safe closure. Move the DOM half to its owning feature or primitive; never add a generic browser barrel.

How tool configuration is derived:

- Generate only the fields TypeScript forces a child config to restate; hand-author the intent. `node tooling/src/verify/cli.ts baseline type-configs --check` proves the generated configs are fresh.
- Vitest, Playwright, ESLint, dependency-cruiser, Knip, CPD and Stryker read the shared world, test-kind and population facts. A shared glob string does not prove shared meaning; compare each tool's native resolved population with the intended facts.
- A native-config check that cannot follow a moved or generated selector refuses or reads the effective config through the tool's own loader (`node tooling/src/verify/cli.ts config-snapshot vitest <config>`). It never passes silently.
- Keep cheap intent data apart from expensive observations, and never add a second compiler parser in a config or a codemod.
- Compiler world, executor, test purpose and resource needs are separate axes. A long test is not a serial test, and a browser type check runs no browser.

## String-union dispatch discipline (spine §7.5)

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. Without a
canonical home an axis gets re-spelled inline at every dispatch site, so adding one variant turns into a
scavenger hunt across dozens of files — the neo-tavern pain that motivated this rule.

**The GOLD STANDARD to copy:** `workloads.kind` dispatches through `WorkloadContributions:
{ readonly [K in WorkloadKind]: WorkloadContribution<K> }`, asserted exhaustive + duplicate-free by
`keyByKind` at the compose door (`entry/compose/workload-contributions.ts`, D117 — the former
`substrate/dispatch.ts` `RUNNERS` hub is deleted) — a **mapped-type Record**, so a missing kind is
a hard compile error. `routing.api`/`source` runner switches use typed-return / `assertNever`.

**The rule:** every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated),
and (b) a mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build).
Orbweaver's axes are born this shape (`MESSAGE_ROLES`, `USER_ROLES`, `AUTH_MODES` + `MODE_RESOLVERS`, `WorkloadKind` + `WorkloadContributions`, …). Gates: **`no-inline-union-redecl` + `exhaustive-dispatch`**
(`Core-0-Architecture-and-Structure.md §7`; catalog: `Core-Enforcement-Active-Gates.md`).
