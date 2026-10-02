---
kind: adr
status: active
updated: 2026-10-02
supersedes: docs/adr/0086-the-rpg-stat-profile-spine-the-lite-full.md
---

# RPG profiles follow live rulesets

## Context

The live rulesets use Freeform and D20 profile data. The SPECIAL template and packaged-profile catalog have no product consumers.

## Decision

Ship `RPG_PROFILE_FREEFORM` and `RPG_PROFILE_D20` in `packages/contracts/src/rpg/profile.ts` for the live rulesets. Remove the SPECIAL template and packaged-profile catalog. Preserve the stat-profile storage grammar, saved custom profiles, manual editing and additive ruleset application. Other stat-profile commitments in D86 remain unchanged.

## Consequences

Saved profiles remain readable without a data migration. Packaged-profile picker promises are absent because the editor supports manual stat editing.

## Alternatives rejected

Keep unused template data for a profile picker that is not built.
