---
kind: plan
status: active
updated: 2026-10-31
---

# Find and judge every unwired and dead piece of code

## Goal

Every production symbol, member, field, parameter and union member is reached by production, deleted, or kept with a cited reason. One concept has one home.

## Shape

Ports derive from their owners so references follow the composition root. The unwired scans then report what no production path reaches, from whole exports down to fields, parameters and union members. Each finding is wired, deleted, or kept with a cited ledger reason.

### Order

| Step | Work | Items |
| - | - | - |
| 1 | Derive every port from its owner; rule cross-domain handle passing | the spread-flow ports, [1503](../../work/1503-teach-the-port-census-and-the-derived-port.md) |
| 2 | Judge every member the member scan reports | the unwired-member items the 1439 report boards, [0501](../../work/0501-wire-or-delete-the-unused-prompt-preview-verbs.md), and the possibly dead guards the restoration lanes found |
| 3 | Build the TS 7.1 engine and the dead-inside-live scans | [1447](../../work/1447-extend-pnpm-unwired-ts-7-1-engine-and.md) |
| 4 | Judge the first full run of each new scan; delete synonym aliases from the shapes scan | the items 1447 boards, [1445](../../work/1445-delete-synonym-type-aliases-keep-per-verb-params.md) |
| 5 | Adjudicate unused exports through the package doors | [0989](../../work/0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md) |
| 6 | Hold the domain template with dependency rules | [1443](../../work/1443-enforce-domain-contract-purity-with-a-dependency-cruiser.md), [1423](../../work/1423-move-i-o-out-of-domain-substrate-folders.md), [1463](../../work/1463-chat-persistence-reads-the-assets-characters-and-personas.md) |

## Rejected

A CI gate on scan output, a baseline of accepted findings, and keeping code because it looks deliberate without a cited ruling.

## Coupled sites

docs/adr/0337-owner-built-statements-join-another-domains-batch.md; docs/law/Core-0-Architecture-and-Structure.md §4; tooling/src/unwired/; knip.

## Test plan

Each scan ships fixtures for a found case and a false-positive control. Each deletion keeps the affected suites green; each wiring adds a production-path test.

## First run

The first run of each `pnpm unwired` scan over the whole tree, on the TypeScript 7.1 engine with TypeScript 6 cross-checking. Each finding below has both engines' agreement. A finding is a question for adjudication: wire it, delete it, keep it with a cited reason, or mark it unknown. They are boarded after review, bundled by domain.

### How it ran

| Scan | Command | Report | Scanned | Findings | Deliberate | Disagreements | Wall time | Peak RSS |
| - | - | - | - | - | - | - | - | - |
| members | `pnpm unwired` | `reports/unwired/unwired.json` | 4200 members | 111 | 33 | 0 | 5:41 | 8.4 GB |
| fields | `pnpm unwired fields` | `reports/unwired/fields.json` | 19446 fields | 3384 | 4 | 14 | 19:51 | 9.3 GB |
| params | `pnpm unwired params` | `reports/unwired/params.json` | 16823 callables | 315 | 0 | 4 | 7:54 | 10.3 GB |
| unions | `pnpm unwired unions` | `reports/unwired/unions.json` | 671 tuples | 205 | 0 | 0 | 2:07 | 7.9 GB |
| shapes | `pnpm unwired shapes` | `reports/unwired/shapes.json` | 20450 named types | 667 | 0 | 0 | 0:32 | 3.6 GB |

Each run started with a 1-minute load under 24 on a 24-core box. A disagreement is a finding that engine one made and engine two did not reproduce. It is reported apart and is not in the counts below.

### Members

`pnpm unwired` reports callable members of named types that production code never calls. `builder-only` members have an implementation and no caller, `test-only` members are called only from tests, and `unreferenced` members are never named. A member that a composition root hands into a used port slot counts as reached; the report lists those 64 under `reachedByFlow`.

