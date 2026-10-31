---
kind: work
status: blocked
updated: 2026-10-31
priority: P2
area: tests
blocked: on 1496
plan: unwired-code
---

# Delete the eight test-only ServicesResult fields (presence, eventBus, characterSeeder, personaSeeder, rpgChatOps, cas, crossFeatureOps, toolUse); move their suites onto real doors and update node-tests.md

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

All eight fields are deleted from `ServicesResult` and its return in `packages/server/src/entry/compose/services.ts`; the locals stay for their production readers. The type errors from deleting them were the reader census: test files and test helpers only, no production reader.

| Field | Door the tests moved to |
| - | - |
| `presence` | `connectDevice` (`tests/support/node/presence.ts`) opens `stream.connect` through the root's internal caller; aborting its signal closes the device |
| `toolUse` | a chat turn with a scripted tool call (react), a plugin guest run by the automation `run_tool` arm, and the plugin list; the `listDrivableToolNames` lines duplicated the provider-wire assertions |
| `cas` | `casOf` (`tests/support/node/cas.ts`) opens the production `createCas` over the root's `ASSETS_DIR` |
| `crossFeatureOps` | `personasForParticipantsOf`, `presentHostOf` (`tests/support/node/cross-feature.ts`) bind the production factories to the root database; the import context moved to `portability.importFile` |
| `characterSeeder`, `personaSeeder` | `contentSeeder.ensureSeeded`, the door boot and the first-request hook use |
| `rpgChatOps` | none; the spied hook has no effect on a non-game chat |
| `eventBus` | `character.create`, which raises `character.updated` |

Cases removed or narrowed, with the reason:

- `react-tool-rows`: the `chatId: null` refusal ("react requires a chat context"). A turn always carries a chat.
- `installer-authority`: the direct calls that handed the installer's tool to a different caller principal, and the departed-installer `not permitted` case. No door passes a foreign principal into an installer's tool; the automation arm runs the author and refuses with `authority_refused` once the author is no longer host.
- `build-context` test 1: the foreign `ownerId` arguments. The owner binders take no `ownerId`, so the type refuses it and no door can supply one. The real tag and principal writes stay through `portability.importFile`.
- `build-context` test 3 (installer import factory): covered through the guest door by `tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts` (installer-owned landing and plugin stamp) and `tests/support/node/corpus-plugin-host.int.test.ts` (first ingest created, repeat not created, same character).
- `turn-funding` (`triggeredBy` per auto beat), `authority-boundary-rows` (terminal hook params) and `turn-cancellation` (hook called or not): spies on the rpg hook of a non-game chat. The member author, host funding header, host connection and `turnCompleted` event remain asserted.
- `persona/seeder/default`: the `assets.store` spies, because the content pass stores every shipped card's art too. The retry-after-refused-latch half now runs on the next process (a second root over the same database), because the content pass settles per process.
- `deferred-reclaim-rows`, `deferred-turn-queue`, `prompt-cache-prefix`: the `presence.read(...).online` preconditions. The disclosure query is a multi-human surface these single-user rooms refuse. The deferred queue case now proves the host-return drain through the connect edge.
- `sleeping-runtime-wake`: now three real turns that each call one of two plugins on a one-worker host.

Checks (worktree `wt/agent-a3ef409cf77e7c246`):

- `pnpm typecheck tsconfig.node.json packages/server/tsconfig.json tsconfig.tests-dom.json tsconfig.tests-iso.json tooling/tsconfig.json`: one error, `tests/support/node/portability-box.ts:58` (`Uint8Array` as `BodyInit`), in a file this item does not touch.
- `pnpm test` over the moved suites by directory: all green; one load timeout in `tests/server/domain/assets/persistence/unmeasurable-asset-refs.int.test.ts` passed on a solo rerun.
- `pnpm test:ct tests/client/features/workloads/components/failed-assets.ct.tsx`: pass.
- `pnpm lint:eslint` on the changed paths, `pnpm depcruise`, `pnpm knip:prod`: clean.
- `pnpm knip`: one finding, `abortProcedure` in `tests/support/node/ct.ts`, from sibling work.
