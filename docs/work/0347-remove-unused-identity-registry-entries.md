---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: server
---

# Remove unused identity registry entries

## What

Remove ID_PREFIX.ownerStat from packages/kit/src/ids/index.ts and ADMIN_OP_CODES.cannotModifyAgent from packages/server/src/domain/admin/contract/errors.ts after confirming no keyed or computed consumer. The owner_stats table uses ownerId as its natural primary key. The agent refusal code has no throw site. Preserve the parked agent-principal plan and its dormant data columns.

## Why

These registry entries name identities or refusals that the product does not produce. Keeping them makes the declared surface larger than the implemented one.

## Done when

The unused entries and their stale comments are removed. A complete consumer sweep confirms no remaining reference, and affected type checks and registry tests pass. Existing stats writes and admin refusals retain their behavior.

## Evidence

`reports/launch-ast-audit-2026-10-01/regkeys.json` reports both keys with complete scope metadata. A literal sweep over product, tests, tooling and scripts finds each key's value only at its declaration. `packages/kit/src/ids/index.ts:78` declares the unused prefix. `packages/db/src/schema/stats.ts:16` states the natural-key rule. `packages/server/src/domain/admin/contract/errors.ts:7` declares the unused refusal code.
