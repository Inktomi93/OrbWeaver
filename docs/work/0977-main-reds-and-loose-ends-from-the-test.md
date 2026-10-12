---
kind: bug
status: open
updated: 2026-10-12
priority: P2
---

# Main reds and loose ends from the test-mirror lanes

## What

Findings needing current adjudication: release-please-config's cmdk ignore case; real-corpus-liveness pins; the no-inline-types budget; session-daemon.int T5 under load; gate-spelling-twins.int without a completed verdict; and the use-databank-list-header CT. Earlier node_modules pollution and production Knip findings are leads, not current verdicts after the package-door changes. The production export work item owns native inventory adjudication.

UI exposes node-only token build modules through token-contract and tokens-build doors. Their runtime dependencies and stale token-contract header need review against D318; do not delete supported APIs merely because tooling is their consumer.

## Population and migration checks

Audit policies declaring `@packages` in `tooling/src/verify/contract/population.ts`: that fixed set omits `@inference`, while `@product` includes it. Each policy must use the population its claim covers; do not widen the fixed set silently. Review remaining Biome nursery rules against maintained ESLint equivalents after the lint migration. Fix dangling `@orb/testkit` citations after testkit doors change. Keep the release-please cmdk failure and real-corpus-liveness findings visible until their completed checks establish a verdict.

The typed-lint migration reports legacy-only condition, coercion, sort, and nullish findings. Preserve their regression cases for the rebuild rather than starting another legacy retrofit. The maintained lint population also reports `shell-modal-header` as an unknown class in `packages/client/src/components/content-dialog.tsx` and `packages/client/src/features/app-shell/components/modal-host.tsx`; adjudicate the class against its actual style home.

## Why

Reds on main poison every lane's evidence and hide new failures.

## Done when

Each listed check is green on main or has a recorded cause and owner.

## Evidence

The application check at `4d7b00a6d4` exited 2: `reports/runs/verify/main-4157590-2026-10-12T20-18-49-624Z/verify.json`. Biome, ESLint, native types, structure, ledger freshness, dependency-cruiser and Knip failed. Structure had tool errors and withheld policies, so the run cannot establish a whole-tree verdict.

Migration corrections landed in `a5b297e094` and `bd6e38bf81`: nullable RPG read, private network import-type alias, contract formatting and native integer constructor proof. Affected compiler programs and formatting passed; the integer proof failed before its fix and passed afterward. Reuse this scoped evidence.

Remaining findings: legacy disposal and typed-lint errors; maintained classes above; client formatting/import order; caught-failure census differences; `client-lib-floor` from `packages/client/src/lib/agent-bridge.ts` to `packages/client/src/data/index.ts`. Default application Knip reports unused exports/types and configuration hints, not production-baseline reconciliation. Adjudicate intended consumers before deleting supported doors.

Structure evidence: `reports/runs/structure/main-9229-2026-10-12T20-28-58-495Z/check-structure.json`. Other findings and authority alarms remain unresolved. Repair product, security or checker defects, not waivers or disposable legacy suites. Preserve useful cases for the rebuild.

Knip baseline typing defects are corrected on main: JSON validation derives a checked string array, and the CLI proof uses Node's declared spawn result type. The focused native Knip controls and root compiler program pass. This does not establish a fresh production liveness verdict.
