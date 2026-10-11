---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
plan: test-mirror
---

# Convert test-presence-client to reach

## What

Item 899 replaced the server, contracts and inference presence gates with test-reach (tooling/src/verify/gates/test-reach.ts, engine tooling/src/verify/lib/test-reach.ts), but test-presence-client still demands client and ui tests by mirrored file name (its clause A), and clause C resolves component actions through clause A's path. Move clauses A and B onto test-reach demand rules for the unit and component families, resolve clause C actions through imports, and delete the name-based clauses with their fixture controls ported. Also from the 899 lane, not built: test-reach has no tripwire for an empty inference population (count inference modules with a runtime export and refuse on zero when the real-tree anchor is present), and the per-kind source-extension check that test-layout dropped (TEST_KIND_DEFINITIONS sourceExtensions) has no consumer now; judge the kind against the extensions a test reaches, or delete the field after a consumer sweep.

## Why

Core-0 section 5 and Spine-Testing section 5 now say presence is reach and tests are named by behaviour; the client gate still contradicts the law for data, forms and state.

## Done when

test-presence-client has no file-name clause, its controls pass on test-reach demand rules, and client modules unreached by tests are baselined as reviewed grants under the waiver budget.

## Evidence

Filled at landing: what ran and where its output is.
