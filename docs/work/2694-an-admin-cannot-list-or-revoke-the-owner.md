---
kind: bug
status: doing
updated: 2026-11-12
priority: P1
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# An admin cannot list or revoke the owner's sessions

## What

`packages/server/src/domain/admin/verbs/sessions.ts` gates `listSessions`, `revokeSession` and `revokeUserSessions` on `requireAdmin` alone. None refuses an owner target, unlike the role, enabled, identity link and password reset verbs, which check the bootstrap owner role. A delegated admin can read the owner's session list and end every owner session, repeatedly. The client hides only part of it: the share card filters the owner out, and the admin user row still offers the owner's sessions menu to an admin.

## Why

A delegated admin can lock the owner out of their own install, and the only thing in the way is a client filter.

## Done when

The three verbs refuse an owner target unless the caller is the owner, with the session's user resolved first for a single-session revoke, and a test per verb through the real router with an admin principal shows the refusal and an owner caller still succeeding. The admin user row offers the owner's sessions menu only to the owner.

## Evidence

Filled at landing: what ran and where its output is.