| Domain | `builder-only` | `test-only` | `unreferenced` | Total |
| - | - | - | - | - |
| `contracts` | 11 | 3 | 3 | 17 |
| `server/domain/chat` | 6 | 10 | 0 | 16 |
| `server/entry` | 4 | 4 | 0 | 8 |
| `inference` | 5 | 2 | 0 | 7 |
| `kit` | 4 | 3 | 0 | 7 |
| `server/infra` | 4 | 2 | 1 | 7 |
| `client/forms` | 3 | 0 | 1 | 4 |
| `server/domain/connection` | 3 | 1 | 0 | 4 |
| `server/domain/discovery` | 4 | 0 | 0 | 4 |
| `client/features/plugin` | 3 | 0 | 0 | 3 |
| `server/domain/sessions` | 2 | 1 | 0 | 3 |
| `server/transport` | 3 | 0 | 0 | 3 |
| `client/data` | 2 | 0 | 0 | 2 |
| `client/features/chat` | 2 | 0 | 0 | 2 |
| `server/domain/import` | 2 | 0 | 0 | 2 |
| `server/domain/plugin` | 2 | 0 | 0 | 2 |
| `server/domain/rpg` | 1 | 0 | 1 | 2 |
| `server/domain/share` | 1 | 1 | 0 | 2 |
| `ui` | 2 | 0 | 0 | 2 |
| `client/features/credentials` | 1 | 0 | 0 | 1 |
| `client/features/discovery` | 1 | 0 | 0 | 1 |
| `client/lib` | 1 | 0 | 0 | 1 |
| `client/state` | 1 | 0 | 0 | 1 |
| `server/domain/assets` | 1 | 0 | 0 | 1 |
| `server/domain/automation` | 1 | 0 | 0 | 1 |
| `server/domain/character` | 1 | 0 | 0 | 1 |
| `server/domain/credentials` | 1 | 0 | 0 | 1 |
| `server/domain/databank` | 0 | 0 | 1 | 1 |
| `server/domain/embeddings` | 1 | 0 | 0 | 1 |
| `server/domain/regex` | 0 | 1 | 0 | 1 |
| `server/domain/tool-use` | 1 | 0 | 0 | 1 |
| `server/domain/workloads` | 1 | 0 | 0 | 1 |
| `server/domain/world-info` | 1 | 0 | 0 | 1 |
| Total | 76 | 28 | 7 | 111 |

Examples:

- `packages/kit/src/content/index.ts:1116` `HiddenSpanStreamScrubber.flush` is `builder-only`. Only a `{@link}` in a doc comment names it.
- `packages/server/src/domain/import/contract/service.ts:192` `ImportService.importChatBundle` is `builder-only`. A doc comment links it, and no code calls it.
- `packages/server/src/infra/image/contract.ts:50` `ImageAdapter.probe` is `builder-only`. Only the `{@link}` at line 31 names it.
- `packages/kit/src/macro/types.ts:496` `MacroRegistry.requirementsOf` is `builder-only`. `SimpleMacroRegistry` implements it, and no code calls it.

### Fields

`pnpm unwired fields` reports data properties of interfaces, object type aliases and `z.object` schemas.

- `never-read`: production writes the field and never reads it.
- `never-written`: an optional field that production reads and never writes.
- `unreferenced`: production does neither.

A schema checked against a type with `satisfies z.ZodType<T>` counts as part of `T`'s members. The `origin` column in the report separates type members from schema keys.

