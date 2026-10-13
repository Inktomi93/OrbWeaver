---
kind: tooling
status: doing
updated: 2026-10-13
priority: P1
area: tooling
lane: codex/native-config-999
plan: test-foundation
---

# Move remaining gate claims into native configuration

## What

Adjudicate these source candidates against installed native tools. Read each complete gate and its actual population before changing enforcement. Earlier syntax migrations are implemented; this list does not reopen them.

| Candidate claims | Native destination to examine |
| - | - |
| package-deep-import, package-subpath-crossing, tests-package-subpath, tests-raw-package-reach | Explicit resolver doors and dependency-cruiser; retain typed reach where an edge cannot express the claim |
| route-imports-no-feature; tooling-front-door, tooling-root-config-import, tooling-browser-door, tooling-child-process-door; serde-core-seal | Native import restrictions or dependency-cruiser with exact sanctioned homes |
| no-raw-clock, no-raw-random, no-raw-intl-time, no-raw-egress, no-raw-history-writes, persistence-boundary, sole-env-reader | Biome globals/import rules or ESLint syntax; check aliases, shadows and legitimate capability homes |
| no-raw-spacing-in-features, no-raw-typography-in-features, no-raw-z-index, no-color-literals, no-off-token-radius-shadow | Token scale reset and maintained unknown-class checks; raw CSS and computed values need separate judgment |
| no-arbitrary-tw-values, no-banned-tw-utility, no-tailwind-dark-variant, no-media-queries-in-features, no-pointer-variants-in-features, no-hover-display-swap | Installed better-tailwindcss restricted-class rules; prove imported/composed class coverage |
| test-fixture-imports, test-mock-doctrine, no-blanket-suppression, suppressions, zod-modern-spellings, zod-error-issues-home, ct-poll-schedule-and-paint | Installed runner, comments and Zod rules cover only parts; retain unmatched invariants |

Owner-scoped reads and writes are semantic security claims. Moving an import edge cannot replace their predicates. Shared Drizzle and type facts remain the foundation plan's responsibility.

The native token-scale reset is not yet configured in the generated theme. Check functional numeric utilities and composed or imported classes through native APIs. Configuration changes require rendered review; do not assume resets remove every off-token class.

The semantic CT live-read checker stays: configured native rules miss imported snapshots, recursive data aliases, recorder reads and geometry. Do not repeat its completed comparison for confidence.

Cut the planned config-liveness parsers, their health twins, registry-parity and custom ESLint selector evaluation. Other health checks and gates about gates require individual review last. Preserve world configs, their generator, runner membership, data safety and lifecycle/concurrency decision tests. D307 and D317 retain weekly cadence; no blanket tooling-proof deletion is approved.

## Why

Maintained tools already enforce many syntax and import claims. Duplicate readers and checker certification machinery add cost without establishing product behavior. Candidate lists must survive in the canonical program rather than temporary transcripts.

## Done when

Every recorded candidate has a current native, shared-reader, retained-semantic or deletion decision with its unresolved gaps stated. Implement supported native moves and delete duplicate gates/readers/tests in the same cohesive batches. Preserve meaningful findings and prove replacement verdict logic with bounded controls; reuse existing evidence. Rejudge grants rather than copying them into config. Add no liveness reader, selector emulator, waiver debt, blanket health deletion or new dependency without a genuine unresolved requirement. Main owns shared verification and product review for visual token changes.

## Evidence

Filled at landing: what ran and where its output is.
