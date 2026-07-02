# GritQL lint plugins

Custom AST gates Biome runs via the `plugins` array in `biome.json` (single-file pattern rules that
`tsc`, dependency-cruiser, and Biome's built-ins can't ergonomically express). **All are active and
fire as `error`** — turned on greenfield, before the code exists, so the code is born compliant.

> **Biome 2.5.1 GritQL note:** node-kind matchers are **PascalCase** — `JsDecorator()`, `JsxAttribute()`
> (NOT snake_case `js_decorator()` — that fails to compile). Snippet patterns (backticks) are casing-free.

## Conventions enforced (decided)

| Rule | Catches | Convention |
| --- | --- | --- |
| `no-raw-id` | Zod `*Id` as raw `z.string()` | branded `typeid` (`@orb/kit/ids`) |
| `no-loose-id-cast` | `as never` / `as unknown as <XId>` | no brand laundering |
| `no-mint-via-cast` | `castId(<generator>)` | mint via `mintTypeId`/`newId` |
| `no-await-db-in-loop` | `await db.<query>` in a loop | N+1 → batch |
| `no-raw-intl-time` | `Intl.{DateTimeFormat,RelativeTimeFormat}` | the `@orb/kit/time` seam |
| `no-raw-clock` | `Date.now()` / `new Date()` (no-arg) | the injected clock (determinism) |
| `no-if-is-group` | `isGroup` identity boolean | unified group chat (solo = degenerate) |
| `no-context-returntype` | `ReturnType<>` in `context.ts` | DI bundle = explicit interface (§7.4) |
| `no-decorators` | any decorator (`JsDecorator()`) | erasable-only (compiler-silent!) |
| `no-inline-types` | exported `type`/`z.object/enum/discriminatedUnion` outside a type home | types-in-contract (§7.4) |
| `persistence-no-in-memory-state` | `Map`/`Set` in `persistence/` | persistence = queries-only (§7) |

## Client conventions enforced (orbweaver client, committed now)

Activated before the client is built — they commit orbweaver's client to: a Tailwind **intent-token**
system, layout primitives, TanStack Form (`_shared/form`), and a `surfaces/`↔`hooks/` split.

| Rule | Catches |
| --- | --- |
| `no-color-literals` | hex (`text-[#abc]`) in `className`/`cn`/`clsx`/`cva` |
| `no-raw-z-index` | raw `z-N` in `className` (client substrate scope) |
| `no-raw-spacing-in-features` | raw `gap-N`/`p[xy]-N`/`m-N` in `className` |
| `no-raw-typography-in-features` | raw `text-{sm,lg,…}` font-size in `className` |
| `no-chat-trpc-in-surface` | `trpc.chat.<verb>.mutationOptions` in a `surfaces/` file |
| `no-direct-useform` | TanStack `useForm`/`createFormHook` outside `_shared/form` |
| `no-form-state-in-useeffect` | `useEffect` dep-array reading `form.state.values`/`store` |
| `no-inline-optimistic-in-surface` | `cancelQueries`/`setQueryData` in a `surfaces/` file |

These fire zero times today (no client code) but are armed. Their diagnostic *messages* and `Refs:` now
point at the real orbweaver homes — the token set in `packages/ui/src/styles/theme.css` and the
`docs/architecture/core/UI-*.md` convention docs — not the retired neo `src/client/AGENTS.md` paths.

## Intentionally NOT a gate

- **`no-raw-id-mint`** (blanket ban on raw `crypto.randomUUID()`/`nanoid()`) — declined: it over-fires on
  legitimate non-id uses (request ids, nonces, idempotency keys). The dangerous path — laundering a raw
  value into a branded id — is already covered by `no-raw-id` + `no-loose-id-cast` + `no-mint-via-cast`.
- **`no-inline-union-redecl`** — needs the axis registry → a ts-morph script in the gate suite, not a grit.