| Domain | `never-read` | `never-written` | `unreferenced` | Total |
| - | - | - | - | - |
| `contracts` | 565 | 323 | 593 | 1481 |
| `inference` | 89 | 113 | 152 | 354 |
| `server/transport` | 96 | 36 | 130 | 262 |
| `client/lib` | 158 | 16 | 38 | 212 |
| `client/features/chat` | 130 | 1 | 2 | 133 |
| `server/foundation` | 48 | 66 | 18 | 132 |
| `server/domain/chat` | 75 | 7 | 42 | 124 |
| `ui` | 29 | 27 | 33 | 89 |
| `server/primitives` | 9 | 19 | 16 | 44 |
| `kit` | 34 | 4 | 1 | 39 |
| `server/domain/automation` | 35 | 0 | 3 | 38 |
| `server/entry` | 28 | 1 | 6 | 35 |
| `client/forms` | 28 | 0 | 6 | 34 |
| `plugin-toolchain` | 34 | 0 | 0 | 34 |
| `server/infra` | 18 | 6 | 10 | 34 |
| `server/domain/sessions` | 24 | 0 | 2 | 26 |
| `client/state` | 19 | 2 | 2 | 23 |
| `server/domain/discovery` | 5 | 0 | 14 | 19 |
| `server/domain/import` | 16 | 3 | 0 | 19 |
| `server/domain/rpg` | 13 | 2 | 3 | 18 |
| `client/features/preset` | 7 | 2 | 7 | 16 |
| `server/domain/connection` | 5 | 8 | 0 | 13 |
| `server/domain/search` | 9 | 0 | 4 | 13 |
| `server/domain/settings` | 12 | 0 | 0 | 12 |
| `client/features/persona` | 11 | 0 | 0 | 11 |
| `client/features/workloads` | 11 | 0 | 0 | 11 |
| `server/domain/imagery` | 9 | 1 | 1 | 11 |
| `server/domain/stats` | 3 | 0 | 8 | 11 |
| `client/components` | 8 | 2 | 0 | 10 |
| `client/features/config` | 7 | 0 | 3 | 10 |
| `server/domain/assets` | 10 | 0 | 0 | 10 |
| `client/data` | 2 | 2 | 5 | 9 |
| `server/domain/embeddings` | 9 | 0 | 0 | 9 |
| `client/features/app-shell` | 8 | 0 | 0 | 8 |
| `server/domain/databank` | 7 | 0 | 1 | 8 |
| `client/features/credentials` | 7 | 0 | 0 | 7 |
| `server/domain/character` | 3 | 0 | 4 | 7 |
| `client/routes` | 0 | 1 | 5 | 6 |
| `client/features/character` | 4 | 0 | 1 | 5 |
| `client/features/plugin` | 5 | 0 | 0 | 5 |
| `client/features/refinery` | 3 | 2 | 0 | 5 |
| `server/domain/plugin` | 5 | 0 | 0 | 5 |
| `client/features/stats` | 4 | 0 | 0 | 4 |
| `client/features/world-info` | 4 | 0 | 0 | 4 |
| `default-content` | 4 | 0 | 0 | 4 |
| `server/domain/refinery` | 4 | 0 | 0 | 4 |
| `server/domain/roster-preset` | 0 | 0 | 4 | 4 |
| `client/features/discovery` | 2 | 1 | 0 | 3 |
| `server/domain/admin` | 2 | 0 | 0 | 2 |
| `server/domain/share` | 0 | 2 | 0 | 2 |
| `client/dev` | 1 | 0 | 0 | 1 |
| `client/features/automation` | 1 | 0 | 0 | 1 |
| `client/features/regex` | 1 | 0 | 0 | 1 |
| `db` | 1 | 0 | 0 | 1 |
| `server/domain/credentials` | 0 | 0 | 1 | 1 |
| Total | 1622 | 647 | 1115 | 3384 |

By origin, `type` members give 1308 `never-read`, 163 `never-written` and 408 `unreferenced`. `schema` keys give 314 `never-read`, 484 `never-written` and 707 `unreferenced`.

Examples:

- `packages/kit/src/theme-derivation/index.ts:563` `ShadowIngredients.hairline` is `never-read`. The literal at line 604 writes it.
- `packages/ui/src/lib/css-merge-contract.ts:10` `CssMergeConflict.axis` is `never-read` in production and is read in tests.
- `packages/contracts/src/inference/tasks.ts:31` `TaskDefFields.scope` is `unreferenced`.
- `packages/ui/src/art/web-weave/web-weave.tsx:69` `FrameMotion.plucks` is `unreferenced`.

Known false-positive classes to check first:

