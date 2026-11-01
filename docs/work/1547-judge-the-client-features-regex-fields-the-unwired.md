---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/regex fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/regex`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RegexBulkArgs.scriptIds` | `client/src/features/regex/hooks/use-regex-library.ts:62` | never-read | delete | delete the field and its writes (`client/src/features/regex/components/regex-bulk-bar.tsx:93`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

1 row: 0 deleted, 1 derived, 0 kept, 0 handed off, 0 owner questions.

`RegexBulkArgs.scriptIds` was not dead: each bulk mutation sends its variables whole to tRPC, so the server reads the field. The four bulk hooks in `use-regex-library.ts` now take `inferInput<Trpc["regex"]["bulkSetEnabled"]>`, `bulkSetGlobal`, `bulkSetPlacement` and `bulkRemove`; `RegexBulkArgs` is gone, and so is the `RegexPlacement` import.

Survey: `codegraph_explore` on `RegexBulkArgs scriptIds use-regex-library regex-bulk-bar`; ast-grep (`-l ts` and `-l tsx`) on `useBulkSetRegexPlacement($$$)` (1 caller, `regex-bulk-bar.tsx`). Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0, which checks the branded `scriptIds` and `placement` arrays against the router input. No CT mounts `RegexBulkBar`; the typecheck is the proof of the derived type.
