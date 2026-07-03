# Orbweaver — Spine: TypeScript & Patterns (Types, Schemas, Dispatch)

> **Status: planning (authoritative detail).** This is the CANONICAL cross-cutting Spine document for
> spine threads §7.4 (types & schemas) AND §7.5 (string-union dispatch) — cited elsewhere as "the §7.4
> rule" / "spine §7.5" / `AGENTS-2-Spine.md` §7.4/§7.5, which point here. The gates the two threads
> feed (`no-inline-types`, `no-inline-union-redecl`, `exhaustive-dispatch`) are referenced throughout.

## Types & schemas — one home, one direction, no inline (spine §7.4)

The problem: a shape's "home" is ambiguous — drizzle schema in `db`, re-declared/re-exported in `shared`,
each domain has its own `contract/`, and the client needs some shapes for client-side validation. So
shapes get duplicated and inline types/schemas sprout everywhere. The target rule (**one home per shape,
derived by who needs it; flows DOWN only**):

| Shape kind | Home | Consumers (down only) |
| - | - | - |
| **DB row** | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS) | server, client, other domains |
| **domain-internal** | that domain's `contract/` (params/results/views/errors) | only that domain |
| **client-only view** | client | client |
| **pure primitive shape** | `kit` | anyone (it's the bottom) |

**The gate — `no-inline-types`:** no exported `type`/`interface`/`z.object` (and no structural cast)
declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / `kit`. Inline shapes in `verbs/`,
`persistence/`, `service.ts`, transport, or client components are RED. This is the enforced version of
"no schemas or types outside their proper places." Readers flag every leak (§6B `inlineTypes`); the
spine doc defines the exact gate.

---

## House TypeScript style

*The opinionated conventions (TS 6.0, strict everything, ESM, `erasableSyntaxOnly`, branded `typeid` IDs, zod, the package cake) — distilled from a full read of the TypeScript handbook against our actual constraints. ⚙️ = gate- or biome-enforced. The enforcement machinery itself (biome ratchet, GritQL plugins, tsconfig fast-lane) is catalogued in `Core-Laws-and-Precedents.md`'s Enforcement registry; this section is the "how we write it" reference those gates protect.*

The keystone everything hangs on: a string axis is an `as const` tuple; its union is **derived**, never re-spelled; dispatch is a total `Record` or ends in `assertNever` (⚙️ `no-inline-union-redecl`, `exhaustive-dispatch` — see the home-rule + gate above).

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
- **Banned habits ⚙️ (biome):** `any` (use `unknown` + narrow — `catch` is already `unknown`) · non-null `!` (use a guard / `?? throw`) · single `as` assertions (use `satisfies`/narrowing/zod); `as any as T` is a hard no.
- **`@total-typescript/ts-reset` is on (root `reset.d.ts`, all 5 packages).** It hardens dishonest built-ins: `JSON.parse()` / `Response.json()` return `unknown` (you MUST narrow — pairs with the zod-at-the-boundary rule), `[].filter(Boolean)` strips `null`/`undefined` from the result type, `Array.includes`/`Set.has` widen correctly. Write code expecting these stricter signatures. Declaration-only, zero runtime cost. (`Core-Laws-and-Precedents.md` fast-lane.)

## 5. `erasableSyntaxOnly` — the forbidden set (+ erasable replacement)

The compiler flag catches most of these; **decorators it does NOT catch** — they need a lint gate.

| Forbidden | Why | Replacement |
| - | - | - |
| `enum` / `const enum` | emits a runtime object / inlines (a transform); `const enum` also fights `isolatedModules` | `as const` object + derived union (the keystone) |
| `namespace`/`module` with runtime members | emits an IIFE object | ESM modules; `export type` barrels |
| constructor **parameter properties** (`constructor(public x)`) | generates field assignments | declare the field + assign in the body |
| `import x = require()` / `export =` | CommonJS, not ESM (also fights `verbatimModuleSyntax`) | `import`/`export` (+ `import type`) |
| `<T>expr` angle-bracket assertion | not erasable; illegal in `.tsx` anyway | `expr as T` |
| **decorators — legacy AND Stage-3** ⚙️ | not erasable; node's type-stripping has no decorator runtime → **runtime error**. The `erasableSyntaxOnly` flag does NOT flag them | function composition / zod validation; **NO `reflect-metadata` DI**. Needs a `no-decorators` biome rule (the compiler is silent here). |

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

---

## String-union dispatch discipline (spine §7.5)

*Moved here 2026-07-03 from `AGENTS-2-Spine.md` §7.5 (which now points here).*

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. The AST dispatch
scout **quantified the "touch N spots to add one variant" pain** in neo-tavern
(`reports/dispatch-scout.json`; the full scan record: `../history/Grounded-Intelligence-AST-Scan.md`):

| axis | touch-count | shape of the rot |
| - | - | - |
| `messageRole` (system/user/assistant) | **132** | 3 competing canonical const-arrays + 116 inline re-spellings; no importable union |
| `users.role` (admin/user) | 35 | no exported `UserRole` union → 33 inline `"admin"\|"user"` re-decls |
| `guidedAction` (6) | 23 | 14 redecls + 4 **untyped** `Record`s (no exhaustiveness backstop) |
| `routing.source` (4) | **18** | **the user's lived pain, MEASURED** — 11 inline re-decls of the source union (dispatch IS gated; the cost is pure re-declaration) |
| `routing.api` (3) | 12 | 9 inline re-decls (dispatch fully `assertNever`-gated) |

**The GOLD STANDARD to copy (already right in neo, carried into orbweaver's `workloads`):**
`workloads.kind` dispatches through `RUNNERS: { [K in WorkloadKind]: Runner<K> }` — a **mapped-type
Record**, so a missing kind is a hard `tsc` error. `routing.api`/`source` runner switches use
typed-return / `assertNever`.

**The rule:** every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated),
and (b) a mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build). The
leaky axes (`messageRole` switches, `guidedAction` untyped Records, the `authMode`/`runner` if-chains)
convert to that shape. Gates: **`no-inline-union-redecl` + `exhaustive-dispatch`**
(`Core-0-Architecture-and-Structure.md §7`; catalog: `Core-Laws-and-Precedents.md`).