- An interface that describes a host object (`ClipboardGlobals`, `KeyboardWindowLike`, `LiveResolverGlobals` in `packages/ui/src/lib/`) gets its value by assignment from `globalThis`. No literal writes it, so its optional fields read as `never-written`.
- A field that is read only through a spread, `Object.entries` or a library call is invisible to both engines and reads as `never-read`.
- A `schema` key of an external input (env, a provider response, a file format) gets its value from a parse, so it reads as `never-written` or `unreferenced`.

### Params

`pnpm unwired params` reports three kinds:

- `unsupplied`: an optional parameter that no production call passes.
- `same-literal`: a parameter that every production call passes as the same literal, over at least two calls.
- `unsupplied-prop`: an optional property of a parameter's type that no production call or JSX element sets.

A callable whose value production hands on is not judged.

| Domain | `same-literal` | `unsupplied` | `unsupplied-prop` | Total |
| - | - | - | - | - |
| `ui` | 2 | 1 | 113 | 116 |
| `client/features/user-admin` | 0 | 0 | 47 | 47 |
| `client/dev` | 0 | 0 | 16 | 16 |
| `inference` | 0 | 2 | 14 | 16 |
| `server/domain/chat` | 1 | 2 | 6 | 9 |
| `server/infra` | 0 | 3 | 5 | 8 |
| `client/lib` | 0 | 6 | 1 | 7 |
| `server/entry` | 0 | 0 | 7 | 7 |
| `client/components` | 0 | 0 | 6 | 6 |
| `client/features/chat` | 0 | 1 | 5 | 6 |
| `client/features/credentials` | 0 | 0 | 6 | 6 |
| `client/features/rpg` | 0 | 0 | 6 | 6 |
| `contracts` | 3 | 3 | 0 | 6 |
| `server/primitives` | 0 | 2 | 4 | 6 |
| `kit` | 0 | 1 | 4 | 5 |
| `server/domain/embeddings` | 2 | 1 | 2 | 5 |
| `server/domain/rpg` | 1 | 1 | 3 | 5 |
| `server/domain/search` | 0 | 1 | 3 | 4 |
| `client/compose` | 0 | 2 | 0 | 2 |
| `client/data` | 0 | 1 | 1 | 2 |
| `client/features/app-shell` | 0 | 0 | 2 | 2 |
| `client/features/auth` | 0 | 2 | 0 | 2 |
| `client/features/discovery` | 0 | 1 | 1 | 2 |
| `client/features/plugin` | 0 | 0 | 2 | 2 |
| `server/domain/character` | 0 | 2 | 0 | 2 |
| `server/domain/plugin` | 0 | 2 | 0 | 2 |
| `server/domain/sessions` | 0 | 0 | 2 | 2 |
| `server/transport` | 0 | 0 | 2 | 2 |
| `client/features/character` | 0 | 0 | 1 | 1 |
| `client/features/refinery` | 0 | 0 | 1 | 1 |
| `client/features/roster-preset` | 1 | 0 | 0 | 1 |
| `client/features/workloads` | 1 | 0 | 0 | 1 |
| `client/forms` | 0 | 0 | 1 | 1 |
| `client/state` | 0 | 1 | 0 | 1 |
| `server/domain/admin` | 0 | 0 | 1 | 1 |
| `server/domain/assets` | 0 | 0 | 1 | 1 |
| `server/domain/automation` | 0 | 0 | 1 | 1 |
| `server/domain/connection` | 0 | 1 | 0 | 1 |
| `server/domain/databank` | 0 | 0 | 1 | 1 |
| `server/domain/discovery` | 0 | 1 | 0 | 1 |
| `server/domain/import` | 0 | 1 | 0 | 1 |
| `server/domain/stats` | 0 | 0 | 1 | 1 |
| Total | 11 | 38 | 266 | 315 |

Examples:

