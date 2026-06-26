# Orbweaver — `typescript-style`: house TypeScript (mined from the TS handbook)

> **Status: planning (authoritative detail).** The opinionated TypeScript conventions for orbweaver,
> distilled from a full read of the TypeScript handbook against our actual constraints: **TS 6.0, strict
> everything, ESM, `erasableSyntaxOnly`, branded `typeid` IDs, zod, the package cake.** This is the "how
> we write TypeScript" reference. The GATE-level rules live in `spine/types-and-schemas.md §7.4`
> (types-in-contract / no-inline-types) and `spine/string-union-dispatch.md §7.5` (union axes / exhaustive
> dispatch) — this doc **complements, never duplicates** them. ⚙️ = gate- or biome-enforced.

## 1. The keystone (see `spine/string-union-dispatch.md` for the gate)

The one pattern everything else hangs on, repeated here only as the anchor: a string axis is an
`as const` tuple; its union is **derived**, never re-spelled; dispatch is a total `Record` or ends in
`assertNever`. ⚙️ `no-inline-union-redecl`, `exhaustive-dispatch`.

```ts
export const ROLE_VALUES = ["user", "assistant", "system"] as const satisfies readonly Role[];
export type Role = (typeof ROLE_VALUES)[number];
const HANDLERS = { user: …, assistant: …, system: … } satisfies Record<Role, Handler>; // miss a key → tsc error
```

Compose two axes with template-literal types (one derived union, still total): `type Perm = \`${Role}:${Action}\``.

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

## 5. `erasableSyntaxOnly` — the forbidden set (+ erasable replacement)

The compiler flag catches most of these; **decorators it does NOT catch** — they need a lint gate.

| Forbidden | Why | Replacement |
|---|---|---|
| `enum` / `const enum` | emits a runtime object / inlines (a transform); `const enum` also fights `isolatedModules` | `as const` object + derived union (§1) |
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

## 9. tsconfig — adopted now + staged behind triggers

**Adopted (this pass):** `noErrorTruncation`, `resolvePackageJsonExports`, `resolvePackageJsonImports`
(see `tsconfig.base.json`). Everything else from the 6.0 audit is already set (`structure.md` / ledger §7).

**Staged behind a trigger — do NOT set yet:**
- **When we publish a package to npm** → `declaration` + `declarationMap` + `emitDeclarationOnly` +
  `isolatedDeclarations` + `stripInternal` (per-package; emit `.d.ts` only, bundler/tsx own the JS).
- **When per-package `tsc --noEmit` gets slow** → `composite` + `references` + `tsc -b`. NOT before:
  references require emit (`composite`⇒`declaration`), which fights our no-emit/tsx model, and our
  `exports`→`.ts` map already gives cross-package go-to-def + boundary enforcement without them.
- **`customConditions`** / `allowArbitraryExtensions` (client `.css`/asset modules) — only if/when needed.

**Modules notes (so nobody "fixes" the working setup):** `exports` **blocks unlisted subpaths** — anything
importable beyond `src/*` (e.g. `package.json`, a `.css`) needs an explicit `exports` entry. Our `#*`→
`./src/*.ts` points at *source*, so **no `rootDir` is needed** (the imports-field remap only fires for
output targets). `module` must stay `esnext`/`preserve` (paired with `moduleResolution: bundler`), even
though we `noEmit` — it shapes the types you see.

## Gate candidates (this doc)

- ⚙️ **`no-decorators`** (biome) — legacy + Stage-3 decorators are erasable-illegal at runtime but the
  `erasableSyntaxOnly` compiler flag is silent on them. Add to the Phase 0b gate suite.
- ⚙️ **`no-truthiness-narrowing-on-primitive`** (review/lint) — `if (str)` / `if (n)` (§3). Lower priority.
- The `any` / non-null-`!` / `as` bans (§4) are covered by biome `noExplicitAny` + `noNonNullAssertion` (already on).

## Biome — ratcheted to max (2.5.1)

`biome.json` is the source of truth (168 explicit rules beyond `recommended`, mined from a full handbook
pass + neo-tavern's proven set). Meta-decisions worth recording:
- **Domains `project` + `types` + `react` + `test` are mandatory** — the type-aware rules
  (`noFloatingPromises`, `noMisusedPromises`, `useAwaitThenable`, `useExhaustiveSwitchCases`,
  `noBaseToString`, `noUnnecessaryConditions`) **silently no-op** without the `types`/`project` domains.
- **`useLiteralKeys: off`** — it fights our `noPropertyAccessFromIndexSignature` (which *requires*
  `obj["key"]` for index-sig reads). The type-safety flag wins. (neo's hard-won lesson.)
- **Per-language formatter blocks are set fully explicit** — they do NOT inherit the top-level formatter.
- **`useDefaultSwitchClause: off`** — forcing a `default` defeats exhaustive-`never` dispatch (§1).
- `noProcessEnv` error (env only via `foundation/env`); `noConsole` error (allow info/warn/error);
  pino-style logger funnel via `noRestrictedImports` when the logger lands.

**Deferred ratchets** (promote as the codebase matures — recorded so they aren't forgotten):
- `noEmptySource` → enable once placeholders are replaced by real modules (it fires on comment-only stubs).
- `noUnresolvedImports` → enable after confirming it resolves our `#imports`/`exports` (`tsc` covers it meanwhile).
- The **warn-tier** rules (`noUnnecessaryConditions`, `noMagicNumbers`, `noExcessiveCognitiveComplexity@15→10`,
  `useExplicitReturnType`, `useForOf`, `useAtIndex`) → ratchet to `error` once clean.
- **GritQL plugins to author** (Phase 0b, `tools/grit/`): `no-raw-id` + `no-loose-id-cast` +
  `no-mint-via-cast` (branded `typeid` discipline) + `no-await-db-in-loop` (N+1 guard, scope server/db).
  Plus `no-decorators` (the erasable-illegal-but-compiler-silent gate, above).
