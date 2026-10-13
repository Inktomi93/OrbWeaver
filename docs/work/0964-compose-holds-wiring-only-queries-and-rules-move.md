---
kind: work
status: open
updated: 2026-10-13
priority: P1
plan: test-foundation
---

# Compose holds wiring only: queries and rules move to their domains

## What

Move every per-call rule and database query from compose and its reachable entry callbacks to their real owners. Keep configuration decisions and graph wiring in entry. The gate owns the complete work set, including adapters, imports and boot. Build the real test composition root only after this boundary is clean.

## Why

Tier-5 law says entry owns no business logic. Rules hidden in compose closures are what test harnesses copied, and the server test composition root (958) cannot test logic it cannot reach.

## Done when

The gate holds with planted controls; no compose module runs a query or carries a rule; each moved rule is exported from its domain and called by compose; item 958 starts from the cleaned compose.

## Evidence

Chat and search/discovery moves landed at `980a8e07bd` after review and the authenticated-Principal correction. Automation/plugin landed at `292d99464e`, including canonical contracts and domain-cycle corrections. Focused behavior, affected native programs and the server import graph pass. The budget file owns the remaining compose count; this item stays open.

Services/runtime/embedding rules and the owner-bound import builder land at `3abe607b75`. Administrative, update, refinery and recorder policy lands at `7dc34e9eda`; room-reach queries and confirmed-delete fan policy land at `4011db1ea4`. Media policy lands at `da34acd546` with confirmed source review and corrected maintained fixtures. Portability and import policy land at `4356bec66d` with confirmed security review, ownership and private-file controls, and matching scoped evidence. Content seeding and character adapters have their own work item; other adapters and the canonical auth-mint judgment remain open. Do not build the server harness before this boundary is clean.

Services review confirms the relocation map and matching native import graph. Aggregate-green evidence covers the corrected distinct case set; publication and vector cases have separately labeled per-file passes inside failed batches. Existing legacy lint findings remain visible. Compose and structural-copy budgets shrink only by this leg's actual removals. Moved expected-exception catches have no committed census rows; raw catch consolidation does not establish a waiver reduction.

The native server import graph confirms the lower-contract and injected-resolver corrections without rule relaxation. Preserve canonical lower-package shapes, consumer-owned narrow ports and sibling front doors in the remaining legs.

Administrative and room-reach components have independent review and matching scoped evidence. Corrected maintained fixtures use production-resolved generations and canonical user rows. Literal marker removals shrink compose and graph-interface budgets; entire-population policies remain deferred. The corpus item owns strict recall seed coverage, not another copied recorder fixture.

The gate is `compose-wiring-only` (`tooling/src/verify/gates/compose-wiring-only.ts`); its header defines a rule. `pnpm check:structure --check compose-wiring-only` reports per handed-out function or helper, not per decision.

- Derive remaining work from the gate's actual population and the live entry markers, not an initial file inventory.
- The subject includes every `entry/**` function compose reaches, including auth, boot and import drivers. Final content and adapter batches are integrated at `e823f15b17` with confirmed security review. Exact marker removals leave a zero compose budget at `17e62b9954`; no allowance is added. The census single writer reproduces committed bytes without changed judgments. This item lands only after the complete policy population has no findings, waivers or grants, not merely because markers are gone.