- `packages/server/src/domain/chat/substrate/auth/decide.ts:38` `permits(action)`: all 3 calls pass `"host"`.
- `packages/ui/src/content/theme-scope/tone-knobs.ts:169` `toneMixOf(tone)`: all 3 calls pass `"primary"`.
- `packages/client/src/lib/safe-error-ring.ts:110` `recordSafeError(context)`: no call of 3 passes it.
- `packages/ui/src/primitives/empty-state/empty-state.tsx:34` `EmptyState` `className`: none of 67 elements set it.
- `packages/ui/src/primitives/toast/toast.tsx:131` `Toaster` `container` and `swipeDirection`: the one element sets neither.

### Unions

`pnpm unwired unions` reports `unbuilt` members of `as const` string tuples. No production literal builds such a member into a slot of its union. Each finding lists the `case` branches, equality checks and `Record` keys that name the member. A tuple that production maps, spreads, indexes or hands on can build any member, so it is listed under `enumerated` and not judged; this run lists 316.

| Domain | `unbuilt` | Total |
| - | - | - |
| `contracts` | 142 | 142 |
| `server/domain/discovery` | 20 | 20 |
| `server/infra` | 10 | 10 |
| `ui` | 10 | 10 |
| `client/lib` | 7 | 7 |
| `server/domain/sessions` | 6 | 6 |
| `inference` | 5 | 5 |
| `plugin-toolchain` | 2 | 2 |
| `client/features/rpg` | 1 | 1 |
| `server/domain/connection` | 1 | 1 |
| `server/entry` | 1 | 1 |
| Total | 205 | 205 |

Examples:

- `packages/contracts/src/inference/usage.ts:33` `RESPONSE_CACHE_STATUSES` `hit`. Checks in `packages/inference/src/backends/v4/result.ts:206` and other backends test for it.
- `packages/ui/src/lib/clipboard.ts:6` `CLIPBOARD_OUTCOMES` `insecure`. Keys at `packages/client/src/lib/copy-with-notice.ts:11` and `packages/ui/src/primitives/copy-button/copy-button.tsx:18` name it.
- `packages/contracts/src/inference/evidence.ts:16` `EVIDENCE_TIERS` `advertised`. No branch, check or key names it.

A known class to check first: vocabularies that a model's structured output fills through `z.enum` are built only by a parse. `TONES` and `GENRES` in `packages/server/src/domain/discovery/verbs/distill.ts` and the `IMAGE_*` tuples in `packages/contracts/src/embeddings/index.ts` are examples. For these, `unbuilt` is accurate, and the question is whether the model can still produce the member.

### Shapes

`pnpm unwired shapes` reports four kinds:

- `restated`: two named object types in different files with the same members, each assignable to the other.
- `synonym`: an alias that is a bare reference to another type.
- `reexport-chain`: an export that re-exports a re-export from another file.
- `renamed-reexport`: an export that gives a symbol a second name.

42 of the 84 synonyms sit in a domain's `contract/params.ts` or `contract/results.ts`. Item [1445](../../work/1445-delete-synonym-type-aliases-keep-per-verb-params.md) keeps these per-verb names. The report marks them `perVerb`.

