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

Reviewed source `24e06ec6f4` derives installer effects through canonical chat authority and rechecks document consent after query embedding. Real native guest and search races pass; removing current scope or substituting caller authority fails the maintained assertions. The independent bridge guard remains effective.

Guarded owner bootstrap and missing-pepper settlement use private sessions persistence without widening authority. Existing owner-key collision, password CAS, account enumeration and credential-key ordering controls pass.

Both identity policies judge complete domain and entry populations without new grants or path exclusions. Bounded field and population controls discriminate the changes. Independent security review confirms the complete source batch.

Integrated runtime cases and client, DOM and isomorphic compiler programs pass. Root retains its known unrelated errors; legacy fixtures and old lint findings remain visible. The interface allowance mismatch is tracked separately. Whole-application qualification remains open.
