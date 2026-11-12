---
kind: adr
status: active
updated: 2026-11-12
---

# Global roles are owner, admin and user

## Context

Not recorded in the ledger row.

## Decision

Global roles: `owner | admin | user`. `owner` = the single box holder (only role that grants/revokes admin; never demotable; exactly one). `admin` = delegated (cannot grant admin). `can(p,'admin',global)` passes for owner ∪ admin; `requireOwner` gates admin grant/revoke. Owner ⊇ admin lives ONLY in the `can()` seam — no scattered `role === 'admin'`. Inference connections, including local endpoints and the in-process light tier, belong to the principal who configured or selected them; there is no box-owner compute pool, ambient count budget, or credential fallback inherited merely from a global role. The one membership-scoped exception is D18/D19: the current room host explicitly accepts liability for that room's turns, including member-triggered turns, and a host handoff moves that liability for subsequent turns. Per-chat `chat_participants.role: host|member` is an orthogonal axis. Extended by D65 for OIDC group-derived roles. Homes: `@orb/contracts/identity` · `domain/admin/guard.ts`.

A delegated admin does not act on the box owner's own resources. Only the owner resets the owner's password and lists or revokes the owner's sessions. Only the owner cancels, retries, retunes, pauses or deletes a workload or schedule the owner owns or funds. Each home decides through `can()` and the kernel predicates in `packages/server/src/domain/admin/guard.ts` (`isOwner`, `isBootstrapOwnerRole`); none compares a role itself. Homes: `packages/server/src/domain/admin/verbs/reset-password.ts` · `packages/server/src/domain/admin/verbs/sessions.ts` · `mayActOnRow` in `packages/server/src/domain/workloads/substrate/authorize.ts`.

Reads follow what is built. An admin does not list the owner's sessions. An admin still sees every owner's workloads and schedules, scoped by their owner and funder columns. A workload or schedule an admin sees but may not act on answers not found, as an unknown id does. The owner stated no preference on workload reads; hiding the owner's rows from an admin needs its own decision.

`tests/server/domain/admin/verbs/owner-sessions.int.test.ts` and `tests/server/domain/workloads/verbs/owner-workloads.int.test.ts` drive the session and workload refusals through the router as an admin, with the owner and a member's rows as controls.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
