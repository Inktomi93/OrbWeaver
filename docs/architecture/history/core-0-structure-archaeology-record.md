---
kind: history
status: superseded
updated: 2026-07-13
---

# Core-0 structure — archaeology record

> Frozen 2026-07-13, extracted from Core-0-Architecture-and-Structure.md. The neo-tavern-comparison and
> porting-era material that justified orbweaver's shape while the remake was in flight. The remake landed;
> this is why-we-got-here, not current law. Live structure law is Core-0-Architecture-and-Structure.md.

## Why a remake (neo-tavern → orbweaver)

neo-tavern's *architecture* was sound (clean layer cake, machine-enforced) but three things rotted in
place and were cheaper to rebuild than retrofit:

- **`domain/_shared` became a junk drawer** — primitives, cross-feature *services* (credentials,
  user-settings, role-clients), leaked feature-internals, and a misfiled driver concern all dumped
  together because there was no clean home for cross-cutting code.
- **Concepts fragmented across stores** — "a connection," "descriptive labels," "active persona" each
  had 2–6 homes with no partitioning rule for what lives where.
- **The frontend leaned on inherited SillyTavern patterns** that bit back.

Orbweaver kept what worked (the per-feature template) and fixed the rest by making the structure
self-documenting and the boundaries physics, not policy. The `domain/_shared` dissolution is recorded in
`Shared-Drawer-Dissolution-Map.md`.

## Working rule — "unwired ≠ worthless" (porting-era)

When porting from neo-tavern, "no current consumer / dead / unwired" was a prompt to evaluate intent, not
a delete signal. Much of it was SillyTavern-inherited or scaffolded intent that just never got wired (e.g.
`runOnEdit`, the non-chat `roleDefaults`, `chat_participants.activePersonaId`, the
declared-but-never-emitted `WiBusEvent` entry variants). The default was **understand the intent → wire or
modernize it**; delete only genuinely superseded residue (a per-item judgment, never a reflex).
Auto-deleting on "no consumer" throws away half-built features the remake wanted.

## Changes vs neo-tavern (server tiers)

`foundation`/`infra`/`transport`/`entry` became **named tiers** (were loose under `server/`), so the cake
is visible in the tree; `kit/` gave server-only primitives a real home; **`domain/_shared` was deleted** —
its contents redistributed (primitives → `kit`; services → their own feature; feature-internals → home;
rate-limit → transport).
