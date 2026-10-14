---
kind: bug
status: open
updated: 2026-10-14
priority: P2
---

# Main reds and loose ends from the test-mirror lanes

## What

Adjudicate release-please's cmdk ignore, corpus liveness, type budgets, session-daemon T5 load behavior, gate-spelling-twins verdict and use-databank-list-header CT. Dependency pollution and Knip findings are leads; production export work owns current inventory.

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

Citation checks have no effective findings, tool errors or withheld verdicts; grants exceed their budget. Evidence: `reports/runs/structure/main-638409-2026-10-14T09-03-57-578Z/check-structure.json`. Main must separate current-law drift from immutable ADR proposals, external SDK names and package-member citations. Preserve decisions; add no allowance.

The UI export floor reports untouched legacy fixtures: seed-user-content's optional RPG input, profile-directory's optional name and handle, and run-profile-import's optional tag source. Preserve cases for replacement; do not retrofit them for a green export floor.

Compose integration preserves census equality. Reindex/auth classifications remain unproven; literal removals shrink budgets.

The staged-selection release-promotion cases fail on current qualification generation with both original and changed source. Their CI fixtures need tooling adjudication, not release bypasses.

JSON and wire parsing allowances are zero; whole-application qualification remains open.

The suppression work item owns form-data and settled-tracing lint conflicts.

The identity candidate measures `no-inline-package-interface` at 311 findings against budget 328 after its attributable decrement from 329. Type-home work owns the remaining mismatch; do not lower another allowance or regenerate globally to hide it.
