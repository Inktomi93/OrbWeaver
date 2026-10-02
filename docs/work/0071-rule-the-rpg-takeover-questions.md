---
kind: decision
status: blocked
updated: 2026-10-02
priority: P3
area: rpg
blocked: owner
plan: rpg
---

# Rule the rpg takeover questions

## What

Keep the existing resource-orb presentation. Do not add a stone-and-parchment theme. Encounter placement stays unchanged pending an owner decision. Full-game steering stays parked with the RPG program. The remaining choices live in `docs/plans/rpg/design.md`. Remove the unused packaged SPECIAL template and catalog through work item 0357. Preserve working rulesets, manual editing and saved profiles.

## Why

The context panel program shipped the takeover but left these four questions open. They are recorded only in the rpg plan, which is not a queue.

## Done when

Each question has a ruling recorded in the rpg plan or an ADR, and any build work it implies is filed as a work item.

## Evidence

The owner rejected the optional theme and retained the existing resource orbs. Encounter placement and full-game steering remain deferred. Resume only when the owner requests those decisions. The launch audit also found `RPG_PACKAGED_PROFILE_BY_KEY` has only test consumers. The stat-profile editor does not expose the picker its source comments describe. The owner chose removal under work item 0357; this does not reopen full-game steering.