| Domain | `reexport-chain` | `renamed-reexport` | `restated` | `synonym` | Total |
| - | - | - | - | - | - |
| `contracts` | 0 | 0 | 111 | 7 | 118 |
| `ui` | 7 | 9 | 58 | 3 | 77 |
| `server/domain/chat` | 16 | 4 | 9 | 29 | 58 |
| `inference` | 29 | 0 | 2 | 7 | 38 |
| `server/foundation` | 30 | 0 | 0 | 1 | 31 |
| `server/entry` | 11 | 0 | 16 | 1 | 28 |
| `kit` | 0 | 0 | 24 | 0 | 24 |
| `server/domain/discovery` | 7 | 1 | 15 | 0 | 23 |
| `client/features/chat` | 0 | 0 | 22 | 0 | 22 |
| `client/data` | 14 | 0 | 0 | 5 | 19 |
| `server/domain/workloads` | 6 | 3 | 6 | 1 | 16 |
| `server/domain/world-info` | 1 | 15 | 0 | 0 | 16 |
| `client/state` | 7 | 0 | 7 | 0 | 14 |
| `server/domain/automation` | 1 | 0 | 8 | 4 | 13 |
| `server/domain/character` | 5 | 0 | 8 | 0 | 13 |
| `server/domain/settings` | 5 | 2 | 5 | 1 | 13 |
| `server/domain/plugin` | 11 | 0 | 1 | 0 | 12 |
| `client/lib` | 3 | 0 | 4 | 4 | 11 |
| `server/domain/admin` | 0 | 0 | 6 | 4 | 10 |
| `server/domain/regex` | 0 | 0 | 8 | 1 | 9 |
| `server/domain/databank` | 0 | 2 | 6 | 0 | 8 |
| `server/domain/persona` | 1 | 1 | 6 | 0 | 8 |
| `server/domain/rpg` | 6 | 2 | 0 | 0 | 8 |
| `client/features/automation` | 0 | 0 | 6 | 0 | 6 |
| `client/features/discovery` | 0 | 0 | 6 | 0 | 6 |
| `server/domain/embeddings` | 3 | 1 | 1 | 1 | 6 |
| `server/domain/refinery` | 0 | 1 | 3 | 2 | 6 |
| `server/infra` | 4 | 0 | 0 | 2 | 6 |
| `client/features/credentials` | 0 | 0 | 4 | 0 | 4 |
| `client/features/user-admin` | 0 | 0 | 4 | 0 | 4 |
| `server/domain/export` | 2 | 0 | 0 | 2 | 4 |
| `server/domain/preset` | 0 | 3 | 1 | 0 | 4 |
| `server/domain/tag` | 0 | 3 | 1 | 0 | 4 |
| `client/components` | 2 | 0 | 1 | 0 | 3 |
| `client/features/plugin` | 1 | 0 | 2 | 0 | 3 |
| `server/domain/imagery` | 1 | 0 | 0 | 2 | 3 |
| `server/domain/search` | 0 | 0 | 1 | 2 | 3 |
| `client/features/databank` | 0 | 0 | 2 | 0 | 2 |
| `server/domain/assets` | 0 | 2 | 0 | 0 | 2 |
| `server/domain/notifications` | 1 | 0 | 0 | 1 | 2 |
| `server/domain/roster-preset` | 0 | 1 | 0 | 1 | 2 |
| `server/domain/tool-use` | 2 | 0 | 0 | 0 | 2 |
| `client/features/character` | 0 | 0 | 0 | 1 | 1 |
| `client/features/preset` | 0 | 0 | 1 | 0 | 1 |
| `client/features/roster-preset` | 0 | 0 | 0 | 1 | 1 |
| `client/features/rpg` | 0 | 0 | 1 | 0 | 1 |
| `server/domain/connection` | 0 | 1 | 0 | 0 | 1 |
| `server/domain/import` | 0 | 0 | 0 | 1 | 1 |
| Total | 176 | 51 | 356 | 84 | 667 |

Examples:

- `packages/contracts/src/plugin/host-v1.ts:66` `PluginVariableOp` is a `synonym` of `VarOp` in `packages/kit/src/macro/types.ts`.
- `packages/contracts/src/automation/index.ts:915` `SuggestionCardDetail` is a `synonym` of `RewriteCardDetail`.
- `packages/ui/src/lib/use-prefers-light-color-scheme.ts:3` `ColorSchemeQuery` restates `ReducedMotionQuery` at `packages/ui/src/lib/use-prefers-reduced-motion.ts:11`.
- `packages/client/src/state/index.ts:34` `SeedThemeName` reaches `packages/client/src/lib/index.ts` through `packages/client/src/state/appearance-boot-hint.ts`.
- `packages/ui/src/primitives/icons/index.ts:6` exports the library's `TriangleAlert` as `AlertTriangle`.

Small UI prop shapes (`PopoverTitleProps`, `DialogTitleProps`, `AlertDialogTitleProps`) match by coincidence of their members. Judge each `restated` pair by concept, not by shape alone.
