---
kind: adr
status: active
updated: 2026-09-23
---

# The permissions model has one page: Spine-Identity-and-Auth

## Context

Split off [ADR 0121](0121-the-close-out-ruling-for-the-preset-and.md), the close-out ruling for the preset and actor-state programs, whose seven independent clauses (A–G) pushed it over the 8 KiB ADR cap. This clause stands alone, as the original states.

## Decision

**(B) The permissions model has ONE page: `Spine-Identity-and-Auth.md`.** Three layers, one doc: APP tier (`user|admin|owner` via `GlobalAction` — a global admin grants ZERO host power inside a room) · ROOM tier (`host|member` via membership + `can()` on OWNERLESS chats — the creator becomes the host, functionally theirs; structurally there is no owner column, host is a TRANSFERABLE roster role and membership is the scope) · VISIBILITY tier (DEFAULT-VISIBLE, with the host's three OPTIONS to limit). Its §2c–§2e carry the three-layer model, the pointer-style who-owns-what map (the `ownerid-registry` allowlist + the `own-tables-only` derived schema→domain map are the machine-checked truth — the page never duplicates them), and the BY-DESIGN do-not-re-flag register. **A visibility FINDING must name WHICH host option or floor it bypasses** — a report that a member sees admitted history is not a finding, it is the design.

## Consequences

`Spine-Identity-and-Auth.md` is the one page for the three permission layers. A visibility finding must name which host option or floor it bypasses; a report that a member sees admitted history is the design, not a finding.

## Alternatives rejected

Split the permissions model across per-tier docs (rejected: two copies of one model disagree, [ADR 0164](0164-docs-plans-adrs.md)'s one-writer-for-structure discipline applied to prose).
