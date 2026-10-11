---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: chat
lane: wt/agent-ae3ca59f03fa35f89
---

# The room name says who you are chatting with and edits in place

## What

A new room's title defaults to the character plus a date (for example 'Hikari — Oct 3, 2026'), which reads as a date stamp and truncates to the date. The title is not editable from the header.

## Why

Owner: the date title is confusing and he cannot tell who he is chatting with at a glance.

## Done when

The header leads with the participants (character names, and avatar where the header shows one) and shows the room's own name only when the user set one, with the creation date as secondary metadata; clicking the title renames the room inline (Enter saves, Escape cancels, pending submit guarded), with CTs for display and rename.

## Evidence

Filled at landing: what ran and where its output is.

Later owner rulings: the room title and its chips always live in the center chat header (no hand-off into the context panel) in the app's standard type, and imported names with a duplicate (N) suffix count as unnamed. The context pane's header is its own tabs, moved up from the bottom (one tab strip), on the shared 48px line with a close control.

Orchestrator call within the owner's tab ruling: it overrides the earlier universal foot rail; every context pane gets one header tablist with a close control, the kicker is dropped, and game rooms keep their state rail as panel content under the tabs.
