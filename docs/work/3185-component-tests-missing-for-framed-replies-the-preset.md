---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tests
plan: test-foundation
---

# Component tests missing for framed replies, the preset readout binding notice and the admin sessions dialog

## What

These client component cases do not exist: (a) A styled reply on a tierB row that streams through the inert path and then swaps to its frame: no case asserts the transcript's scroll anchor holds across the swap. (b) A guest in a shared room: the styled-reply CT drives the owner's view only, and no case mounts a member's view of a framed reply with the host's display scripts broadcast. (c) The preset readout binding notice: no CT mounts it, so its dismiss control's accessible name, the fall back to the chat-free view and its fit at a phone width and enlarged text are unproven. (d) The admin user sessions dialog, the one caller of QueryInlineStates: no CT drives its pending, error and empty lines.

## Why

Each is a regression that ships silently today: a scroll jump on a framed reply, a member seeing a different tier than the host, a lost dismiss name, a swapped inline state branch.

## Done when

Each of these has a component test through its production door: a streamed styled reply asserts the scroll anchor does not move when the frame replaces the inert render; a member session asserts the same frame or inert path the host sees and cannot raise the row's tier; the readout CT finds the dismiss by name, presses it and asserts the chat-free view at phone width and enlarged text; the sessions dialog CT drives held, failed and empty reads and asserts each line.

## Evidence

Filled at landing: what ran and where its output is.
