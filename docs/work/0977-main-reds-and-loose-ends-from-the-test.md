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

Remaining findings: legacy disposal and typed-lint errors; maintained classes above; client formatting/import order; caught-failure census differences; `client-lib-floor` from `packages/client/src/lib/agent-bridge.ts` to `packages/client/src/data/index.ts`. Default application Knip reports unused exports/types and configuration hints, not production-baseline reconciliation. Adjudicate intended consumers before deleting supported doors.

Citation checks have no effective findings, tool errors or withheld verdicts; grants exceed their budget. Evidence: `reports/runs/structure/main-2512260-2026-10-14T17-27-19-351Z/check-structure.json`. Main must separate current-law drift from immutable ADR proposals, external SDK names and package-member citations. Preserve decisions; add no allowance.

Legacy export-floor findings concern optional RPG, profile and tag inputs in seed-user-content, profile-directory and run-profile-import. Preserve cases for replacement, not fixture retrofits.

Compose integration preserves census equality. Reindex/auth classifications remain unproven; literal removals shrink budgets.

The staged-selection release-promotion cases fail on current qualification generation with both original and changed source. Their CI fixtures need tooling adjudication, not release bypasses.

JSON and wire parsing allowances are zero; whole-application qualification remains open.

The suppression work item owns form-data and settled-tracing lint conflicts.

Complete owner evidence supports the package-interface shrink after inference relocation. `SandboxLimits` remains unwaived and belongs to type-home repairs. Other allowances are unchanged; native coverage does not establish complete placement qualification.

Native ESLint parser requests separate untyped files from compiler-owned partitions. Red/green and real CLI controls pass. The [hosted artifact](https://github.com/Inktomi93/OrbWeaver/actions/runs/38544900781) retains the earlier shared-declaration failure and an incomplete `contract-verb-presence` native-library boundary. Full qualification and that boundary correction remain open; arbitrary owner selection and legacy fixture repairs are not remedies.
