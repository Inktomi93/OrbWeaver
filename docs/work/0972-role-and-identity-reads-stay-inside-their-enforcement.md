---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
lane: codex/identity-enforcement-972
---

# Role and identity reads stay inside their enforcement homes

## What

Host-role checks are computed outside can(): register-plugin-tool.ts and compose/automation-plugin.ts compute canWrite from a direct present-role read (Spine-Identity invariant 6). users-table reads and writes sit in entry/compose and entry/boot (invariants 2 and 10). The databank chunk scan in search/persistence/nearest.ts trusts its caller's document allowlist and checks no scope itself; today's callers are server-internal. Widen two-class-role-authority and no-direct-users-read to entry/ and to data-field comparisons, route the role checks through can(), and give the chunk scan its own scope predicate.

## Why

A role or identity decision made outside its home is one refactor from a privilege bug, and the gates that guard the home do not look outside domain/.

## Done when

No role comparison or users access outside the sanctioned homes; both gates cover entry/ with planted controls; the chunk scan scopes itself; security review confirms.

## Evidence

Filled at landing: what ran and where its output is.
