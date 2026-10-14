---
kind: bug
status: open
updated: 2026-10-13
priority: P2
---

# Main reds and loose ends from the test-mirror lanes

## What

Findings needing current adjudication: release-please-config's cmdk ignore case; real-corpus-liveness pins; the no-inline-types budget; session-daemon.int T5 under load; gate-spelling-twins.int without a completed verdict; and the use-databank-list-header CT. Earlier node_modules pollution and production Knip findings are leads, not current verdicts after the package-door changes. The production export work item owns native inventory adjudication.

UI exposes node-only token build modules through token-contract and tokens-build doors. Their runtime dependencies and stale token-contract header need review against D318; do not delete supported APIs merely because tooling is their consumer.

## Population and migration checks

Audit policies declaring `@packages` in `tooling/src/verify/contract/population.ts`: that fixed set omits `@inference`, while `@product` includes it. Each policy must use the population its claim covers; do not widen the fixed set silently. Review remaining Biome nursery rules against maintained ESLint equivalents. Keep release-please and corpus findings visible until completed checks establish a verdict.

The typed-lint migration reports legacy-only condition, coercion, sort, and nullish findings. Preserve their regression cases for the rebuild rather than starting another legacy retrofit. The maintained lint population also reports `shell-modal-header` as an unknown class in `packages/client/src/components/content-dialog.tsx` and `packages/client/src/features/app-shell/components/modal-host.tsx`; adjudicate the class against its actual style home.

Legacy auth-config CT stubs contain invalid payloads. Boundary parsing owns their source evidence; corpus builders replace the inputs. Preserve cases without weakening parsing.

## Why

Reds on main poison every lane's evidence and hide new failures.

## Done when

Each listed check is green on main or has a recorded cause and owner.

## Evidence

The application check at `4d7b00a6d4` exited 2: `reports/runs/verify/main-4157590-2026-10-12T20-18-49-624Z/verify.json`. Tool errors and withheld policies prevent qualification.

Remaining findings: legacy disposal and typed-lint errors; maintained classes above; client formatting/import order; caught-failure census differences; `client-lib-floor` from `packages/client/src/lib/agent-bridge.ts` to `packages/client/src/data/index.ts`. Default application Knip reports unused exports/types and configuration hints, not production-baseline reconciliation. Adjudicate intended consumers before deleting supported doors.

Structure evidence: `reports/runs/structure/main-9229-2026-10-12T20-28-58-495Z/check-structure.json`. Findings and authority alarms remain unresolved. Repair product, security or checker defects, not disposable legacy suites.

Citation owners complete in `main-4041911-2026-10-13T23-10-18-222Z` with no effective findings, tool errors or withheld verdicts. Existing reviewed grants exceed their budget. This is a red authority verdict, not clean citation qualification. Main owns grant adjudication; add no allowance.

The UI export floor reports legacy-node errors in untouched server fixtures: seed-user-content's optional RPG input, profile-directory support's optional name and handle, and run-profile-import's optional tag source. The export batch changes neither those fixtures nor server declarations. Preserve cases for replacement; do not retrofit them to manufacture a green export floor.

Compose integration preserves census equality. Reindex/auth classifications remain unproven; literal removals shrink budgets.

The staged-selection release-promotion cases fail on current qualification generation with both original and changed source. Their CI fixtures need tooling adjudication, not release bypasses.

JSON and wire parsing allowances are zero; whole-application qualification remains open.

The suppression work item owns form-data and settled-tracing lint conflicts.
