---
kind: adr
status: active
updated: 2026-09-23
---

# A chat row exists from the creation click

## Context

A new chat lived only in client state until the first send. That draft plane duplicated the room: a second state store, a commit bridge that mirrored server logic, twin draft and committed surfaces, and features that could not work because the room had no row.

## Decision

The Start click awaits `chat.startChat` and mints the real row, roster and seeded greetings in one batch; Back or dismiss before that click mints nothing. An unclaimed room is a husk: `chats.startedAt` is null until the first user message, generated turn, or explicit host write, stamped by the one `claimChat` step the qualifying verbs call. Forks and imports are born claimed. Husks are hidden from every member's library list, like temporary chats. A husk is reaped best-effort when the host navigates away with an empty composer (`chat.reapHusk`, which re-checks the predicate on the server) and by a fixed-TTL sweep; each reap emits `chatDeleted`. Generating an opening is an ordinary post-creation action, never a creation-time option. Seeded greetings stay steppable and editable until the first user turn.

## Consequences

One room plane: every surface renders committed rows only. The first frame is warm because `startChat` returns the full chat detail. Both reap paths repeat the full predicate in the delete so a room claimed mid-reap survives. Creation costs one round trip at the Start click.

## Alternatives rejected

- Keep a thin draft for blank chats only: it keeps the whole client handle fork alive for one flow.
- Mint the row on surface entry: it creates husks on misclicks.
- Show husks in the list with a New treatment: the list fills with untitled rows.
- Reap only by TTL, or only on navigation: navigation alone leaks on crash or tab kill; TTL alone leaves stale husks for a day.
- Claim only on a message or turn: it would reap a room the host spent effort configuring.
- A per-user husk TTL setting: a knob nobody asked for; the constant can become a setting when it pinches.
