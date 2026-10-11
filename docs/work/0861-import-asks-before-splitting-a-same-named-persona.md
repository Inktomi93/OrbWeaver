---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: import
---

# Import asks before splitting a same-named persona

## What

Persona import is additive: a persona with the same folded name but different content lands as a second persona under the next free name (persona/verbs/import.ts:3-6, persona/persistence/import-write.ts:2-5, nextFreeName), and its chats link to the copy. The owner's SillyTavern 'Nate' became 'Nate 2' beside his Orbweaver 'Nate'.

## Why

Owner ruling replaces the silent additive rule: he expected same-named personas to merge, and silent renames split his chats.

## Done when

The import review lists every same-name, different-content persona collision with two choices, Merge into the existing persona (default: chats and user turns link to the existing persona, its content is kept) or Keep both (today's next-free-name copy); no collision is resolved silently; the choice applies to both the profile import and chat bundles in the same run; the persona import header comments and any ADR or law recording the additive rule are amended; integration tests cover merge and keep-both, and a CT covers the review choice.

## Evidence

Filled at landing: what ran and where its output is.
