---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/forms parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/forms`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `createSavedEntityForm.config.save` | `client/src/forms/editor/create-saved-entity-form.ts:40` | unsupplied-prop | delete | delete the prop and its default path (9 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

`SavedEntityFormConfig.save` and the `config.save` fallback are removed in `packages/client/src/forms/editor/create-saved-entity-form.ts`; the call-time `SavedEntityFormArgs.save` is the only seam and now carries the doc. All `createSavedEntityForm` factory calls (`use-add-connection-form.ts`, `use-add-model-on-key-form.ts`, `login-signup-form.tsx`, `use-scrape-form.ts`, `use-invite-form.ts`, `use-create-user-form.ts` and the rest) pass `defaultValues` and `options` only. `createAutosaveEntityForm` has its own `config.save` and is a different factory. Proof: client typecheck clean.
