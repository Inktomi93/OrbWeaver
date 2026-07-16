---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — Spine: TypeScript & Patterns (Types, Schemas, Dispatch)

Canonical doc for spine §7.4 (types & schemas) and §7.5 (string-union dispatch) — cited elsewhere as "the §7.4 rule" / "spine §7.5"; `AGENTS.md` §5.4/§5.5 point here. The gates are LIVE: `no-inline-types` (`scripts/check/gates/`), `no-inline-union-redecl` (`scripts/check/gates/`), `exhaustive-dispatch` (compile-time by construction — the mapped-`Record`/`assertNever` pattern below; constitution row in `Core-0-Architecture-and-Structure.md §7`).

## Types & schemas — one home, one direction, no inline (spine §7.4)

The rule: **one home per shape, derived by who needs it; flows DOWN only.** (Neo's failure mode: the home was ambiguous, so shapes duplicated and inline types sprouted everywhere.)

| Shape kind | Home | Consumers (down only) |
| - | - | - |
| **DB row** | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS) | server, client, other domains |
| **domain-internal** | that domain's `contract/` (params/results/views/errors) | only that domain |
| **client-only view** | client | client |
| **pure primitive shape** | `kit` | anyone (it's the bottom) |

**The gate — `no-inline-types` (ts-morph, live):** no exported `type`/`interface`/`z.object` (and no structural cast) declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / `kit`. Inline shapes in `verbs/`, `persistence/`, `service.ts`, transport, or client components are RED. Companion: `types-in-contract` (`scripts/check/gates/`) requires each feature's `contract/service.ts` to declare its exported service interface and bans exported `ReturnType<typeof fn>` for `context.ts`.

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
- **`interface` for hand-authored object shapes, `type` for unions/aliases** — but in practice most domain models are `z.infer<typeof schema>` (a `type`). `interface extends` over `&` for composition (`extends` errors on conflicts; `&` silently → `never`).
- **Banned habits:** `any` ⚙️ (use `unknown` + narrow — `catch` is already `unknown`) · non-null `!` ⚙️ (`noNonNullAssertion`; use a guard / `?? throw`) · `as` assertions by review (prefer `satisfies`/narrowing/zod; ID casts hard-gated by the `no-loose-id-cast`/`no-mint-via-cast` gates); `as any as T` is a hard no.
- **`@total-typescript/ts-reset` is on** — one root `reset.d.ts` pulled into every package's compilation via `tsconfig.base.json`'s `include` (`${configDir}/../../reset.d.ts`). It hardens dishonest built-ins: `JSON.parse()` / `Response.json()` return `unknown` (you MUST narrow — pairs with the zod-at-the-boundary rule), `[].filter(Boolean)` strips `null`/`undefined` from the result type, `Array.includes`/`Set.has` widen correctly. Write code expecting these stricter signatures. Declaration-only, zero runtime cost.

## 5. `erasableSyntaxOnly` — the forbidden set (+ erasable replacement)

The compiler flag catches most of these; **decorators it does NOT catch** — they need a lint gate.

| Forbidden | Why | Replacement |
| - | - | - |
| `enum` / `const enum` | emits a runtime object / inlines (a transform); `const enum` also fights `isolatedModules` | `as const` object + derived union (the keystone) |
| `namespace`/`module` with runtime members | emits an IIFE object | ESM modules; `export type` barrels |
| constructor **parameter properties** (`constructor(public x)`) | generates field assignments | declare the field + assign in the body |
| `import x = require()` / `export =` | CommonJS, not ESM (also fights `verbatimModuleSyntax`) | `import`/`export` (+ `import type`) |
| `<T>expr` angle-bracket assertion | not erasable; illegal in `.tsx` anyway | `expr as T` |
| **decorators — legacy AND Stage-3** ⚙️ | not erasable; node's type-stripping has no decorator runtime → **runtime error**. The `erasableSyntaxOnly` flag does NOT flag them | function composition / zod validation; **NO `reflect-metadata` DI**. Gated by `scripts/check/gates/no-decorators.ts` (the compiler is silent here). |

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

## String-union dispatch discipline (spine §7.5)

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. Without a
canonical home an axis gets re-spelled inline at every dispatch site, so adding one variant turns into a
scavenger hunt across dozens of files — the neo-tavern pain that motivated this rule, quantified per-axis
in `../history/spine-typescript-archaeology-record.md`.

**The GOLD STANDARD to copy:** `workloads.kind` dispatches through `RUNNERS: { [K in WorkloadKind]:
Runner<K> }` (`domain/workloads/substrate/dispatch.ts`) — a **mapped-type Record**, so a missing kind is
a hard compile error. `routing.api`/`source` runner switches use typed-return / `assertNever`.

**The rule:** every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated),
and (b) a mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build).
Orbweaver's axes are born this shape (`MESSAGE_ROLES`, `USER_ROLES`, `AUTH_MODES` + `MODE_RESOLVERS`, `WorkloadKind` + `RUNNERS`, …). Gates: **`no-inline-union-redecl` + `exhaustive-dispatch`**
(`Core-0-Architecture-and-Structure.md §7`; catalog: `Core-Enforcement-Active-Gates.md`).
