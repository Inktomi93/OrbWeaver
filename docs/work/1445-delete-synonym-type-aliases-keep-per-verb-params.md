---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: architecture
---

# Delete synonym type aliases; keep per-verb Params and Result names

## What

Delete every exported pure-rename alias (`export type X = Y;` with no transform) that gives a second name to one concept, and point every consumer at the home name with the `rename-identifier` codemod. Examples: `SideGenSampling = RolePresetParams` (`packages/inference/src/contract/side-gen.ts:9`), `SummarizeOptions = RolePresetParams` (`packages/contracts/src/role-clients/index.ts:94`), `ReindexPreview`, `SeededLibraryEntry`, `ExportedCard`, `RingColor`, `WaystoneWeather`, `TreeImportStarted`, `BundleImportStarted` and the four `packages/inference/src/contract/diagnostics.ts` request aliases. List them all with `rg --pcre2 '^export type (\w+) = ([A-Z]\w*);$' packages/*/src`.

Keep the per-verb names in a domain's `contract/params.ts` and `contract/results.ts` (`ListSessionsParams = RefineryActorParams`, `SetRoleResult = AdminUserData`): Core-0 §4's template gives every verb a named input and output. Add a check that refuses a new pure-rename alias outside those two files, with planted cases.

## Why

The writing law uses one word for one thing, and AGENTS.md says one home per concept. A synonym alias hides a type's home: the port census misclassified `RolePresetParams` shapes as inference-owned because of `SideGenSampling`. No law approves rename aliases outside the per-verb params and results template.

## Done when

No exported pure-rename alias remains outside `domain/*/contract/params.ts` and `results.ts`. The check refuses a planted one and accepts a per-verb params alias, `pnpm typecheck` passes on every program, and the affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
