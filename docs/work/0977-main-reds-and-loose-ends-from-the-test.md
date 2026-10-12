---
kind: bug
status: open
updated: 2026-10-12
priority: P2
---

# Main reds and loose ends from the test-mirror lanes

## What

Known reds and loose ends surfaced by lanes and verifiers: the release-please-config cmdk dependabot-ignore case fails on main; real-corpus-liveness-manifest is red for policies that lack liveness pins (contract-structural-copy, json-column-read-parsed, test-file-size, test-production-clone, trpc-input-declarations, wire-json-parsed-at-consumer and test-hand-shape); the no-inline-types waiver budget disagrees with its measured count; dependency-cruiser-worlds and application-knip failed from tests/support/node_modules before the vitest exclusion fix and need a clean rerun; session-daemon.int T5 failed twice under load and is unproven either way; gate-spelling-twins.int has no verdict yet because it times out under load. `pnpm knip:prod` is red on main: three unused testkit dependencies and five unused client exports. `@orb/ui` exports its node-only token build modules (the token-contract and tokens-build subpaths) because tooling imports them, so their build tools (`ajv`, `ajv-formats`, `style-dictionary`, `tailwindcss`) must sit in ui's runtime dependencies; those modules belong outside ui's shipped exports (with D318), and the `token-contract.ts` header that says they were dropped is stale. The CT `use-databank-list-header.ct.tsx` fails on main.

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
