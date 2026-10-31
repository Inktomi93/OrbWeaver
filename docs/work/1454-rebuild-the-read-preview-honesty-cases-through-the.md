---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: chat
plan: test-foundation
---

# Rebuild the read preview honesty cases through the composed root

## What

Rebuild the Open preview-honesty group of the legacy server/domain/chat/verbs/read.int.test.ts through the composed root: budget partition, preset override, GM preset redirect, persona-swap leak, consent set, narrator shape, viewer zone and the no-persist check. The case map is the chat section of docs/plans/test-foundation/design.md.

## Why

The preview is the owner's honesty instrument for what a model sees, and the persona-swap case guards a member-visible leak class.

## Done when

Each case is rebuilt as a server integration test with a planted-defect red, and the register row for read.int.test.ts names no preview remainder.

## Evidence

[Read preview honesty](../../tests/server/domain/chat/verbs/read-preview-honesty.int.test.ts) rebuilds the group through the composed root. Each case reads the host preview and, where a turn can follow, compares it with the provider bytes of that turn. The [chat case map](../plans/test-foundation/design.md#selected-case-map-chat-teaching-identity-read-backfill-and-persona-resolution) records the decisions: the game state block stays in turn teaching.

Each guard failed against a planted production defect in `packages/server/src/domain/chat/verbs/read.ts`, `packages/server/src/domain/chat/assembly/budget.ts` or `packages/server/src/domain/preset/persistence/queries.ts`, and every file was restored byte for byte:

- The preview flushes its `{{setvar}}` writes: the no-persist case reads the variable.
- The budget total leaves out history, or the preview skips speaker shaping: the partition case fails on the sum or on the missing second card.
- The rack partition runs in reverse: the rack-order check fails.
- A blanket window, or a preview that never flags a guessed window: the ceiling case fails.
- The override is dropped, or a preset read ignores the owner: the override case fails, and the second plant renders another owner's private preset.
- The GM redirect is skipped, or outranks an explicit override: the game case fails.
- The anchor comes from the first canon stamp: the swapped-out persona stays in the preview.
- The preview reads past seats: a kicked member's persona reaches the host's preview, the leak class this group guards.
- The consent set ignores a disabled member: that member's lore stays in.
- Every room shapes as per-speaker, or every room as narrator: the room's own turn does not carry its preview.
- The viewer zone is dropped from the assembly or from the template readout: the clock case fails.
- The guided steer is dropped: the steer case fails.
- The anchor voice in `packages/server/src/domain/chat/assembly/turn-personas.ts` takes the first seated human with a persona: `{{user}}` binds to the member.
- The template readout ignores the inspected preset, or an unknown rack row falls back to the first row: the readout case fails.
